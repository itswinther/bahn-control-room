/**
 * Shared shapes from the team plan ("Shared contract").
 * Proposal, OrderStatus, DriverMessage and AgentStep follow the plan field for field.
 * QueueResponse, QueueItem and CaseView are the frontend's proposal for what
 * GET /api/queue and GET /api/cases/:orderId return — confirm with Backend 2.
 */

export type Iso = string;

export type Approval = "NONE" | "DESK" | "SHIFT_LEAD" | "CUSTOMER_VIA_PERSON";

export type ProposalStatus =
  | "PENDING_CHECK"
  | "SENT_BACK"
  | "HELD"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "FAILED";

export type Desk =
  | "ops-travel"
  | "ops-dispatch"
  | "ops-shift"
  | "ops-readiness"
  | "ops-support"
  | "ops-expenses";

export type WhoPays = "BAHN" | "CUSTOMER" | "DRIVER_EXPENSE" | "UNDECIDED";

export interface EvidenceRef {
  table: string;
  id: string;
  observed_at: Iso;
  label?: string;
}

export interface BeforeAfter {
  label: string;
  before: string;
  after: string;
}

export interface Proposal {
  id: string;
  order_id: string;
  proposed_by: "order-agent" | "shift-watch";
  command: string;
  summary: string;
  rationale: string;
  payload: Record<string, unknown>;
  before_after: BeforeAfter[];
  evidence_refs: EvidenceRef[];
  approval: Approval;
  owner_desk: Desk;
  cost: { amount_minor: number; currency: string; who_pays: WhoPays | null } | null;
  decision_deadline: Iso | null;
  status: ProposalStatus;
  check: { outcome: "PASS" | "SENT_BACK" | "HELD"; reasons: string[] } | null;
  review: {
    decision: "APPROVED" | "EDITED" | "REJECTED";
    by: string;
    at: Iso;
    note?: string;
  } | null;
  execution: { status: "RUNNING" | "DONE" | "FAILED"; reference?: string; at?: Iso } | null;
  created_at?: Iso;
  /** What happens after approval, in plain steps. Frontend addition. */
  next_steps?: string[];
}

export interface OrderStatus {
  order_id: string;
  summary: string;
  waiting_on: "OPERATOR" | "DRIVER" | "SITE" | "CUSTOMER" | "AGENT" | "NOBODY";
  next_check_at: Iso | null;
  decision_deadline: Iso | null;
  deadline_reason: string | null;
  owner_desk: Desk | null;
}

export interface DriverMessage {
  id: string;
  driver_id: string;
  order_id: string | null;
  direction: "IN" | "OUT";
  author: "driver" | "shift-watch" | "operator";
  text: string;
  language: string;
  /** English translation, when the message wasn't in English. Frontend addition. */
  translation?: string;
  quick_replies: string[];
  hear_back_by: Iso | null;
  created_at: Iso;
}

export interface AgentStep {
  run_id: string;
  seq: number;
  agent: "order-agent" | "shift-watch";
  kind: "READ" | "TOOL_CALL" | "ASK" | "PROPOSE" | "CHECK" | "FINISH";
  tool: string | null;
  input: Record<string, unknown>;
  result_summary: string;
  at: Iso;
}

/* ---------- Frontend proposal for the read routes ---------- */

export type QueueKind =
  | "SAFETY"
  | "DECISION"
  | "HELD"
  | "DRIVER_WAITING"
  | "LOOSE_END"
  | "WAITING";

export interface QueueItem {
  id: string;
  order_id: string;
  reference: string;
  kind: QueueKind;
  title: string;
  vehicle: string | null;
  route: string | null;
  owner_desk: Desk;
  deadline: Iso | null;
  deadline_reason: string | null;
  checked: string[];
  linked_orders?: string[];
  proposal_id?: string;
  /** What's scheduled for this order, for the overview timeline. Frontend addition. */
  events?: TimelineEvent[];
}

export interface TimelineEvent {
  type: "DECISION" | "DRIVER" | "TRAVEL" | "CHECK" | "SAFETY" | "PARKED";
  start: Iso;
  /** No end: a moment, like an agent's next scheduled check. */
  end: Iso | null;
  label: string;
}

export interface QueueResponse {
  generated_at: Iso;
  agent_status: "ONLINE" | "OFFLINE";
  mode: "REPLAY" | "LIVE" | "SAMPLE";
  orders_checked: number;
  quiet_count: number;
  summary: string[];
  /** Recent things Shift Watch did, newest first, for the ticker. Frontend addition. */
  activity?: { at: Iso; text: string; order_id?: string }[];
  items: QueueItem[];
}

export type Source =
  | "APP_CHAT"
  | "EMAIL"
  | "CALL"
  | "SYSTEM"
  | "AGENT"
  | "SHIFT_WATCH"
  | "OPERATOR"
  | "TRACKING";

export interface TimelineEntry {
  id: string;
  at: Iso;
  source: Source;
  who: string;
  text: string;
  language?: string;
  translation?: string;
  /** Messages written by an agent are always marked. */
  agent_written?: boolean;
  hear_back_by?: Iso | null;
  tone?: "neutral" | "warning" | "critical" | "good";
}

export type LegState = "BOOKED" | "QUOTED" | "UNCONFIRMED" | "NOT_BOOKED" | "FAILED" | "NOT_NEEDED";

export interface TravelLeg {
  id: string;
  mode: "FERRY" | "TRAIN" | "FLIGHT" | "HOTEL" | "DRIVE" | "TAXI";
  label: string;
  when: string;
  state: LegState;
  detail: string;
  reference?: string;
  checked_at?: Iso;
}

export interface Fact {
  label: string;
  value: string;
  source: string;
  at: Iso | null;
}

export interface AgentNote {
  text: string;
  source: string;
  at: Iso | null;
  guess?: boolean;
}

export interface CaseView {
  order: {
    id: string;
    reference: string;
    vehicle: string;
    pickup: { place: string; country: string; tz: string };
    delivery: { place: string; country: string; tz: string };
    customer: string;
    driver: { id: string; name: string } | null;
    linked_orders?: { id: string; reference: string; why: string }[];
  };
  headline: string;
  kind: QueueKind;
  status: OrderStatus;
  proposals: Proposal[];
  steps: AgentStep[];
  stop_reason: string | null;
  notes: AgentNote[];
  notes_updated_at: Iso | null;
  timeline: TimelineEntry[];
  travel: TravelLeg[];
  facts: Fact[];
}
