// Sample data for the order agent's shapes, following the CD-420603 demo path in the team plan.
// Real records are cited by their dataset ids. Ferry capacity, the change fee and the rest check are
// made-up fixtures (`mock: true`); the stale "cached" list is dated 07:10, when the operator wrote that
// they were checking the next sailing (msg at 07:10 on conv-xdf71bc9a940be234).
import type { AgentNote, AgentRun, AgentStep, OrderStatus, Proposal } from "../lib/contract"

export const runs = [
  {
    id: "run_603_a", order_id: "ord-00603", reason: "DRIVER_MESSAGE",
    reason_detail: "Driver: still in the queue, navigation says 12:20 at check-in (cutoff 12:00)",
    mode: "replay", status: "FINISHED", stop_reason: "Proposal needs the travel desk", tool_calls: 5,
    started_at: "2026-10-21T09:00:30Z", ended_at: "2026-10-21T09:01:10Z",
  },
  {
    id: "run_603_b", order_id: "ord-00603", reason: "SENT_BACK",
    reason_detail: "Shift Watch: ferry capacity checked 07:10 is stale; refresh before proposing a booking",
    mode: "replay", status: "FINISHED", stop_reason: "Proposal needs the travel desk", tool_calls: 5,
    started_at: "2026-10-21T09:01:20Z", ended_at: "2026-10-21T09:02:20Z",
  },
] satisfies AgentRun[]

export const steps = [
  { run_id: "run_603_a", seq: 1, agent: "order-agent", kind: "WAKE", tool: null, input: {}, result_summary: "Woken by a driver message on CD-420603", at: "2026-10-21T09:00:30Z" },
  { run_id: "run_603_a", seq: 2, agent: "order-agent", kind: "TOOL_CALL", tool: "read_notes", input: { order_id: "ord-00603" }, result_summary: "No notes yet for this order", at: "2026-10-21T09:00:32Z" },
  { run_id: "run_603_a", seq: 3, agent: "order-agent", kind: "TOOL_CALL", tool: "get_order", input: { order_id: "ord-00603" }, result_summary: "Booked WBV-FERRY-00603: departs 14:00, check-in closes 12:00. Later crossing requested 08:43, not confirmed. Capacity refresh approved 07:59, not carried out", at: "2026-10-21T09:00:36Z" },
  { run_id: "run_603_a", seq: 4, agent: "order-agent", kind: "TOOL_CALL", tool: "read_messages", input: { order_id: "ord-00603" }, result_summary: "Driver in the terminal queue since 06:58; now says 12:20 at check-in", at: "2026-10-21T09:00:40Z" },
  { run_id: "run_603_a", seq: 5, agent: "order-agent", kind: "TOOL_CALL", tool: "check_ferry_capacity", input: { order_id: "ord-00603", refresh: false }, result_summary: "Cached list, checked 07:10: 22:00 crossing had vehicle space", at: "2026-10-21T09:00:45Z" },
  { run_id: "run_603_a", seq: 6, agent: "order-agent", kind: "TOOL_CALL", tool: "propose", input: { command: "travel.rebook_ferry", travel_option_id: "opt_mock_603_2200" }, result_summary: "Proposal prop_603_a written, waiting for Shift Watch", at: "2026-10-21T09:01:05Z" },
  { run_id: "run_603_a", seq: 7, agent: "order-agent", kind: "FINISH", tool: "finish", input: {}, result_summary: "Waiting on the travel desk", at: "2026-10-21T09:01:10Z" },

  { run_id: "run_603_b", seq: 1, agent: "order-agent", kind: "WAKE", tool: null, input: {}, result_summary: "Sent back by Shift Watch: capacity checked 07:10 is 111 minutes old", at: "2026-10-21T09:01:20Z" },
  { run_id: "run_603_b", seq: 2, agent: "order-agent", kind: "TOOL_CALL", tool: "read_notes", input: { order_id: "ord-00603" }, result_summary: "Notes from run_603_a: driver ETA 12:20 against a 12:00 cutoff", at: "2026-10-21T09:01:22Z" },
  { run_id: "run_603_b", seq: 3, agent: "order-agent", kind: "TOOL_CALL", tool: "check_ferry_capacity", input: { order_id: "ord-00603", refresh: true }, result_summary: "Fresh at 09:01: 22:00 crossing has vehicle space; change fee EUR 45", at: "2026-10-21T09:01:40Z" },
  { run_id: "run_603_b", seq: 4, agent: "order-agent", kind: "TOOL_CALL", tool: "check_driver_rest", input: { driver_id: "drv-121", departs_at: "2026-10-21T22:00:00Z" }, result_summary: "About 8 h of rest possible before 20:00 check-in; fits", at: "2026-10-21T09:01:50Z" },
  { run_id: "run_603_b", seq: 5, agent: "order-agent", kind: "TOOL_CALL", tool: "propose", input: { command: "travel.rebook_ferry", travel_option_id: "opt_mock_603_2200" }, result_summary: "Proposal prop_603_b written, waiting for Shift Watch", at: "2026-10-21T09:02:10Z" },
  { run_id: "run_603_b", seq: 6, agent: "order-agent", kind: "TOOL_CALL", tool: "write_notes", input: { order_id: "ord-00603" }, result_summary: "Notes updated", at: "2026-10-21T09:02:15Z" },
  { run_id: "run_603_b", seq: 7, agent: "order-agent", kind: "FINISH", tool: "finish", input: {}, result_summary: "Waiting on the travel desk; decision by 12:00", at: "2026-10-21T09:02:20Z" },
] satisfies AgentStep[]

