import { sql } from "drizzle-orm"
import { boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core"
import type {
  AgentRun, AgentStep, Approval, BeforeAfter, Check, Cost, Desk, DriverMessage, EvidenceRef, Execution,
  ProposalStatus, QuickReply, Review, WaitingOn,
} from "./contract"

// Our tables, kept apart from the starter's: no foreign keys into them, because the
// starter's reseed refuses to run when other tables point into its data.

// timestamptz that reads back as ISO 8601 UTC, as the contract promises (Postgres's own
// text form is "2026-10-21 09:00:00+00", which neither sorts nor displays like ISO).
const at = customType<{ data: string; driverData: string }>({
  dataType: () => "timestamp with time zone",
  fromDriver: (value) => new Date(value).toISOString(),
})

export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  reason: text("reason").$type<AgentRun["reason"]>().notNull(),
  reasonDetail: text("reason_detail").notNull(),
  mode: text("mode").$type<AgentRun["mode"]>().notNull(),
  status: text("status").$type<AgentRun["status"]>().notNull(),
  stopReason: text("stop_reason"),
  toolCalls: integer("tool_calls").notNull().default(0),
  startedAt: at("started_at").notNull(),
  endedAt: at("ended_at"),
}, (t) => [
  index("agent_runs_order_idx").on(t.orderId),
  // One run at a time per order, enforced by the database so two parallel requests can't both start.
  uniqueIndex("agent_runs_one_running_idx").on(t.orderId).where(sql`status = 'RUNNING'`),
])

export const agentSteps = pgTable("agent_steps", {
  runId: text("run_id").notNull(),
  seq: integer("seq").notNull(),
  agent: text("agent").$type<AgentStep["agent"]>().notNull(),
  kind: text("kind").$type<AgentStep["kind"]>().notNull(),
  tool: text("tool"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  resultSummary: text("result_summary").notNull(),
  at: at("at").notNull(),
}, (t) => [primaryKey({ columns: [t.runId, t.seq] })])

export const agentNotes = pgTable("agent_notes", {
  orderId: text("order_id").primaryKey(),
  markdown: text("markdown").notNull(),
  runId: text("run_id").notNull(),
  updatedAt: at("updated_at").notNull(),
})

export const orderStatus = pgTable("order_status", {
  orderId: text("order_id").primaryKey(),
  runId: text("run_id").notNull(),
  summary: text("summary").notNull(),
  waitingOn: text("waiting_on").$type<WaitingOn>().notNull(),
  nextCheckAt: at("next_check_at"),
  decisionDeadline: at("decision_deadline"),
  deadlineReason: text("deadline_reason"),
  ownerDesk: text("owner_desk").$type<Desk>(),
  openProposalIds: jsonb("open_proposal_ids").$type<string[]>().notNull(),
  updatedAt: at("updated_at").notNull(),
})

export const proposals = pgTable("proposals", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  runId: text("run_id").notNull(),
  proposedBy: text("proposed_by").$type<"order-agent">().notNull(),
  command: text("command").notNull(),
  summary: text("summary").notNull(),
  rationale: text("rationale").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  beforeAfter: jsonb("before_after").$type<BeforeAfter[]>().notNull(),
  evidenceRefs: jsonb("evidence_refs").$type<EvidenceRef[]>().notNull(),
  approval: text("approval").$type<Approval>().notNull(),
  ownerDesk: text("owner_desk").$type<Desk>().notNull(),
  cost: jsonb("cost").$type<Cost>(),
  decisionDeadline: at("decision_deadline"),
  status: text("status").$type<ProposalStatus>().notNull(),
  check: jsonb("check").$type<Check>(),
  review: jsonb("review").$type<Review>(),
  execution: jsonb("execution").$type<Execution>(),
  createdAt: at("created_at").notNull(),
}, (t) => [index("proposals_order_idx").on(t.orderId), index("proposals_status_idx").on(t.status)])

export const driverMessages = pgTable("driver_messages", {
  id: text("id").primaryKey(),
  driverId: text("driver_id").notNull(),
  orderId: text("order_id"),
  direction: text("direction").$type<DriverMessage["direction"]>().notNull(),
  author: text("author").$type<DriverMessage["author"]>().notNull(),
  text: text("text").notNull(),
  language: text("language").notNull(),
  translation: text("translation"),
  quickReplies: jsonb("quick_replies").$type<QuickReply[]>().notNull(),
  hearBackBy: at("hear_back_by"),
  simulated: boolean("simulated").notNull().default(false),
  createdAt: at("created_at").notNull(),
}, (t) => [index("driver_messages_driver_idx").on(t.driverId)])
