// One order for the case view: the starter's labelled record plus our proposals, agent runs, notes,
// status and driver chat, and every travel leg marked booked or not.
import { asc, desc, eq, inArray } from "drizzle-orm"
import type { AgentRun, AgentStep, CaseResponse, DriverMessage, OrderStatus, Proposal, TravelLeg } from "@/lib/contract"
import { db } from "@/lib/db"
import { loadOrder } from "@/lib/present/load"
import { buildRecordView } from "@/lib/present/record"
import type { RecordView } from "@/lib/present/types"
import { agentNotes, agentRuns, agentSteps, driverMessages, orderStatus, proposals } from "@/lib/schema-ours"
import { toContract } from "./decide"

const KINDS = new Set<TravelLeg["kind"]>(["FERRY", "TRAIN", "FLIGHT", "BUS", "TAXI", "HOTEL", "DRIVE"])
const kindOf = (k: string): TravelLeg["kind"] => (KINDS.has(k as TravelLeg["kind"]) ? (k as TravelLeg["kind"]) : "DRIVE")

/** Booked is not boarded: boarding stays unconfirmed until a gate record says otherwise. */
export function legsFrom(view: RecordView, ours: Proposal[], rawReservations: Record<string, unknown>[] = []): TravelLeg[] {
  const legs: TravelLeg[] = []
  const released = new Set(ours.flatMap((p) => p.execution?.references.filter((x) => x.kind === "released_booking").map((x) => x.value) ?? []))
  for (const r of view.reservations) {
    const ferry = r.kind === "FERRY"
    if (released.has(r.id)) {
      legs.push({
        label: `${r.kindLabel}${r.route ? `: ${r.route}` : ""} (released after the new booking was confirmed)`, kind: kindOf(r.kind), state: "NOT_BOOKED",
        reference: r.reference, departs_at: r.departureAt, check_in_cutoff_at: r.checkInCutoffAt, boarding: null,
        source: { table: "travel_reservations", id: r.id, observed_at: r.bookedAt },
      })
      continue
    }
    legs.push({
      label: `${r.kindLabel}${r.route ? `: ${r.route}` : ""}${r.status === "BOOKED" ? "" : ` (${r.statusLabel.toLowerCase()})`}`,
      kind: kindOf(r.kind), state: r.status === "BOOKED" ? "BOOKED" : "NOT_BOOKED", reference: r.reference,
      departs_at: r.departureAt, check_in_cutoff_at: r.checkInCutoffAt,
      boarding: ferry ? (r.checks.some((c) => /boarding confirmed/i.test(c)) ? "CONFIRMED" : "UNCONFIRMED") : null,
      source: { table: "travel_reservations", id: r.id, observed_at: r.bookedAt },
    })
    // The starter's view reads carrier_amendments; some records carry an amendment_request instead.
    const request = rawReservations.find((x) => x.id === r.id)?.amendment_request as { status?: string; requested_at?: string; requested_change?: string } | undefined
    if (request && request.status !== "CONFIRMED") legs.push({
      label: `Change requested at ${request.requested_at?.slice(11, 16) ?? "?"} UTC (${(request.requested_change ?? "change").toLowerCase().replace(/_/g, " ")}), not confirmed`,
      kind: kindOf(r.kind), state: "REQUESTED", reference: null, departs_at: null, check_in_cutoff_at: null, boarding: null,
      source: { table: "travel_reservations", id: r.id, observed_at: request.requested_at ?? null },
    })
    else if (r.amendment) legs.push({
      label: `Change requested on ${r.reference ?? r.id}, not confirmed`, kind: kindOf(r.kind), state: "REQUESTED", reference: null,
      departs_at: null, check_in_cutoff_at: null, boarding: null, source: { table: "travel_reservations", id: r.id, observed_at: null },
    })
  }
  for (const o of view.options) legs.push({
    label: `${o.kindLabel} quote${o.route ? `: ${o.route}` : ""}${o.quote ? `, ${o.quote}` : ""}${o.status === "SOLD_OUT" ? " (sold out)" : ""}`,
    kind: kindOf(o.kind), state: o.status === "SOLD_OUT" ? "NOT_BOOKED" : "QUOTED", reference: null,
    departs_at: o.departureAt, check_in_cutoff_at: null, boarding: null,
    source: { table: "travel_options", id: o.id, observed_at: o.checkedAt },
  })
  // Crossings our agent proposed: still only quotes until a person approves and the booking runs.
  for (const p of ours) {
    if (!p.command.startsWith("travel.") || !["PENDING_REVIEW", "HELD", "APPROVED"].includes(p.status)) continue
    const quote = p.evidence_refs.find((e) => e.table === "travel_options")
    if (quote) legs.push({
      label: `Proposed: ${p.summary}`, kind: "FERRY", state: "QUOTED", reference: null, departs_at: null, check_in_cutoff_at: null, boarding: null,
      source: { table: "travel_options", id: quote.id, observed_at: quote.observed_at, mock: quote.mock },
    })
  }
  // Bookings our proposals made once a person approved them.
  for (const p of ours) for (const ref of p.execution?.status === "SUCCEEDED" ? p.execution.references.filter((x) => x.kind === "ferry_booking") : []) legs.push({
    label: "Ferry, booked after a person approved it (mock)", kind: "FERRY", state: "BOOKED", reference: ref.value,
    departs_at: null, check_in_cutoff_at: p.execution!.references.find((x) => x.kind === "check_in_cutoff")?.value ?? null, boarding: "UNCONFIRMED", source: { table: "proposals", id: p.id, observed_at: p.execution!.at },
  })
  return legs
}

