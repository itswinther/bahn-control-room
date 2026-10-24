// What happens after a person decides: record the decision, carry it out (mock services), and tell
// the driver. Only the right person may decide, and a double click can't book twice.
import { and, eq, inArray, sql } from "drizzle-orm"
import type { DecisionRequest, Execution, Proposal, Review, RunRequest } from "@/lib/contract"
import { agentMode, createRun, runOrderAgent } from "@/lib/agents/order-agent"
import { nowIso, UNDO_MS } from "@/lib/clock"
import { db } from "@/lib/db"
import { bookFerry, ferryCapacity } from "@/lib/mocks"
import { changeOutcome } from "@/lib/mocks/replies"
import { loadOrder } from "@/lib/present/load"
import { buildRecordView } from "@/lib/present/record"
import { relatedRecords } from "@/lib/schema"
import { driverMessages, orderStatus, proposals } from "@/lib/schema-ours"
import { mayDecide } from "./checks"

export type DecisionResult = { ok: true; proposal: Proposal } | { ok: false; status: number; error: string }

const str = (v: unknown) => (typeof v === "string" ? v : null)

/** The crossing to book: named in the payload, or the cited option that has space. */
function optionFor(orderId: string, payload: Record<string, unknown>, evidence: Proposal["evidence_refs"], now: string) {
  const named = str(payload.travel_option_id) ?? str(payload.option_id)
  if (named) return named
  const cited = evidence.filter((e) => e.table === "travel_options").map((e) => e.id)
  return ferryCapacity(orderId, true, now).options.find((o) => cited.includes(o.id) && o.vehicle_space)?.id ?? cited[0] ?? null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`

/** The order's current ferry booking: what a replacement crossing releases unless the payload names one. */
async function ferryBookings(orderId: string) {
  const loaded = await loadOrder(orderId)
  return loaded ? buildRecordView(loaded.bundle).reservations.filter((r) => r.kind === "FERRY") : []
}

/** The order's carrier change requests that nobody has confirmed yet. */
async function openChangeRequests(orderId: string) {
  const rows = await db.select({ details: relatedRecords.details }).from(relatedRecords)
    .where(and(eq(relatedRecords.orderId, orderId), eq(relatedRecords.collection, "travel_reservations")))
  type WithRequest = { id: string; booking_reference?: string; amendment_request: { status: string; requested_at: string } }
  return rows.map((r) => r.details as Partial<WithRequest>)
    .filter((r): r is WithRequest => !!r.id && !!r.amendment_request?.requested_at && /^REQUESTED/.test(r.amendment_request.status ?? ""))
}

async function tellDriver(orderId: string, text: string) {
  const loaded = await loadOrder(orderId)
  const driver = loaded && buildRecordView(loaded.bundle).assignments.find((a) => a.status === "IN_PROGRESS" || a.status === "ASSIGNED")?.driver.id
  if (!driver) return false
  await db.insert(driverMessages).values({
    id: `dm_${crypto.randomUUID().slice(0, 8)}`, driverId: driver, orderId, direction: "OUT", author: "shift-watch", text,
    language: "en", translation: null, quickReplies: [], hearBackBy: null, simulated: false, repeatsMessageId: null,
    status: "SENT", createdAt: nowIso(),
  })
  return true
}

async function execute(p: typeof proposals.$inferSelect, payload: Record<string, unknown>): Promise<Execution> {
  const now = nowIso()
  const done = (summary: string, next: string[], references: Execution["references"] = []): Execution =>
    ({ status: "SUCCEEDED", at: now, result_summary: summary, references, next_steps: next, error: null })

  if (p.command.startsWith("travel.") && /book|rebook|crossing/.test(p.command)) {
    // Recheck current state before writing: book against a fresh capacity check, keyed by order and
    // sailing, so a second proposal for the same crossing can't book it twice.
    // First check, as the agents ask: a change already requested from the carrier may have gone
    // through, and booking around it would book twice.
    const ferries = await ferryBookings(p.orderId)
    const requests = await openChangeRequests(p.orderId)
    const moved = requests.length ? changeOutcome(p.orderId) : null
    if (moved?.confirmed) return done(`Not booked: the carrier already made the requested change. ${moved.detail}`, ["Nothing new was booked", "The agent reads the changed booking on its next run"])
    const optionId = optionFor(p.orderId, payload, p.evidenceRefs, now)
    if (!optionId) return { status: "FAILED", at: now, result_summary: "No ferry option to book", references: [], next_steps: ["The agent proposes again with a named option"], error: "No ferry option in the proposal" }
    const booking = bookFerry(p.orderId, optionId, `${p.orderId}:${optionId}`, now)
    if (!booking.ok) return { status: "FAILED", at: now, result_summary: `Booking failed: ${booking.error}`, references: [], next_steps: ["Nothing was booked and the old booking is unchanged", "The agent checks the options again"], error: booking.error }
    if (booking.repeated) return done(`Already booked: ${booking.reference} (mock). Nothing new was booked.`, ["No change for the driver"], [{ kind: "ferry_booking", value: booking.reference }])
    // Released only now, after the new booking is confirmed. A change request still open on it is
    // withdrawn with it, so the carrier can't also move the old booking.
    const old = str(payload.release_reservation_id) ?? str(payload.replaces_booking) ?? ferries.find((r) => r.status === "BOOKED")?.id ?? null
    const oldRef = ferries.find((r) => r.id === old)?.reference ?? old
    const withdrawn = requests.filter((r) => r.id === old)
    const o = booking.option
    const told = await tellDriver(p.orderId, `New crossing booked: ${o.provider}, departs ${o.departs_at.slice(11, 16)} UTC on ${day(o.departs_at)}. Check-in closes ${o.check_in_cutoff_at.slice(11, 16)} UTC. Booking reference ${booking.reference}.`)
    return done(
      `Booked the ${o.departs_at.slice(11, 16)} crossing (${booking.reference}, mock)${withdrawn.length ? `, withdrew the ${withdrawn.map((r) => r.amendment_request.requested_at.slice(11, 16)).join(", ")} change request` : ""}${old ? `, then released ${oldRef}` : ""}`,
      [
        ...requests.map((r) => `Checked first: ${changeOutcome(p.orderId).detail}`),
        told ? "Shift Watch sent the driver the new crossing with its reference and check-in time" : "No active driver to tell; the driver desk needs to pass it on",
        "Boarding stays unconfirmed until the gate scan",
        "The agent checks again after check-in closes",
      ],
      [{ kind: "ferry_booking", value: booking.reference }, ...(old ? [{ kind: "released_booking", value: old }] : []),
        ...withdrawn.map((r) => ({ kind: "withdrawn_request", value: `${r.booking_reference ?? r.id} ${r.amendment_request.requested_at}` })), { kind: "check_in_cutoff", value: o.check_in_cutoff_at }],
    )
  }
  if (p.command.startsWith("customer.")) return done("Sent to the customer by a person", ["The customer's reply comes back to the support desk", "The agent reads it on its next run"])
  if (p.command.startsWith("recovery.")) return done("Recovery decision recorded", ["The shift lead arranges the owner's choice: roadside assistance or collection", "The agent keeps the driver updated and replans the delivery once the car moves"])
  if (p.command.startsWith("driver.")) {
    const told = await tellDriver(p.orderId, "Thanks for waiting. A person has decided the next step; you'll get the details in this chat shortly.")
    return done("Decision recorded for the driver", [told ? "Shift Watch told the driver a person has decided" : "No active driver to tell", "The driver desk sends the travel details"])
  }
  return done("Decision recorded", ["The owning desk carries it out", "The agent checks again on its next run"])
}

export async function decide(proposalId: string, req: DecisionRequest): Promise<DecisionResult> {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId))
  if (!p) return { ok: false, status: 404, error: "Proposal not found" }
  if (!["PENDING_REVIEW", "HELD"].includes(p.status)) return { ok: false, status: 409, error: `This proposal is ${p.status.toLowerCase().replace(/_/g, " ")}; it can't be decided now.` }
  if (!mayDecide({ approval: p.approval, owner_desk: p.ownerDesk }, req.reviewer)) {
    return { ok: false, status: 403, error: p.approval === "SHIFT_LEAD" ? "Only the shift lead can decide this." : `Only ${p.ownerDesk} or the shift lead can decide this.` }
  }
  const approving = req.decision !== "REJECTED"
  if (approving && p.cost && !req.who_pays) return { ok: false, status: 400, error: "This costs money: choose who pays before approving." }

  // An edit changes the fields it names; the rest of the agent's payload stays.
  const finalPayload = req.decision === "EDITED" && req.final_payload ? { ...p.payload, ...req.final_payload } : p.payload
  const at = nowIso()
  const review: Review = {
    decision: req.decision, final_payload: finalPayload, note: req.note ?? null, who_pays: req.who_pays ?? null, reviewer: req.reviewer, at,
    takes_effect_at: new Date(Date.parse(at) + UNDO_MS).toISOString(), settled_at: null,
  }
  // Conditional on the status, so two clicks at once can't both go through.
  const claimed = await db.update(proposals)
    .set({ status: approving ? "APPROVED" : "REJECTED", review, cost: p.cost ? { ...p.cost, who_pays: req.who_pays ?? null } : null })
    .where(and(eq(proposals.id, p.id), inArray(proposals.status, ["PENDING_REVIEW", "HELD"]))).returning()
  if (!claimed.length) return { ok: false, status: 409, error: "Someone else decided this a moment ago." }
  // Nothing irreversible happens until the undo window passes. If the server restarts in between, the
  // next queue or case read settles it (settleDue).
  setTimeout(() => void settle(p.id).catch(() => {}), UNDO_MS + 100)
  return { ok: true, proposal: toContract(claimed[0]) }
}

