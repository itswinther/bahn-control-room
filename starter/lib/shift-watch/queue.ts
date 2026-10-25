// The decision queue: what needs a person now, worked out by rules on every request against the
// demo clock, so it still works when the agents are down. Safety first, then earliest deadline.
import { and, eq, inArray } from "drizzle-orm"
import type { CardOutcome, Desk, QueueItem, QueueResponse } from "@/lib/contract"
import { agentMode } from "@/lib/agents/order-agent"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { alerts, conversations, messages, orders, relatedRecords } from "@/lib/schema"
import { agentRuns, agentSteps, driverMessages, orderStatus, proposals } from "@/lib/schema-ours"
import { languageNeed, type LanguageNeed, type Team } from "./language"
import { CONFIRM_YES, REPLY_WITHIN_MS } from "./confirm"
import { readByRules } from "./read"

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === "string" ? v : null)
const MINUTE = 60_000

/** Where an alert goes when nobody owns it, by its signal. */
const DESK_BY_SIGNAL: [RegExp, Desk][] = [
  [/FERRY|TRAVEL/, "ops-travel"], [/DRIVER_AVAILABILITY|POSITIONING/, "ops-dispatch"],
  [/RELEASE|SITE_ACCESS/, "ops-readiness"], [/PICKUP_PROOF/, "ops-evidence"],
  [/DELIVERY_ACCESS|PROOF_REVIEW|INVOICE/, "ops-support"],
]
const deskFor = (signal: string): Desk => DESK_BY_SIGNAL.find(([re]) => re.test(signal))?.[1] ?? "ops-shift"

/** Tools whose results are worth showing as "already checked" on a card. */
const SHOWN_TOOLS = new Set(["check_ferry_capacity", "check_driver_rest", "check_booking_outcome", "ask_site", "ask_driver"])

/** Bahn's lookup commands, and the agent tool that does the same lookup. */
const DONE_BY: [RegExp, string][] = [[/^travel\.refresh_/, "check_ferry_capacity"], [/verify_booking_outcome$/, "check_booking_outcome"]]

/** `ours`: a commitment Shift Watch made (a promise to a driver, a held message), which escalates if missed. */
type Reason = { text: string; owner: Desk; deadline: string | null; deadlineReason: string | null; ours?: true; decideBy?: true }

const DESK_NAME: Record<string, string> = {
  "ops-dispatch": "Driver marketplace", "ops-travel": "Driver travel", "ops-readiness": "Readiness desk", "ops-support": "Support desk",
  "ops-evidence": "Handover evidence", "ops-expenses": "Driver expense review", "ops-shift": "Shift lead", "ops-intake": "Order intake",
  "ops-planning": "Transport planning", "ops-import": "Import operations", "ops-finance": "Cancellation and payment review",
}
/** Who wrote a message in Bahn's threads, for "<who> wrote in Finnish". Operators and agents don't need a reader. */
const WRITER: Record<string, string> = { driver: "The driver", customer: "The customer", site_contact: "The site", handoff_contact: "The person receiving the car" }
const label = (signal: string) => signal.toLowerCase().replace(/_/g, " ")
/** "09:15", or "19 Oct 11:39" when it isn't today on the demo clock. */
const when = (iso: string, now: string) => iso.slice(0, 10) === now.slice(0, 10) ? iso.slice(11, 16)
  : `${Number(iso.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1]} ${iso.slice(11, 16)}`

