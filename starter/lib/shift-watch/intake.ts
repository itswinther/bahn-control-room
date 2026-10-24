// Shift Watch's front door for drivers: match the message to the driver's job, answer at once with a
// "you'll hear back by" time, answer routine questions from the records, send safety straight to the
// shift lead, and wake the order's agent.
import Anthropic from "@anthropic-ai/sdk"
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import type { DriverMessage, DriverMessageResponse, QuickReply } from "@/lib/contract"
import { createRun, runOrderAgent } from "@/lib/agents/order-agent"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { orders, relatedRecords } from "@/lib/schema"
import { driverMessages } from "@/lib/schema-ours"
import { buildCase, toDriverMessage } from "./case"
import { readByRules, type Reading } from "./read"

const HEAR_BACK_MINUTES = 15
let client: Anthropic | null = null
const live = () => process.env.AGENT_MODE === "live" && !!process.env.ANTHROPIC_API_KEY
const MODEL = () => process.env.AGENT_MODEL ?? "claude-sonnet-5-5"

async function readByClaude(text: string): Promise<Reading> {
  const response = await (client ??= new Anthropic()).messages.create({
    model: MODEL(), max_tokens: 1000, output_config: { effort: "low", format: { type: "json_schema", schema: {
      type: "object", additionalProperties: false, required: ["language", "intent", "limit_minutes", "english"],
      properties: {
        language: { type: "string", description: "ISO 639-1 code of the message" },
        intent: { type: "string", enum: ["SAFETY", "BOOKING_QUESTION", "EXPENSE_QUESTION", "KEYS_QUESTION", "ORDER"], description: "SAFETY if the driver, the car or anyone may be unsafe" },
        limit_minutes: { type: ["integer", "null"], description: "Minutes the driver says they can still wait, if stated" },
        english: { type: ["string", "null"], description: "English translation, or null if already English" },
      },
    } } },
    system: "You read one message from a freelance car-delivery driver to the operations team. Classify it; do not answer it.",
    messages: [{ role: "user", content: text }],
  })
  const block = response.content.find((b) => b.type === "text")
  return block?.type === "text" ? (JSON.parse(block.text) as Reading) : readByRules(text)
}

async function inLanguage(english: string, language: string): Promise<string> {
  if (language === "en" || !live()) return english
  const response = await (client ??= new Anthropic()).messages.create({
    model: MODEL(), max_tokens: 1000, output_config: { effort: "low" },
    system: `Translate the operations team's message to the driver into the language with ISO code "${language}". Keep times, references and names exactly. Reply with the translation only.`,
    messages: [{ role: "user", content: english }],
  })
  const block = response.content.find((b) => b.type === "text")
  return block?.type === "text" ? block.text.trim() : english
}

const hhmm = (iso: string) => iso.slice(11, 16)

/** The driver's jobs that are still open, with their references. */
async function activeJobs(driverId: string) {
  const rows = await db.select({ orderId: relatedRecords.orderId, details: relatedRecords.details }).from(relatedRecords)
    .where(eq(relatedRecords.collection, "work_assignments"))
  const open = rows.filter((r) => r.orderId && r.details.driver_id === driverId && ["ASSIGNED", "IN_PROGRESS"].includes(String(r.details.status)))
  const ids = [...new Set(open.map((r) => r.orderId!))]
  const refs = ids.length ? await db.select({ id: orders.id, reference: orders.reference }).from(orders).where(inArray(orders.id, ids)) : []
  return refs
}

async function routineAnswer(orderId: string, driverId: string, intent: Reading["intent"]): Promise<string | null> {
  if (intent === "BOOKING_QUESTION") {
    const c = await buildCase(orderId)
    if (!c) return null
    const lines = c.legs.filter((l) => l.state !== "QUOTED").map((l) => `${l.state === "BOOKED" ? "Booked" : l.state === "REQUESTED" ? "Requested, not confirmed" : "Not booked"}: ${l.label}${l.reference ? ` (${l.reference})` : ""}${l.check_in_cutoff_at ? `, check-in closes ${hhmm(l.check_in_cutoff_at)} UTC` : ""}`)
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
  const jobs = await activeJobs(driverId)
  const picked = jobs.find((j) => j.id === opts.quickReplyValue)
  const job = picked ?? (jobs.length === 1 ? jobs[0] : null)
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

  const reading = live() ? await readByClaude(subject).catch(() => readByRules(subject)) : readByRules(subject)
  const message = await store({
    driverId, orderId: job?.id ?? null, direction: "IN", author: "driver", text, language: reading.language,
    translation: reading.english, quickReplies: [], hearBackBy: null, simulated: !!opts.simulated, intent: reading.intent,
    repeatsMessageId: null, status: "SENT",
  })

  if (!job) {
    const quickReplies: QuickReply[] = jobs.map((j) => ({ kind: "CHOICE", label: j.reference, value: j.id }))
    const ask = jobs.length ? "Thanks. Which car is this about?" : "Thanks. We can't find an active job for you right now. A person will get back to you."
    const reply = await store({
      driverId, orderId: null, direction: "OUT", author: "shift-watch", text: await inLanguage(ask, reading.language), language: reading.language,
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
  const routine = await routineAnswer(job.id, driverId, reading.intent)
  const english = reading.intent === "SAFETY"
    ? `Thanks for telling us. Please stay somewhere safe. A person is taking over now and will contact you by ${hhmm(promised)} UTC.`
    : routine ?? (promised === earlier ? `Got it, added to your earlier message. You'll still hear from us by ${hhmm(promised)} UTC.` : `Got it, we're on it. You'll hear from us by ${hhmm(promised)} UTC.`)
  // A routine answer from the records closes the question; anything else is a promise with a time.
  const reply = await store({
    driverId, orderId: job.id, direction: "OUT", author: "shift-watch", text: await inLanguage(english, reading.language), language: reading.language,
    translation: reading.language === "en" ? null : english, quickReplies: [], hearBackBy: routine ? null : promised, simulated: false, intent: null,
    repeatsMessageId: null, status: "SENT",
  })
  if (routine) return { message, reply, run_id: null }

  const runReq = { order_id: job.id, reason: "DRIVER_MESSAGE" as const, reason_detail: `Driver message relayed by Shift Watch at ${hhmm(message.created_at)}: '${reading.english ?? subject}'${reading.limit_minutes ? ` (says they can wait ${reading.limit_minutes} more minutes)` : ""}` }
  const runId = await createRun(runReq)
  if (runId) void runOrderAgent(runId, runReq)
  return { message, reply, run_id: runId }
}

export async function thread(driverId: string): Promise<DriverMessage[]> {
  const rows = await db.select().from(driverMessages).where(eq(driverMessages.driverId, driverId)).orderBy(asc(driverMessages.createdAt))
  // The driver only sees what was actually sent to them.
  return rows.filter((m) => m.direction === "IN" || m.status === "SENT").map(toDriverMessage)
}