export async function buildCase(orderId: string): Promise<CaseResponse | null> {
  const loaded = await loadOrder(orderId)
  if (!loaded) return null
  const view = buildRecordView(loaded.bundle)
  const [propRows, [status], [note], runRows, dmRows] = await Promise.all([
    db.select().from(proposals).where(eq(proposals.orderId, orderId)).orderBy(desc(proposals.createdAt)),
    db.select().from(orderStatus).where(eq(orderStatus.orderId, orderId)),
    db.select().from(agentNotes).where(eq(agentNotes.orderId, orderId)),
    db.select().from(agentRuns).where(eq(agentRuns.orderId, orderId)).orderBy(desc(agentRuns.startedAt)),
    db.select().from(driverMessages).where(eq(driverMessages.orderId, orderId)).orderBy(asc(driverMessages.createdAt)),
  ])
  const stepRows = runRows.length ? await db.select().from(agentSteps).where(inArray(agentSteps.runId, runRows.map((r) => r.id))).orderBy(asc(agentSteps.at), asc(agentSteps.seq)) : []
  const ours = propRows.map(toContract)
  return {
    view,
    proposals: ours,
    status: status ? {
      order_id: status.orderId, run_id: status.runId, summary: status.summary, waiting_on: status.waitingOn,
      next_check_at: status.nextCheckAt, decision_deadline: status.decisionDeadline, deadline_reason: status.deadlineReason,
      owner_desk: status.ownerDesk, open_proposal_ids: status.openProposalIds, updated_at: status.updatedAt,
    } satisfies OrderStatus : null,
    note: note ? { order_id: note.orderId, markdown: note.markdown, run_id: note.runId, updated_at: note.updatedAt } : null,
    runs: runRows.map((r) => ({
      id: r.id, order_id: r.orderId, reason: r.reason, reason_detail: r.reasonDetail, mode: r.mode, status: r.status,
      stop_reason: r.stopReason, tool_calls: r.toolCalls, started_at: r.startedAt, ended_at: r.endedAt,
    }) satisfies AgentRun),
    steps: stepRows.map((x) => ({
      run_id: x.runId, seq: x.seq, agent: x.agent, kind: x.kind, tool: x.tool, input: x.input, result_summary: x.resultSummary, at: x.at,
    }) satisfies AgentStep),
    driver_messages: dmRows.map((m) => ({
      id: m.id, driver_id: m.driverId, order_id: m.orderId, direction: m.direction, author: m.author, text: m.text,
      language: m.language, translation: m.translation, quick_replies: m.quickReplies, hear_back_by: m.hearBackBy,
      simulated: m.simulated, repeats_message_id: m.repeatsMessageId, status: m.status, created_at: m.createdAt,
    }) satisfies DriverMessage),
    legs: legsFrom(view, ours, (loaded.related.travel_reservations ?? []).map((r) => r.details)),
  }
}