const unsettled = (now: string) => and(inArray(proposals.status, ["APPROVED", "REJECTED"]), sql`${proposals.review}->>'settled_at' IS NULL`, sql`${proposals.review}->>'takes_effect_at' <= ${now}`)

/** Carry out a decision once its undo window has passed. Claimed in one update, so it runs once. */
export async function settle(proposalId: string): Promise<void> {
  const now = nowIso()
  const [p] = await db.update(proposals).set({ review: sql`${proposals.review} || ${JSON.stringify({ settled_at: now })}::jsonb` })
    .where(and(eq(proposals.id, proposalId), unsettled(now))).returning()
  if (!p) return
  if (p.status === "APPROVED") {
    const execution = await execute(p, p.review!.final_payload)
    await db.update(proposals).set({ status: execution.status === "SUCCEEDED" ? "EXECUTED" : "FAILED", execution }).where(eq(proposals.id, p.id))
  }
  const [after] = await db.select().from(proposals).where(eq(proposals.id, p.id))
  await refreshStatus(p.orderId, after)
  // A rejection with a reason goes back to the agent to find another way. Live only: a replay has no
  // recording for it.
  if (p.status === "REJECTED" && p.review?.note && agentMode() === "live") {
    const next: RunRequest = { order_id: p.orderId, reason: "OPERATOR_REQUEST", reason_detail: `${p.review.reviewer} rejected ${p.id} ("${p.summary}"): ${p.review.note}` }
    const runId = await createRun(next)
    if (runId) void runOrderAgent(runId, next)
  }
}

