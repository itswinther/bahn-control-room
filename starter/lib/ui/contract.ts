/**
 * What the screens render. Proposals, steps, driver messages and order status are the backend's own
 * shapes (lib/contract.ts). QueueItem and CaseView are the screens' reading of GET /api/queue and
 * GET /api/cases/:orderId, built by lib/ui/adapt.ts.
 */
import type {
  AgentStep,
  Approval,
  CardOutcome,
  Desk,
  DriverMessage,
  OrderStatus,
  Proposal,
  WhoPays,
} from "@/lib/contract";

import type { LanguageNeed, Party } from "@/lib/shift-watch/language";

export type { AgentStep, Approval, CardOutcome, Desk, DriverMessage, LanguageNeed, OrderStatus, Party, Proposal, WhoPays };

export type Iso = string;

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
  proposal_id: string | null;
  held_message_id: string | null;
  /** Set for a few minutes after a person decides, so the row keeps its place and shows what happened. */
  outcome: CardOutcome | null;
  stopped_because: string | null;
  if_no_decision: string | null;
  escalated_from: Desk | null;
  /** Someone on the order wrote in another language: which, what's unclear, and which country team reads it. */
  language: LanguageNeed | null;
  /** A driver was promised an answer by this time and hasn't had one, whatever the card's kind. */
  driver_waiting_until: Iso | null;
  /** What's scheduled for this order, for the overview timeline. */
  events: TimelineEvent[];
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
  mode: "REPLAY" | "LIVE" | "SAMPLE";
  orders_checked: number;
  quiet_count: number;
  summary: string[];
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
  /** Sent to the driver: `text` is what they got, `translation` our English. */
  outgoing?: boolean;
  /** Messages written by an agent are always marked. */
  agent_written?: boolean;
  hear_back_by?: Iso | null;
  /** What the message leaves out ("no hour given"), as Shift Watch read it. Never filled in. */
  unclear?: string[];
  tone?: "neutral" | "warning" | "critical" | "good";
}

export type LegState = "BOOKED" | "QUOTED" | "REQUESTED" | "NOT_BOOKED";

export interface TravelLeg {
  id: string;
  mode: "FERRY" | "TRAIN" | "FLIGHT" | "HOTEL" | "DRIVE" | "TAXI" | "BUS";
  label: string;
  when: string;
  state: LegState;
  detail: string;
  reference?: string;
  checked_at?: Iso;
  /** Made up for the demo (a mock carrier check). */
  mock?: boolean;
}

export interface Fact {
  label: string;
  value: string;
  hint: string | null;
}

export interface AgentNote {
  text: string;
  source: string;
  at: Iso | null;
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
  };
  headline: string;
  detail: string | null;
  kind: QueueKind;
  status: OrderStatus | null;
  proposals: Proposal[];
  steps: AgentStep[];
  stop_reason: string | null;
  /** A run is going right now: the screen refreshes until it ends. */
  running: boolean;
  notes: AgentNote[];
  notes_updated_at: Iso | null;
  timeline: TimelineEntry[];
  travel: TravelLeg[];
  facts: Fact[];
  /** Agent messages to the driver that Shift Watch held for a person. */
  held_messages: DriverMessage[];
  /** Who is on the order and the language each likely reads; `mixed` on a cross-border order. */
  languages: { parties: Party[]; mixed: boolean };
}
