// Shared shapes between the order agent (Backend 1), Shift Watch (Backend 2) and the screens.
// Field names are snake_case to match the dataset and the JSON fixtures in fixtures/.
// Every time is an ISO 8601 UTC string on the demo clock, never the computer's clock.

import type { RecordView } from "./present/types"

export type Desk =
  | "ops-dispatch" | "ops-travel" | "ops-readiness" | "ops-support" | "ops-evidence" | "ops-expenses"
  | "ops-shift" | "ops-intake" | "ops-planning" | "ops-import" | "ops-finance"

// ---- Sources ----------------------------------------------------------------

/** A record a fact or proposal rests on. `mock` marks our made-up fixtures (ferry capacity, site replies). */
export type EvidenceRef = { table: string; id: string; observed_at: string | null; mock?: boolean }

// ---- Proposals ----------------------------------------------------------------

export type Approval = "NONE" | "DESK" | "SHIFT_LEAD" | "CUSTOMER_VIA_PERSON"

export type ProposalStatus =
  | "PENDING_CHECK"
  | "SENT_BACK" | "HELD" | "PENDING_REVIEW"
  | "APPROVED" | "REJECTED"
  | "EXECUTED" | "FAILED"

export type CheckName =
  | "fresh_data" | "quote_not_booking" | "no_blame" | "no_driving_advice"
  | "no_blind_retry" | "contact_rules" | "one_step_per_approval"

export type CheckOutcome = "PASS" | "SEND_BACK" | "HOLD"

export type Check = {
  outcome: CheckOutcome
  reasons: { check: CheckName; message: string }[]
  checked_at: string
}

export type WhoPays = "BAHN" | "CUSTOMER" | "DRIVER"

/** `who_pays` stays null until a person decides it on the card. */
export type Cost = { amount_minor: number; currency: string; who_pays: WhoPays | null; note: string | null }

export type BeforeAfter = { label: string; before: string; after: string }

export type Review = {
  decision: "APPROVED" | "EDITED" | "REJECTED"
  final_payload: Record<string, unknown>
  note: string | null
  who_pays: WhoPays | null
  reviewer: string
  at: string
}

export type Execution = {
  status: "SUCCEEDED" | "FAILED"
  at: string
  result_summary: string
  references: { kind: string; value: string }[]
  /** What the card shows under "what happens next". */
  next_steps: string[]
  error: string | null
}

export type Proposal = {
  id: string
  order_id: string
  run_id: string
  proposed_by: "order-agent"
  command: string
  summary: string
  rationale: string
  payload: Record<string, unknown>
  before_after: BeforeAfter[]
  evidence_refs: EvidenceRef[]
  approval: Approval
  owner_desk: Desk
  cost: Cost | null
  decision_deadline: string | null
  status: ProposalStatus
  check: Check | null
  review: Review | null
  execution: Execution | null
  created_at: string
}

// ---- Order agent: runs, steps, notes, status ------------------------------------

export type WakeReason = "DRIVER_MESSAGE" | "SENT_BACK" | "LOOSE_END" | "OPERATOR_REQUEST" | "NEXT_CHECK"

export type AgentRun = {
  id: string
  order_id: string
  reason: WakeReason
  reason_detail: string
  mode: "live" | "replay"
  status: "RUNNING" | "FINISHED" | "STOPPED" | "FAILED"
  /** Why it stopped short of finishing: a stop rule, the tool-call cap, an error. */
  stop_reason: string | null
  tool_calls: number
  started_at: string
  ended_at: string | null
}

export type AgentStep = {
  run_id: string
  seq: number
  agent: "order-agent" | "shift-watch"
  kind: "WAKE" | "TOOL_CALL" | "TEXT" | "FINISH" | "ERROR"
  tool: string | null
  input: Record<string, unknown>
  result_summary: string
  at: string
}

/** "What the agent knows": one markdown note per order, read first and written last on every run. */
export type AgentNote = { order_id: string; markdown: string; run_id: string; updated_at: string }

export type WaitingOn = "OPERATOR" | "DRIVER" | "SITE" | "CUSTOMER" | "CARRIER" | "NOTHING"

export type OrderStatus = {
  order_id: string
  run_id: string
  summary: string
  waiting_on: WaitingOn
  next_check_at: string | null
  decision_deadline: string | null
  deadline_reason: string | null
  owner_desk: Desk | null
  open_proposal_ids: string[]
  updated_at: string
}

// ---- Drivers -------------------------------------------------------------------

export type QuickReply = { kind: "YES_NO" | "CHOICE" | "LOCATION" | "PHOTO"; label: string; value: string }

export type DriverMessage = {
  id: string
  driver_id: string
  order_id: string | null
  direction: "IN" | "OUT"
  author: "driver" | "shift-watch" | "operator"
  text: string
  language: string
  /** English for operators when the driver writes in another language. */
  translation: string | null
  quick_replies: QuickReply[]
  hear_back_by: string | null
  /** True for the scripted demo driver and any line we invented. */
  simulated: boolean
  /** Agent messages to a driver wait for Shift Watch's checks (no driving advice) before they go out. */
  status: "PENDING_CHECK" | "SENT" | "HELD"
  created_at: string
}

// ---- Case view helpers -------------------------------------------------------------

/** Every travel leg shows booked (with its reference) or not booked yet. */
export type TravelLeg = {
  label: string
  kind: "FERRY" | "TRAIN" | "FLIGHT" | "BUS" | "TAXI" | "HOTEL" | "DRIVE"
  state: "BOOKED" | "QUOTED" | "REQUESTED" | "NOT_BOOKED"
  reference: string | null
  departs_at: string | null
  check_in_cutoff_at: string | null
  /** Booked is not boarded: boarding stays unconfirmed until a gate record exists. */
  boarding: "CONFIRMED" | "UNCONFIRMED" | null
  source: EvidenceRef
}

// ---- Routes ---------------------------------------------------------------------

export type QueueItem = {
  id: string
  kind: "PROPOSAL" | "LOOSE_END" | "DRIVER_WAITING"
  order_id: string
  reference: string
  decision: string
  owner_desk: Desk
  deadline: string | null
  deadline_reason: string | null
  safety: boolean
  checked: string[]
  proposal_id: string | null
}

/** GET /api/queue */
export type QueueResponse = { at: string; summary: [string, string, string]; items: QueueItem[]; quiet_count: number }

/** GET /api/cases/:orderId — the starter's order view plus our own records. */
export type CaseResponse = {
  view: RecordView
  proposals: Proposal[]
  status: OrderStatus | null
  note: AgentNote | null
  runs: AgentRun[]
  steps: AgentStep[]
  driver_messages: DriverMessage[]
  legs: TravelLeg[]
}

/** POST /api/proposals/:id/decision */
export type DecisionRequest = {
  decision: Review["decision"]
  final_payload?: Record<string, unknown>
  note?: string
  who_pays?: WhoPays
  reviewer: string
}

/** POST /api/agents/run */
export type RunRequest = { order_id: string; reason: WakeReason; reason_detail: string }
export type RunResponse = { run_id: string }

/** GET /api/runs/:runId */
export type RunResponseDetail = { run: AgentRun; steps: AgentStep[] }

/** POST /api/driver/messages */
export type DriverMessageRequest = { driver_id: string; text: string; quick_reply_value?: string }

/** POST /api/shift-watch/chat */
export type ChatRequest = { message: string; open_order_id: string | null }