/** Settle every decision whose undo window has passed: the timers don't survive a restart. */
export async function settleDue(): Promise<void> {
  for (const { id } of await db.select({ id: proposals.id }).from(proposals).where(unsettled(nowIso()))) await settle(id)
}

/** Take a decision back while its undo window is open: the card returns to the queue as it was. */
export async function undo(proposalId: string, reviewer: string): Promise<DecisionResult> {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId))
  if (!p) return { ok: false, status: 404, error: "Proposal not found" }
  if (!p.review || p.review.settled_at || !["APPROVED", "REJECTED"].includes(p.status)) return { ok: false, status: 409, error: "This decision has already taken effect." }
  if (reviewer !== p.review.reviewer && reviewer !== "ops-shift") return { ok: false, status: 403, error: `Only ${p.review.reviewer} or the shift lead can undo this.` }
  const [back] = await db.update(proposals)
    .set({ status: p.check?.outcome === "HOLD" ? "HELD" : "PENDING_REVIEW", review: null, cost: p.cost ? { ...p.cost, who_pays: null } : null })
    .where(and(eq(proposals.id, p.id), inArray(proposals.status, ["APPROVED", "REJECTED"]), sql`${proposals.review}->>'settled_at' IS NULL`, sql`${proposals.review}->>'takes_effect_at' > ${nowIso()}`))
    .returning()
  return back ? { ok: true, proposal: toContract(back) } : { ok: false, status: 409, error: "Too late to undo: the decision has taken effect." }
}

async function refreshStatus(orderId: string, p: typeof proposals.$inferSelect) {
  const [st] = await db.select().from(orderStatus).where(eq(orderStatus.orderId, orderId))
  if (!st) return
  const summary = p.status === "EXECUTED" ? p.execution!.result_summary : p.status === "FAILED" ? `Failed: ${p.execution?.error}`
    : `Rejected by ${p.review?.reviewer}: ${p.summary}${p.review?.note ? `. Reason: ${p.review.note}` : ""}`
  // A failed or rejected step leaves the problem open: a person still owns it, with the same deadline.
  const open = p.status === "FAILED" || p.status === "REJECTED"
  // After a booking, the agent's next check is when check-in closes: that's when boarding can be confirmed.
  const cutoff = p.execution?.references.find((r) => r.kind === "check_in_cutoff")?.value ?? null
  await db.update(orderStatus).set({
    summary, openProposalIds: st.openProposalIds.filter((id) => id !== p.id), nextCheckAt: cutoff ?? st.nextCheckAt,
    waitingOn: open ? "OPERATOR" : "NOTHING", decisionDeadline: open ? st.decisionDeadline : null, updatedAt: nowIso(),
  }).where(eq(orderStatus.orderId, orderId))
}

export const toContract = (p: typeof proposals.$inferSelect): Proposal => ({
  id: p.id, order_id: p.orderId, run_id: p.runId, proposed_by: p.proposedBy, command: p.command, summary: p.summary,
  rationale: p.rationale, payload: p.payload, before_after: p.beforeAfter, evidence_refs: p.evidenceRefs,
  approval: p.approval, owner_desk: p.ownerDesk, cost: p.cost, decision_deadline: p.decisionDeadline,
  status: p.status, check: p.check, review: p.review, execution: p.execution, created_at: p.createdAt,
})