export const note = {
  order_id: "ord-00603",
  run_id: "run_603_b",
  updated_at: "2026-10-21T09:02:15Z",
  markdown: [
    "## CD-420603 · VW Golf · Munich → Lahti",
    "- Booked: WBV-FERRY-00603, departs 21 Oct 14:00 UTC, check-in closes 12:00 (travel_reservations, booked 15 Oct). Boarding unconfirmed.",
    "- Driver drv-121 in the terminal queue since 06:58; at 09:00 says navigation shows 12:20 at check-in (driver message, simulated).",
    "- Carrier took a request for a later crossing at 08:43, not confirmed (ops-travel note msg at 08:43).",
    "- Bahn's capacity refresh, approved 07:59, never ran (agent_proposals, travel.refresh_crossing).",
    "- Fresh capacity at 09:01: 22:00 crossing has vehicle space, change fee EUR 45 (mock).",
    "- Delivery promise 23 Oct 10:00–12:00 UTC still met on the 22:00 crossing (arrives about 05:30 UTC, estimate).",
    "- Open: who pays the change fee. Lahti receiver is unconfirmed (order_endpoint_details).",
  ].join("\n"),
} satisfies AgentNote

const evidence = [
  { table: "travel_reservations", id: "res-x1082202e8d139d61", observed_at: "2026-10-15T05:01:00Z" },
  { table: "travel_options", id: "opt_mock_603_2200", observed_at: "2026-10-21T09:01:40Z", mock: true },
]

const beforeAfter = [
  { label: "Ferry", before: "14:00 crossing, booked (WBV-FERRY-00603)", after: "22:00 crossing, quoted, vehicle space checked 09:01" },
  { label: "Check-in closes", before: "12:00 UTC; driver says 12:20", after: "20:00 UTC" },
  { label: "Delivery promise", before: "23 Oct 10:00–12:00 UTC", after: "Unchanged; ferry arrives 23 Oct 04:00, Lahti about 05:30 UTC (estimate)" },
  { label: "Old booking", before: "Active", after: "Released only once the new booking is confirmed" },
]

export const proposals = [
  {
    id: "prop_603_a", order_id: "ord-00603", run_id: "run_603_a", proposed_by: "order-agent",
    command: "travel.rebook_ferry",
    summary: "Book the 22:00 crossing; delivery promise unchanged",
    rationale: "Driver ETA at check-in is 12:20, after the 12:00 cutoff",
    payload: { travel_option_id: "opt_mock_603_2200", release_reservation_id: "res-x1082202e8d139d61", release_after_new_booking: true },
    before_after: [{ label: "Ferry", before: "14:00 crossing, booked (WBV-FERRY-00603)", after: "22:00 crossing, from a list checked 07:10" }],
    evidence_refs: [{ table: "travel_options", id: "opt_mock_603_2200", observed_at: "2026-10-21T07:10:00Z", mock: true }],
    approval: "DESK", owner_desk: "ops-travel",
    cost: null, decision_deadline: "2026-10-21T12:00:00Z",
    status: "SENT_BACK",
    check: { outcome: "SEND_BACK", reasons: [{ check: "fresh_data", message: "A booking needs capacity checked in the last 30 minutes; this list is from 07:10 (111 min old)" }], checked_at: "2026-10-21T09:01:15Z" },
    review: null, execution: null, created_at: "2026-10-21T09:01:05Z",
  },
  {
    id: "prop_603_b", order_id: "ord-00603", run_id: "run_603_b", proposed_by: "order-agent",
    command: "travel.rebook_ferry",
    summary: "Book the 22:00 crossing; delivery promise unchanged",
    rationale: "Driver ETA at check-in is 12:20, after the 12:00 cutoff. The 22:00 crossing has space (checked 09:01) and keeps the 23 Oct promise.",
    payload: { travel_option_id: "opt_mock_603_2200", release_reservation_id: "res-x1082202e8d139d61", release_after_new_booking: true },
    before_after: beforeAfter, evidence_refs: evidence,
    approval: "DESK", owner_desk: "ops-travel",
    cost: { amount_minor: 4500, currency: "EUR", who_pays: null, note: "Change fee (mock)" },
    decision_deadline: "2026-10-21T12:00:00Z",
    status: "PENDING_REVIEW",
    check: { outcome: "PASS", reasons: [], checked_at: "2026-10-21T09:02:30Z" },
    review: null, execution: null, created_at: "2026-10-21T09:02:10Z",
  },
] satisfies Proposal[]

/** The same proposal after the operator approves it, for the "what happens next" state. */
export const executedProposal = {
  ...proposals[1],
  status: "EXECUTED",
  review: { decision: "APPROVED", final_payload: proposals[1].payload, note: null, who_pays: "BAHN", reviewer: "ops-travel", at: "2026-10-21T09:06:00Z" },
  execution: {
    status: "SUCCEEDED", at: "2026-10-21T09:06:05Z",
    result_summary: "Booked the 22:00 crossing (mock), then released the 14:00 booking",
    references: [{ kind: "ferry_booking", value: "WBV-FERRY-00603-R2" }],
    next_steps: [
      "Shift Watch sends the driver the new crossing with its reference and the 20:00 check-in",
      "Boarding stays unconfirmed until the gate scan",
      "Lahti receiver still to confirm before 23 Oct",
    ],
    error: null,
  },
} satisfies Proposal

export const status = {
  order_id: "ord-00603", run_id: "run_603_b",
  summary: "22:00 crossing proposed; waiting on the travel desk",
  waiting_on: "OPERATOR", next_check_at: "2026-10-21T09:30:00Z",
  decision_deadline: "2026-10-21T12:00:00Z", deadline_reason: "Current crossing's check-in closes; the driver needs a plan",
  owner_desk: "ops-travel", open_proposal_ids: ["prop_603_b"], updated_at: "2026-10-21T09:02:20Z",
} satisfies OrderStatus
