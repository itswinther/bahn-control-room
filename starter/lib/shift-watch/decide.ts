// What happens after a person decides: record the decision, carry it out (mock services), and tell
// the driver. Only the right person may decide, and a double click can't book twice.
import { and, eq, inArray } from "drizzle-orm"
import type { DecisionRequest, Execution, Proposal, Review } from "@/lib/contract"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { bookFerry, ferryCapacity } from "@/lib/mocks"
import { loadOrder } from "@/lib/present/load"
import { buildRecordView } from "@/lib/present/record"
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
    // Recheck current state before writing: book against a fresh capacity check, keyed by the proposal.
    const optionId = optionFor(p.orderId, payload, p.evidenceRefs, now)
    if (!optionId) return { status: "FAILED", at: now, result_summary: "No ferry option to book", references: [], next_steps: ["The agent proposes again with a named option"], error: "No ferry option in the proposal" }
    const booking = bookFerry(p.orderId, optionId, p.id, now)
    if (!booking.ok) return { status: "FAILED", at: now, result_summary: `Booking failed: ${booking.error}`, references: [], next_steps: ["Nothing was booked and the old booking is unchanged", "The agent checks the options again"], error: booking.error }
    // Released only now, after the new booking is confirmed.
    const ferries = await ferryBookings(p.orderId)
    const old = str(payload.release_reservation_id) ?? str(payload.replaces_booking) ?? ferries.find((r) => r.status === "BOOKED")?.id ?? null
    const oldRef = ferries.find((r) => r.id === old)?.reference ?? old
    const o = booking.option
    const told = await tellDriver(p.orderId, `New crossing booked: ${o.provider}, departs ${o.departs_at.slice(11, 16)} UTC on ${day(o.departs_at)}. Check-in closes ${o.check_in_cutoff_at.slice(11, 16)} UTC. Booking reference ${booking.reference}.`)
    return done(
      `Booked the ${o.departs_at.slice(11, 16)} crossing (${booking.reference}, mock)${old ? `, then released ${oldRef}` : ""}`,
      [
        told ? "Shift Watch sent the driver the new crossing with its reference and check-in time" : "No active driver to tell; the driver desk needs to pass it on",
        "Boarding stays unconfirmed until the gate scan",
        "The agent checks again after check-in closes",
      ],
      [{ kind: "ferry_booking", value: booking.reference }, ...(old ? [{ kind: "released_booking", value: old }] : []), { kind: "check_in_cutoff", value: o.check_in_cutoff_at }],
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

  const finalPayload = req.decision === "EDITED" && req.final_payload ? req.final_payload : p.payload
  const review: Review = { decision: req.decision, final_payload: finalPayload, note: req.note ?? null, who_pays: req.who_pays ?? null, reviewer: req.reviewer, at: nowIso() }
  // Conditional on the status, so two clicks at once can't both go through.
  const claimed = await db.update(proposals)
    .set({ status: approving ? "APPROVED" : "REJECTED", review, cost: p.cost ? { ...p.cost, who_pays: req.who_pays ?? null } : null })
    .where(and(eq(proposals.id, p.id), inArray(proposals.status, ["PENDING_REVIEW", "HELD"]))).returning({ id: proposals.id })
  if (!claimed.length) return { ok: false, status: 409, error: "Someone else decided this a moment ago." }

  if (approving) {
    const execution = await execute(p, finalPayload)
    await db.update(proposals).set({ status: execution.status === "SUCCEEDED" ? "EXECUTED" : "FAILED", execution }).where(eq(proposals.id, p.id))
  }
  const [after] = await db.select().from(proposals).where(eq(proposals.id, p.id))
  await refreshStatus(p.orderId, after)
  return { ok: true, proposal: toContract(after) }
}

async function refreshStatus(orderId: string, p: typeof proposals.$inferSelect) {
  const [st] = await db.select().from(orderStatus).where(eq(orderStatus.orderId, orderId))
  if (!st) return
  const summary = p.status === "EXECUTED" ? p.execution!.result_summary : p.status === "FAILED" ? `Failed: ${p.execution?.error}` : `Rejected by ${p.review?.reviewer}: ${p.summary}`
  // After a booking, the agent's next check is when check-in closes: that's when boarding can be confirmed.
  const cutoff = p.execution?.references.find((r) => r.kind === "check_in_cutoff")?.value ?? null
  await db.update(orderStatus).set({
    summary, openProposalIds: st.openProposalIds.filter((id) => id !== p.id), nextCheckAt: cutoff ?? st.nextCheckAt,
    waitingOn: p.status === "FAILED" ? "OPERATOR" : "NOTHING", decisionDeadline: p.status === "FAILED" ? st.decisionDeadline : null, updatedAt: nowIso(),
  }).where(eq(orderStatus.orderId, orderId))
}

export const toContract = (p: typeof proposals.$inferSelect): Proposal => ({
  id: p.id, order_id: p.orderId, run_id: p.runId, proposed_by: p.proposedBy, command: p.command, summary: p.summary,
  rationale: p.rationale, payload: p.payload, before_after: p.beforeAfter, evidence_refs: p.evidenceRefs,
  approval: p.approval, owner_desk: p.ownerDesk, cost: p.cost, decision_deadline: p.decisionDeadline,
  status: p.status, check: p.check, review: p.review, execution: p.execution, created_at: p.createdAt,
})