/** `team`: a country team's view puts the cards in the language it reads first, after safety. */
export async function buildQueue(team?: Team): Promise<QueueResponse> {
  const now = nowIso()
  const nowMs = Date.parse(now)
  const [orderRows, alertRows, threadRows, related, ours, statusRows] = await Promise.all([
    db.select({ id: orders.id, reference: orders.reference, status: orders.status }).from(orders),
    db.select().from(alerts).where(inArray(alerts.status, ["OPEN", "ACKNOWLEDGED"])),
    db.select().from(conversations).where(eq(conversations.status, "OPEN")),
    db.select().from(relatedRecords).where(inArray(relatedRecords.collection, ["work_items", "incidents", "agent_proposals", "travel_reservations", "time_windows", "work_assignments"])),
    db.select().from(proposals).where(inArray(proposals.status, ["PENDING_REVIEW", "HELD", "APPROVED", "REJECTED", "EXECUTED", "FAILED"])),
    db.select().from(orderStatus),
  ])
  const chat = await db.select().from(driverMessages).orderBy(driverMessages.createdAt)
  const threadMessages = threadRows.length ? await db.select().from(messages).where(inArray(messages.conversationId, threadRows.map((c) => c.id))).orderBy(messages.authoredAt) : []
  const lookups = await db.select({ orderId: agentRuns.orderId, tool: agentSteps.tool, at: agentSteps.at }).from(agentSteps)
    .innerJoin(agentRuns, eq(agentRuns.id, agentSteps.runId))
    .where(and(eq(agentSteps.kind, "TOOL_CALL"), inArray(agentSteps.tool, DONE_BY.map(([, tool]) => tool))))
  const ref = new Map(orderRows.map((o) => [o.id, o.reference]))
  const byOrder = (collection: string) => {
    const map = new Map<string, Row[]>()
    for (const r of related) if (r.collection === collection && r.orderId) (map.get(r.orderId) ?? map.set(r.orderId, []).get(r.orderId)!).push(r.details)
    return map
  }
  const workItems = byOrder("work_items"), incidents = byOrder("incidents"), bahnProposals = byOrder("agent_proposals")
  const reservations = byOrder("travel_reservations"), windows = byOrder("time_windows")

  const safety = new Set<string>([
    ...alertRows.filter((a) => a.signal === "SAFETY_STOP").map((a) => a.orderId),
    ...[...incidents].filter(([, list]) => list.some((i) => i.kind === "VEHICLE_WARNING" && !i.resolved_at)).map(([id]) => id),
  ])

  // Loose ends, per order.
  const reasons = new Map<string, Reason[]>()
  const add = (orderId: string, r: Reason) => (reasons.get(orderId) ?? reasons.set(orderId, []).get(orderId)!).push(r)

  for (const [orderId, list] of workItems) for (const w of list) {
    if (w.status !== "OPEN") continue
    const due = s(w.due_at)
    const overdue = due && Date.parse(due) < nowMs
    add(orderId, { text: `${overdue ? "Overdue" : "Due"}: ${s(w.summary)}`, owner: (s(w.owner) as Desk) ?? "ops-shift", deadline: due, deadlineReason: overdue ? `Work item was due ${when(due!, now)}` : "Work item due" })
  }
  for (const a of alertRows) {
    const owner = s((a.details as Row).owner)
    // Owned is not handled: a high or critical alert stays in front of its owner until it's resolved.
    if (owner && ["high", "critical"].includes(a.severity)) add(a.orderId, { text: `${a.status === "OPEN" ? "Open" : "Acknowledged, not resolved"}: ${a.summary}`, owner: owner as Desk, deadline: null, deadlineReason: null })
    if (owner) continue
    add(a.orderId,{ text: `Alert with no owner: ${label(a.signal)}. Routed to ${DESK_NAME[deskFor(a.signal)]}.`, owner: deskFor(a.signal), deadline: null, deadlineReason: null })
  }
  // An approved lookup Bahn never ran is done once our agent has run the same check since.
  const ranSince = (orderId: string, command: string, since: string) => {
    const tool = DONE_BY.find(([re]) => re.test(command))?.[1]
    return !!tool && lookups.some((l) => l.orderId === orderId && l.tool === tool && l.at > since)
  }
  for (const [orderId, list] of bahnProposals) for (const p of list) {
    const reviewedAt = s((p.review as Row | null)?.reviewed_at)
    if (p.status !== "APPROVED_AWAITING_EXECUTION" || !reviewedAt || nowMs - Date.parse(reviewedAt) < 15 * MINUTE) continue
    if (ranSince(orderId, String(p.command), reviewedAt)) continue
    add(orderId, { text: `Approved at ${when(reviewedAt, now)} but not carried out: ${s(p.summary)}`, owner: (s((p.review as Row).reviewer_id) as Desk) ?? "ops-shift", deadline: reviewedAt, deadlineReason: "Approved, waiting to run" })
  }
  for (const c of threadRows) {
    const d = c.details as Row
    const next = s(d.next_check_at)
    if (!next || !s(d.waiting_on)) continue
    const late = Date.parse(next) < nowMs
    add(c.orderId, { text: `${late ? "Next check overdue" : "Next check"} (${when(next, now)}): waiting on ${label(s(d.waiting_on)!)}`, owner: (s(d.owner) as Desk) ?? "ops-support", deadline: next, deadlineReason: "Next check" })
  }
  // A driver who said how long they can wait, in a thread nobody has answered them in since.
  for (const c of threadRows) {
    const thread = threadMessages.filter((m) => m.conversationId === c.id)
    const last = thread.findLast((m) => m.authorType === "driver")
    const limit = last && readByRules(last.body).limit_minutes
    if (!last || !limit) continue
    const said = last.authoredAt.toISOString()
    if (thread.some((m) => m.authoredAt > last.authoredAt && s((m.details as Row).recipient_id) === s((last.details as Row).author_id))) continue
    const until = new Date(Date.parse(said) + limit * MINUTE).toISOString()
    add(c.orderId, { text: `Driver's wait ${Date.parse(until) < nowMs ? "ran out" : "ends"} at ${when(until, now)}: "${last.body.slice(0, 90)}"`, owner: (s((c.details as Row).owner) as Desk) ?? "ops-support", deadline: until, deadlineReason: `Driver said at ${when(said, now)} they could wait ${limit} more minutes`, decideBy: true })
  }
  // A booked driver who hasn't answered the day-before check (confirm.ts) in time: re-offer while there's a day left,
  // instead of hearing "can't do it" when the slot has come.
  for (const ask of chat.filter((m) => m.direction === "OUT" && m.orderId && m.quickReplies.some((q) => q.value === CONFIRM_YES))) {
    const replyBy = new Date(Date.parse(ask.createdAt) + REPLY_WITHIN_MS).toISOString()
    if (Date.parse(replyBy) > nowMs || chat.some((m) => m.direction === "IN" && m.driverId === ask.driverId && m.createdAt > ask.createdAt)) continue
    add(ask.orderId!, { text: `No reply from the driver: asked at ${when(ask.createdAt, now)} to confirm the pickup. Re-offer the job while there's time.`, owner: "ops-dispatch", deadline: replyBy, deadlineReason: `Driver was asked to confirm by ${when(replyBy, now)}` })
  }
  // The pickup slot has opened, the booked driver hasn't started and isn't talking to us: a no-show in the making.
  const assignments = byOrder("work_assignments")
  for (const [orderId, list] of windows) {
    const slot = list.find((w) => w.purpose === "SELECTED_PICKUP_SLOT" && w.is_selected && s(w.start_at) && Date.parse(s(w.start_at)!) <= nowMs)
    if (!slot || !(assignments.get(orderId) ?? []).some((a) => a.status === "ASSIGNED")) continue
    const from = Date.parse(s(slot.start_at)!) - 120 * MINUTE
    const talking = chat.some((m) => m.orderId === orderId && m.direction === "IN" && Date.parse(m.createdAt) >= from)
      || threadMessages.some((m) => m.orderId === orderId && m.authorType === "driver" && m.authoredAt.getTime() >= from)
    if (talking) continue
    add(orderId, { text: `Driver hasn't started: the pickup slot opened at ${when(s(slot.start_at)!, now)}, with no start in the app and no message from the driver.`, owner: "ops-dispatch", deadline: s(slot.end_at) ?? s(slot.start_at), deadlineReason: "Pickup slot closes" })
  }
  for (const st of statusRows) {
    if (st.nextCheckAt && Date.parse(st.nextCheckAt) < nowMs) add(st.orderId, { text: `Agent's next check (${when(st.nextCheckAt, now)}) is overdue: ${st.summary}`, owner: st.ownerDesk ?? "ops-shift", deadline: st.nextCheckAt, deadlineReason: "Agent's next check" })
  }

  // Drivers promised an answer: the latest "you'll hear back by" with no real answer after it.
  const promises = new Map<string, string>()
  for (const orderId of new Set(chat.map((m) => m.orderId).filter((x): x is string => !!x))) {
    const mine = chat.filter((m) => m.orderId === orderId)
    const promise = [...mine].reverse().find((m) => m.direction === "OUT" && m.hearBackBy)
    if (!promise) continue
    const asked = [...mine].reverse().find((m) => m.direction === "IN" && m.createdAt <= promise.createdAt)
    // A safety promise says a person will make contact, so only a person's message keeps it.
    const answered = mine.some((m) => m.direction === "OUT" && m.status === "SENT" && !m.hearBackBy && m.createdAt > promise.createdAt
      && (asked?.intent !== "SAFETY" || m.author === "operator"))
    if (answered) continue
    if (asked?.intent === "SAFETY") safety.add(orderId)
    promises.set(orderId, promise.hearBackBy!)
    const late = Date.parse(promise.hearBackBy!) < nowMs
    add(orderId, {
      text: `Driver ${late ? "still " : ""}waiting: "${(asked?.translation ?? asked?.text ?? "").slice(0, 90)}"`,
      owner: statusRows.find((s) => s.orderId === orderId)?.ownerDesk ?? (asked?.intent === "SAFETY" ? "ops-shift" : "ops-support"),
      deadline: promise.hearBackBy, deadlineReason: `Driver was promised an answer by ${when(promise.hearBackBy!, now)}`, ours: true,
    })
  }

  // Agent messages Shift Watch held: until a person sends, edits or discards one, the driver hears nothing.
  const held = new Map<string, string>()
  for (const m of chat) {
    if (m.direction !== "OUT" || m.status !== "HELD" || !m.orderId) continue
    held.set(m.orderId, m.id) // the latest one wins: chat is in time order
    add(m.orderId, {
      text: `Message to the driver held for a person: "${m.text.slice(0, 90)}"`,
      owner: statusRows.find((s) => s.orderId === m.orderId)?.ownerDesk ?? "ops-support",
      deadline: promises.get(m.orderId) ?? null, deadlineReason: promises.has(m.orderId) ? `Driver was promised an answer by ${when(promises.get(m.orderId)!, now)}` : null, ours: true,
    })
  }

  // A hard time in the order itself caps every deadline: a ferry check-in or a pickup slot still ahead.
  const hardDeadline = (orderId: string): { at: string; why: string } | null => {
    const picked = orderRows.find((o) => o.id === orderId)?.status !== "NEW" && orderRows.find((o) => o.id === orderId)?.status !== "WAITING_FOR_PICKUP"
    const times = [
      ...(reservations.get(orderId) ?? []).filter((r) => r.kind === "FERRY" && r.status === "BOOKED" && s(r.check_in_cutoff_at) && Date.parse(s(r.check_in_cutoff_at)!) > nowMs)
        .map((r) => ({ at: s(r.check_in_cutoff_at)!, why: "Ferry check-in closes" })),
      ...(picked ? [] : (windows.get(orderId) ?? []).filter((w) => w.purpose === "SELECTED_PICKUP_SLOT" && w.is_selected && s(w.start_at) && Date.parse(s(w.start_at)!) > nowMs)
        .map((w) => ({ at: s(w.start_at)!, why: "Pickup slot starts" }))),
    ].sort((a, b) => a.at.localeCompare(b.at))
    return times[0] ?? null
  }

  const items: QueueItem[] = []
  const covered = new Set<string>()

  // Agent proposals waiting for a person, and ones a person decided in the last few minutes (failed ones
  // stay until dealt with), so a decided card keeps its place and shows what happened. An order's loose
  // ends go on its proposal card.
  const shown = ours.filter((p) => ["PENDING_REVIEW", "HELD", "FAILED"].includes(p.status) || (p.review && nowMs - Date.parse(p.review.at) < DECIDED_SHOWN_MS))
  const runSteps = shown.length ? await db.select().from(agentSteps).where(inArray(agentSteps.runId, shown.map((p) => p.runId))) : []
  const runs = await db.select({ id: agentRuns.id, orderId: agentRuns.orderId, status: agentRuns.status, stopReason: agentRuns.stopReason, startedAt: agentRuns.startedAt }).from(agentRuns)
  // A deadline that passed with nobody deciding moves our own cards to the shift lead. With no deadline
  // at all, that happens after half an hour.
  const escalation = (owner: Desk, deadline: string | null, created: string | null) => {
    const at = deadline ?? (created ? new Date(Date.parse(created) + 30 * MINUTE).toISOString() : null)
    return { at, from: at && Date.parse(at) < nowMs && owner !== "ops-shift" ? owner : null }
  }
  const ifNobody = (fallback: string, owner: Desk, at: string | null, from: Desk | null, hard: { at: string; why: string } | null, lateOnArrival = false) => [
    from ? lateOnArrival ? `Went straight to the shift lead: its deadline had passed before it reached ${DESK_NAME[from] ?? from}.` : `Moved to the shift lead at ${when(at!, now)}: ${DESK_NAME[from] ?? from} didn't decide in time.` : null,
    fallback,
    hard ? `${hard.why} at ${when(hard.at, now)}.` : null,
    !from && owner !== "ops-shift" && at ? `If nobody decides by ${when(at, now)}, it moves to the shift lead.` : null,
  ].filter(Boolean).join(" ")
  for (const p of shown) {
    covered.add(p.orderId)
    const hard = hardDeadline(p.orderId)
    const st = statusRows.find((r) => r.orderId === p.orderId)
    const checked = runSteps.filter((x) => x.runId === p.runId && x.tool && SHOWN_TOOLS.has(x.tool)).map((x) => x.resultSummary)
    if (p.check) checked.push(p.check.outcome === "PASS" ? "Shift Watch: passed all checks" : `Shift Watch: ${p.check.reasons.map((r) => r.message).join(" ")}`)
    for (const r of reasons.get(p.orderId) ?? []) checked.push(`Also open: ${r.text}`)
    // Decide-by times only: the proposal's own, the agent's status and the order's hard times. A loose
    // end's "was due" time isn't a decide-by time. No deadline at all means decide as soon as possible.
    // A decided card keeps the deadline it had when the person decided, so it stays where they left it.
    const promise = p.review ? [...chat].reverse().find((m) => m.orderId === p.orderId && m.direction === "OUT" && m.hearBackBy && m.createdAt <= p.review!.at)?.hearBackBy : promises.get(p.orderId)
    // A driver waiting on the spot sets a decide-by time too: the end of the wait they said they could manage.
    const waiting = p.review ? undefined : (reasons.get(p.orderId) ?? []).find((r) => r.decideBy)
    const deadline = [p.decisionDeadline, p.review ? null : st?.decisionDeadline, hard?.at, promise, waiting?.deadline].filter((x): x is string => !!x).sort()[0] ?? p.createdAt
    const outcome = outcomeOf(p, now)
    // A deadline that passed before the card existed moves it when it appears, not before.
    const esc = outcome ? { at: null, from: null } : escalation(p.ownerDesk, deadline === p.createdAt ? null : deadline < p.createdAt ? p.createdAt : deadline, p.createdAt)
    items.push({
      id: `q_${p.id}`, kind: outcome ? "DECIDED" : "PROPOSAL", order_id: p.orderId, reference: ref.get(p.orderId) ?? p.orderId,
      decision: p.status === "HELD" ? `Held for a person: ${p.summary}` : p.summary, outcome, language: null, driver_waiting_until: null,
      stopped_because: outcome ? null : stoppedBecause(p, runs.find((r) => r.id === p.runId), esc.from ? "ops-shift" : p.ownerDesk),
      if_no_decision: outcome ? null : ifNobody(p.approval === "SHIFT_LEAD" ? "Nothing changes until the shift lead decides: the car stays where it is and the driver waits." : "Nothing is booked or sent until a person decides.", p.ownerDesk, esc.at, esc.from, hard, deadline < p.createdAt),
      escalated_from: esc.from, owner_desk: esc.from ? "ops-shift" : p.ownerDesk, deadline,
      deadline_reason: deadline === p.createdAt && !p.decisionDeadline ? "No deadline given; decide as soon as possible"
        : deadline === promise ? `Driver was promised an answer by ${when(deadline, now)}`
        : deadline === waiting?.deadline ? waiting.deadlineReason!
        : deadline === hard?.at ? hard.why : st?.deadlineReason ?? "Decision deadline",
      safety: safety.has(p.orderId) || p.approval === "SHIFT_LEAD", checked, proposal_id: p.id, held_message_id: held.get(p.orderId) ?? null,
    })
  }

  // Loose ends on orders with no proposal: one card per order, its most pressing reason first.
  for (const [orderId, list] of reasons) {
    if (covered.has(orderId)) continue
    const hard = hardDeadline(orderId)
    const sorted = [...list].sort((a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9"))
    const top = sorted[0]
    // A loose end that's already overdue isn't a decide-by time when the order has a real one still ahead
    // (CD-420603's 07:59 approval, with the 12:00 check-in to come): the card keeps the overdue fact in its text.
    const deadline = top.deadline && hard && Date.parse(top.deadline) < nowMs ? hard.at : [top.deadline, hard?.at].filter((x): x is string => !!x).sort()[0] ?? null
    // Bahn's own loose ends keep their owner; only Shift Watch's commitments escalate.
    const esc = top.ours ? escalation(top.owner, top.deadline, null) : { at: null, from: null }
    const last = runs.filter((r) => r.orderId === orderId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    items.push({
      id: `q_${orderId}`, kind: "LOOSE_END", order_id: orderId, reference: ref.get(orderId) ?? orderId,
      decision: top.text, owner_desk: esc.from ? "ops-shift" : top.owner, deadline, escalated_from: esc.from,
      stopped_because: last && ["STOPPED", "FAILED"].includes(last.status) ? `The agent stopped: ${last.stopReason ?? last.status.toLowerCase()}.` : null,
      if_no_decision: top.ours ? ifNobody("The driver hears nothing more until a person replies.", top.owner, esc.at, esc.from, hard) : null,
      deadline_reason: deadline === top.deadline ? top.deadlineReason : hard?.why ?? null,
      safety: safety.has(orderId), checked: sorted.slice(1).map((r) => r.text), proposal_id: null, held_message_id: held.get(orderId) ?? null, outcome: null, language: null, driver_waiting_until: null,
    })
  }

  // The last person (not an operator) to write on each order, in Bahn's open threads, then our driver chat, which is newer.
  const needs = new Map<string, LanguageNeed | null>()
  for (const m of threadMessages) if (WRITER[m.authorType]) needs.set(m.orderId, languageNeed(WRITER[m.authorType], s((m.details as Row).language) ?? "en"))
  for (const m of chat) if (m.direction === "IN" && m.orderId) needs.set(m.orderId, languageNeed("The driver", m.language, m.unclear))
  for (const i of items) { i.language = needs.get(i.order_id) ?? null; i.driver_waiting_until = promises.get(i.order_id) ?? null }
  const mine = (i: QueueItem) => Number(!!team && i.language?.team === team)
  // After safety, a plan an agent has ready to decide comes before loose ends someone has to chase.
  const ready = (i: QueueItem) => Number(i.kind === "PROPOSAL" || i.kind === "DECIDED")
  items.sort((a, b) => Number(b.safety) - Number(a.safety) || mine(b) - mine(a) || ready(b) - ready(a) || (a.deadline ?? "9").localeCompare(b.deadline ?? "9"))
  return { at: now, summary: summarise(items, nowMs), items, quiet_count: orderRows.length - new Set(items.map((i) => i.order_id)).size }
}

/** Why the agent handed this to a person: the rule that needs a person, in the card's words. */
function stoppedBecause(p: typeof proposals.$inferSelect, run: { status: string; stopReason: string | null } | undefined, owner: Desk): string {
  const desk = DESK_NAME[owner] ?? owner
  const why = p.status === "HELD" ? `Shift Watch held it for a person: ${p.check?.reasons.map((r) => r.message).join(" ") ?? ""}`
    : p.approval === "SHIFT_LEAD" ? "It concerns safety, so only the shift lead decides."
    : p.approval === "CUSTOMER_VIA_PERSON" ? "It contacts the customer, and only a person does that."
    : p.approval === "NONE" ? "Only a lookup; any desk can run it."
    : p.cost ? `It costs ${(p.cost.amount_minor / 100).toFixed(2)} ${p.cost.currency}${p.cost.who_pays ? "" : " and who pays is open"}, so ${desk} decides.`
    : `It changes the order, so ${desk} decides.`
  return run?.status === "STOPPED" && run.stopReason ? `${why} The agent stopped early: ${run.stopReason}.` : why
}

/** How long a decided card stays in the queue showing its outcome. */
const DECIDED_SHOWN_MS = 5 * MINUTE

const hms = (iso: string) => iso.slice(11, 19)

/** What a decided card says: what will happen when the undo window closes, or what happened. */
function outcomeOf(p: typeof proposals.$inferSelect, now: string): CardOutcome | null {
  const r = p.review
  if (!r) return null
  const open = !r.settled_at && r.takes_effect_at > now
  const approved = p.status !== "REJECTED"
  const result = open
    ? `${approved ? "Approved" : "Rejected"} by ${DESK_NAME[r.reviewer] ?? r.reviewer}. Takes effect at ${hms(r.takes_effect_at)} UTC; undo until then.`
    : p.status === "EXECUTED" ? p.execution!.result_summary
    : p.status === "FAILED" ? `Failed when it ran: ${p.execution?.error ?? "unknown error"}`
    : p.status === "REJECTED" ? `Rejected by ${DESK_NAME[r.reviewer] ?? r.reviewer}${r.note ? `: ${r.note}` : ""}`
    : "Taking effect now"
  const nextSteps = open ? [] : p.execution?.next_steps ?? (p.status === "REJECTED"
    ? [r.note && agentMode() === "live" ? "The agent is looking for another way, with your reason" : "The order stays with a person; nothing was booked or sent"]
    : [])
  return { decision: r.decision, reviewer: r.reviewer, at: r.at, undo_until: open ? r.takes_effect_at : null, result, next_steps: nextSteps, failed: p.status === "FAILED" }
}

/** Three lines from rules, so the summary works without the model. */
/** " 3 in another language: French 2, German 1." */
function languages(items: QueueItem[]): string {
  const by = new Map<string, number>()
  for (const i of items) if (i.language) by.set(i.language.name, (by.get(i.language.name) ?? 0) + 1)
  const total = [...by.values()].reduce((a, b) => a + b, 0)
  return total ? ` ${total} in another language: ${[...by].sort((a, b) => b[1] - a[1]).map(([n, k]) => `${n} ${k}`).join(", ")}.` : ""
}

function summarise(all: QueueItem[], nowMs: number): [string, string, string] {
  // A card a person just decided no longer needs anyone, unless it failed.
  const items = all.filter((i) => !i.outcome || i.outcome.failed)
  const soon = items.filter((i) => i.deadline && Date.parse(i.deadline) < nowMs + 60 * MINUTE)
  const safety = items.filter((i) => i.safety).length
  const byDesk = new Map<string, number>()
  for (const i of soon) byDesk.set(i.owner_desk, (byDesk.get(i.owner_desk) ?? 0) + 1)
  const [busiest, load] = [...byDesk].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  const proposalsWaiting = items.filter((i) => i.kind === "PROPOSAL").length
  return [
    `${items.length} need a person: ${safety} safety, ${soon.length} due within the hour.`,
    busiest ? `Busiest desk: ${DESK_NAME[busiest] ?? busiest}, ${load} due within the hour.` : "No desk has anything due within the hour.",
    `${proposalsWaiting} agent proposal${proposalsWaiting === 1 ? "" : "s"} ready to decide; ${items.length - proposalsWaiting} loose end${items.length - proposalsWaiting === 1 ? "" : "s"} to chase.${languages(items)}`,
  ]
}

