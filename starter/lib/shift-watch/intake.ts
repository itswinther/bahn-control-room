// Shift Watch's front door for drivers: match the message to the driver's job, answer at once with a
// "you'll hear back by" time, answer routine questions from the records, send safety straight to the
// shift lead, and wake the order's agent.
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import type { DriverMessage, DriverMessageResponse, QuickReply } from "@/lib/contract"
import { createRun, runOrderAgent } from "@/lib/agents/order-agent"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { orders, relatedRecords } from "@/lib/schema"
import { driverMessages } from "@/lib/schema-ours"
import { buildCase, toDriverMessage } from "./case"
import { readByClaude, readByRules, SAFETY_LINE, type Reading } from "./read"
import { fmtClock } from "@/lib/present/time"
import { languageName } from "./language"
import { toDriverLanguage } from "./translate"
import { CONFIRM_YES, confirmYes } from "./confirm"
import { driverZone, localTime, utcOffset } from "./zone"

const HEAR_BACK_MINUTES = 15
const live = () => process.env.AGENT_MODE === "live" && !!process.env.ANTHROPIC_API_KEY

const hhmm = (iso: string) => iso.slice(11, 16)

/** The driver's jobs that are still open, with their references. */
async function activeJobs(driverId: string) {
  const rows = await db.select({ orderId: relatedRecords.orderId, details: relatedRecords.details }).from(relatedRecords)
    .where(eq(relatedRecords.collection, "work_assignments"))
  const open = rows.filter((r) => r.orderId && r.details.driver_id === driverId && ["ASSIGNED", "IN_PROGRESS"].includes(String(r.details.status)))
  const ids = [...new Set(open.map((r) => r.orderId!))]
  const refs = ids.length ? await db.select({ id: orders.id, reference: orders.reference }).from(orders).where(inArray(orders.id, ids)) : []
  return refs.map((r) => ({ ...r, moving: open.some((o) => o.orderId === r.id && o.details.status === "IN_PROGRESS") }))
}

async function routineAnswer(orderId: string, driverId: string, intent: Reading["intent"], local: (iso: string) => string): Promise<string | null> {
  if (intent === "BOOKING_QUESTION") {
    const c = await buildCase(orderId)
    if (!c) return null
    const lines = c.legs.filter((l) => l.state !== "QUOTED").map((l) => `${l.state === "BOOKED" ? "Booked" : l.state === "REQUESTED" ? "Requested, not confirmed" : "Not booked"}: ${l.label}${l.reference ? ` (${l.reference})` : ""}${l.check_in_cutoff_at ? `, check-in closes ${local(l.check_in_cutoff_at)}` : ""}`)
    return lines.length ? `Here is what's on record for your trip:\n${lines.join("\n")}` : "Nothing is booked for this trip yet. We're on it."
  }
  if (intent === "EXPENSE_QUESTION") {
    const rows = await db.select({ details: relatedRecords.details }).from(relatedRecords)
      .where(and(eq(relatedRecords.collection, "expenses"), eq(relatedRecords.orderId, orderId)))
    const mine = rows.map((r) => r.details).filter((e) => e.driver_id === driverId && e.status !== "SUPERSEDED")
    // Never "paid" unless a payment is recorded: approved is not paid.
    return mine.length ? `Your claims on this job:\n${mine.map((e) => `${String(e.kind).toLowerCase().replace(/_/g, " ")} EUR ${(Number(e.amount_cents) / 100).toFixed(2)}: ${String(e.status).toLowerCase()}${e.status === "APPROVED" ? " (not paid yet)" : ""}`).join("\n")}` : null
  }
  if (intent === "KEYS_QUESTION") return "Standing rule: keep the keys with you until the owner approves another holder. Never leave keys or the car unattended. If you need to hand them over, ask us first."
  return null
}

/** The hear-back time we gave this driver on this job that is still ahead and not yet answered. */
async function openPromise(driverId: string, orderId: string, now: string): Promise<string | null> {
  const out = await db.select({ hearBackBy: driverMessages.hearBackBy, status: driverMessages.status, createdAt: driverMessages.createdAt }).from(driverMessages)
    .where(and(eq(driverMessages.driverId, driverId), eq(driverMessages.orderId, orderId), eq(driverMessages.direction, "OUT"))).orderBy(desc(driverMessages.createdAt))
  const last = out.find((m) => m.hearBackBy)
  if (!last || last.hearBackBy! <= now) return null
  return out.some((m) => m.status === "SENT" && !m.hearBackBy && m.createdAt > last.createdAt) ? null : last.hearBackBy
}

async function store(row: Omit<typeof driverMessages.$inferInsert, "id" | "createdAt">) {
  const [saved] = await db.insert(driverMessages).values({ id: `dm_${crypto.randomUUID().slice(0, 8)}`, createdAt: nowIso(), ...row }).returning()
  return toDriverMessage(saved)
}

export async function intake(driverId: string, text: string, opts: { quickReplyValue?: string; simulated?: boolean } = {}): Promise<DriverMessageResponse> {
  // "Yes" to the day-before check (confirm.ts) closes it; "No" goes on as an ordinary message to the agent.
  const confirmed = opts.quickReplyValue === CONFIRM_YES ? await confirmYes(driverId, text) : null
  if (confirmed) return confirmed
  const jobs = await activeJobs(driverId)
  const picked = jobs.find((j) => j.id === opts.quickReplyValue)
  let job = picked ?? (jobs.length === 1 ? jobs[0] : null)
  // After "which car?", the driver's pick answers it: file their earlier message under that job and act on it.
  let subject = text
  if (picked) {
    const [orphan] = await db.select().from(driverMessages)
      .where(and(eq(driverMessages.driverId, driverId), eq(driverMessages.direction, "IN"), isNull(driverMessages.orderId)))
      .orderBy(desc(driverMessages.createdAt)).limit(1)
    if (orphan) {
      await db.update(driverMessages).set({ orderId: picked.id }).where(eq(driverMessages.id, orphan.id))
      subject = orphan.text
    }
  }

  let byRules = !live()
  const reading = live() ? await readByClaude(subject).catch(() => ((byRules = true), readByRules(subject))) : readByRules(subject)
  // Safety if either reader says so: the keywords (on Claude's English too) can add safety, never remove it.
  if (reading.intent !== "SAFETY" && readByRules(reading.english ?? subject).intent === "SAFETY") reading.intent = "SAFETY"
  // A safety message can't wait for "which car?": the one car being driven right now is the one.
  if (!job && reading.intent === "SAFETY" && jobs.filter((j) => j.moving).length === 1) job = jobs.find((j) => j.moving)!
  const message = await store({
    driverId, orderId: job?.id ?? null, direction: "IN", author: "driver", text, language: reading.language,
    translation: reading.english, unclear: reading.unclear, quickReplies: [], hearBackBy: null, simulated: !!opts.simulated, intent: reading.intent,
    repeatsMessageId: null, status: "SENT",
  })

  if (!job) {
    const quickReplies: QuickReply[] = jobs.map((j) => ({ kind: "CHOICE", label: j.reference, value: j.id }))
    const ask = reading.intent === "SAFETY" ? "Thanks for telling us. Please stay somewhere safe. Which car is this about? A person takes over as soon as you pick it."
      : jobs.length ? "Thanks. Which car is this about?" : "Thanks. We can't find an active job for you right now. A person will get back to you."
    const reply = await store({
      driverId, orderId: null, direction: "OUT", author: "shift-watch", text: await toDriverLanguage(ask, reading.language), language: reading.language,
      translation: reading.language === "en" ? null : ask, quickReplies, hearBackBy: null, simulated: false, intent: jobs.length ? "WHICH_CAR" : null,
      repeatsMessageId: null, status: "SENT",
    })
    return { message, reply, run_id: null }
  }

  const now = Date.parse(nowIso())
  const fresh = new Date(now + Math.min(HEAR_BACK_MINUTES, reading.limit_minutes ?? HEAR_BACK_MINUTES) * 60_000).toISOString()
  // A driver who writes again before we've answered keeps the earlier promise, unless they now need it sooner.
  const earlier = await openPromise(driverId, job.id, nowIso())
  const promised = earlier && earlier <= fresh ? earlier : fresh
  // Drivers get their own clock; the records and operators use UTC.
  const zone = await driverZone(job.id)
  const local = (iso: string) => localTime(iso, zone, nowIso())
  const routine = await routineAnswer(job.id, driverId, reading.intent, local)
  // A routine answer closes the question only when Claude read it. Keywords misread ("the ferry I was
  // booked on" isn't a booking question), so then the driver gets the answer and a promise, and the agent wakes.
  // The keys answer is a standing rule, not an answer to their situation ("I lost the keys" was read as a keys
  // question in one live run), so it never closes the question either.
  const closes = !!routine && !byRules && reading.intent !== "KEYS_QUESTION"
  // The safety reply is fixed text in the driver's language, so it never waits on, or depends on, a model.
  const safety = (language: string) => SAFETY_LINE[language]?.(zone ? fmtClock(promised, zone.zone) : `${hhmm(promised)} UTC`, zone?.place ?? null)
  const english = reading.intent === "SAFETY" ? safety("en")!
    : routine ? `${routine}${closes ? "" : `\nWe'll also look at your message and get back to you by ${local(promised)}.`}`
    : promised === earlier ? `Got it, added to your earlier message. You'll still hear from us by ${local(promised)}.` : `Got it, we're on it. You'll hear from us by ${local(promised)}.`
  const fixed = reading.intent === "SAFETY" ? safety(reading.language) : undefined
  const reply = await store({
    driverId, orderId: job.id, direction: "OUT", author: "shift-watch", text: fixed ?? await toDriverLanguage(english, reading.language), language: reading.language,
    translation: reading.language === "en" ? null : english, quickReplies: [], hearBackBy: closes ? null : promised, simulated: false, intent: null,
    repeatsMessageId: null, status: "SENT",
  })
  if (closes) return { message, reply, run_id: null }

  // The agent gets the driver's own words beside the English, and what the message leaves open, so it asks rather than assumes.
  const said = reading.english ? `'${reading.english}' (Shift Watch's English reading; the driver wrote in ${languageName(reading.language)}: '${subject}')` : `'${subject}'`
  const gaps = reading.unclear.length ? ` Not clear from the message: ${reading.unclear.join("; ")}. Ask the driver; don't assume.` : ""
  const clock = zone ? ` Times the driver writes are local: ${zone.place} time (${zone.zone}, ${utcOffset(zone, message.created_at)}).` : ""
  const runReq = { order_id: job.id, reason: "DRIVER_MESSAGE" as const, reason_detail: `Driver message relayed by Shift Watch at ${hhmm(message.created_at)} UTC: ${said}${reading.limit_minutes ? ` (says they can wait ${reading.limit_minutes} more minutes)` : ""}.${gaps}${clock}` }
  const runId = await createRun(runReq)
  if (runId) void runOrderAgent(runId, runReq)
  return { message, reply, run_id: runId }
}

export async function thread(driverId: string): Promise<DriverMessage[]> {
  const rows = await db.select().from(driverMessages).where(eq(driverMessages.driverId, driverId)).orderBy(asc(driverMessages.createdAt))
  // The driver only sees what was actually sent to them.
  // A message a person just released waits out its undo window before the driver sees it.
  const now = nowIso()
  return rows.filter((m) => m.direction === "IN" || (m.status === "SENT" && m.createdAt <= now)).map(toDriverMessage)
}
