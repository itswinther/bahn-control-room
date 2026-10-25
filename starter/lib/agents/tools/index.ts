import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { and, desc, eq, inArray, lte } from "drizzle-orm"
import type { BeforeAfter, EvidenceRef, WaitingOn } from "@/lib/contract"
import { route, tableFor } from "@/lib/agents/rules"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { driverRest, ferryCapacity } from "@/lib/mocks"
import { loadOrder } from "@/lib/present/load"
import { buildRecordView } from "@/lib/present/record"
import { agentNotes, driverMessages, orderStatus, proposals } from "@/lib/schema-ours"
import { askDriver, askSite, askToolDefs, checkBookingOutcome } from "./ask"
import { orderParties } from "@/lib/shift-watch/language"

export type ToolContext = {
  runId: string
  orderId: string
  /** Everything the tools returned this run; a proposal may only cite ids that appear in it. */
  seen: string
  /** When a tool returned each record this run, and whether it was mock data; a proposal's evidence takes these, not the agent's. */
  observed: Record<string, { at: string; mock: boolean }>
  proposed: boolean
  finished: boolean
}

export type ToolOutput = { result: unknown; summary: string; error?: boolean }

const fail = (message: string): ToolOutput => ({ result: { error: message }, summary: message, error: true })
const hhmm = (iso: string) => iso.slice(11, 16)

const WAITING_ON: WaitingOn[] = ["OPERATOR", "DRIVER", "SITE", "CUSTOMER", "CARRIER", "NOTHING"]
const OPEN: string[] = ["PENDING_CHECK", "PENDING_REVIEW", "HELD"]

export const toolDefs: BetaTool[] = [
  {
    name: "read_notes",
    description: "Read your notes for this order: what earlier runs learned, with sources and times. Call this first.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_order",
    description: "Read the order: route, time windows, driver assignment, bookings, travel quotes, alerts, work items, operator notes, Bahn's own agent proposals and their reviews, and the proposals you made earlier with Shift Watch's check result, what a person decided, and what ran (booking references included). Also lists sites owned by the paying customer, which you must never contact.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "read_messages",
    description: "Read the order's conversations and driver messages, each with sender, recipient, channel and time. A message is what someone said, not a verified fact.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check_ferry_capacity",
    description: "Look up vehicle ferry options for this order. refresh=false returns the cached list with the time it was checked; refresh=true asks the carrier now. Either way it is a quote, not a booking.",
    input_schema: { type: "object", properties: { refresh: { type: "boolean" } }, required: ["refresh"], additionalProperties: false },
  },
  {
    name: "check_driver_rest",
    description: "Check whether the driver can rest enough between reaching the terminal and the check-in cutoff of the sailing you are considering.",
    input_schema: {
      type: "object",
      properties: {
        driver_id: { type: "string" },
        check_in_cutoff_at: { type: "string", description: "ISO 8601 UTC, of the sailing you are considering" },
        available_from: { type: ["string", "null"], description: "ISO 8601 UTC: when the driver can be at the terminal, after any pickup and drive still ahead. Leave null if the driver is already there." },
      },
      required: ["driver_id", "check_in_cutoff_at"], additionalProperties: false,
    },
  },
  {
    name: "write_notes",
    description: "Replace your notes for this order. Short markdown: each fact with its source and time, and what is still open. Write them before you finish.",
    input_schema: { type: "object", properties: { markdown: { type: "string" } }, required: ["markdown"], additionalProperties: false },
  },
  {
    name: "propose",
    description: "Hand a person one decision. Use it for anything that books, buys, cancels, changes a date, promise or cost, instructs a driver, or contacts a customer. At most one per run; Shift Watch checks it before a person sees it. command is domain.action with domain one of: travel, assignment, offer, driver, pickup, condition, expense, customer, billing, recovery.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        summary: { type: "string", description: "The decision in one line, in plain words" },
        rationale: { type: "string" },
        payload: { type: "object", description: "What would run if approved" },
        before_after: {
          type: "array",
          items: { type: "object", properties: { label: { type: "string" }, before: { type: "string" }, after: { type: "string" } }, required: ["label", "before", "after"], additionalProperties: false },
        },
        evidence_refs: {
          type: "array",
          description: "Records you read this run that back the proposal",
          items: {
            type: "object",
            properties: { table: { type: "string" }, id: { type: "string" }, observed_at: { type: ["string", "null"] }, mock: { type: "boolean" } },
            required: ["table", "id", "observed_at"], additionalProperties: false,
          },
        },
        cost: {
          type: ["object", "null"],
          description: "Leave who pays to the person deciding",
          properties: { amount_minor: { type: "integer" }, currency: { type: "string" }, note: { type: ["string", "null"] } },
          required: ["amount_minor", "currency"], additionalProperties: false,
        },
        decision_deadline: { type: ["string", "null"], description: "ISO 8601 UTC: when this decision stops being useful. If a driver or site is waiting, the time their patience or the slot runs out; if that has already passed, now. Null only if nothing is time-bound." },
      },
      required: ["command", "summary", "rationale", "payload", "before_after", "evidence_refs", "decision_deadline"],
      additionalProperties: false,
    },
  },
  {
    name: "finish",
    description: "End the run and record the order's status. Always the last call.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Where the order stands, in one line" },
        waiting_on: { type: "string", enum: WAITING_ON },
        next_check_at: { type: ["string", "null"] },
        decision_deadline: { type: ["string", "null"] },
        deadline_reason: { type: ["string", "null"] },
      },
      required: ["summary", "waiting_on"],
      additionalProperties: false,
    },
  },
  ...askToolDefs,
]

type Input = Record<string, unknown>
const str = (v: unknown) => (typeof v === "string" ? v : null)
const isIso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v))

async function getOrder(ctx: ToolContext): Promise<ToolOutput> {
  const loaded = await loadOrder(ctx.orderId)
  if (!loaded) return fail(`No order ${ctx.orderId}`)
  const view = buildRecordView(loaded.bundle)
  const ours = await db.select().from(proposals).where(eq(proposals.orderId, ctx.orderId)).orderBy(desc(proposals.createdAt))
  const customerSites = [loaded.pickupSite, loaded.deliverySite]
    .filter((s) => s && s.customerId === loaded.order.customerId)
    .map((s) => ({ id: s!.id, name: s!.name }))
  return {
    result: {
      now: nowIso(),
      order: view.header, story: view.story, attention: view.attention, journey: view.journey,
      bookings: view.reservations, travel_quotes: view.options, assignments: view.assignments,
      alerts: view.alerts, work_items: view.workItems, incidents: view.incidents, operator_notes: view.notes,
      documents: view.documents, bahn_agent_proposals: view.proposals,
      sites_owned_by_customer: customerSites,
      // Who reads what: a message drafted for the customer or a site is for a person to send in their language.
      languages: orderParties(loaded, await db.select({ direction: driverMessages.direction, language: driverMessages.language }).from(driverMessages)
        .where(eq(driverMessages.orderId, ctx.orderId)).orderBy(driverMessages.createdAt)),
      // What a person decided and what ran: our mock bookings aren't in the dataset's reservations, so this is
      // the only place a later run learns the new booking reference.
      our_proposals: ours.map((p) => ({ id: p.id, status: p.status, command: p.command, summary: p.summary, check: p.check, created_at: p.createdAt,
        review: p.review && { decision: p.review.decision, note: p.review.note, who_pays: p.review.who_pays, reviewer: p.review.reviewer, at: p.review.at },
        execution: p.execution && { status: p.execution.status, at: p.execution.at, result: p.execution.result_summary, references: p.execution.references, next_steps: p.execution.next_steps, error: p.execution.error } })),
    },
    summary: `Read ${view.header.reference}: ${view.reservations.length} booking(s), ${view.alerts.length} alert(s), ${ours.length} earlier proposal(s) of ours`,
  }
}

async function readMessages(ctx: ToolContext): Promise<ToolOutput> {
  const loaded = await loadOrder(ctx.orderId)
  if (!loaded) return fail(`No order ${ctx.orderId}`)
  const view = buildRecordView(loaded.bundle)
  const driver = await db.select().from(driverMessages)
    .where(and(eq(driverMessages.orderId, ctx.orderId), lte(driverMessages.createdAt, nowIso())))
    .orderBy(driverMessages.createdAt)
  const count = view.threads.reduce((n, t) => n + t.messages.length, 0)
  const chat = driver.length ? `, and ${driver.length} in the driver chat` : ""
  return { result: { threads: view.threads, driver_chat: driver }, summary: `${count} message(s) in ${view.threads.length} thread(s)${chat}` }
}

async function propose(input: Input, ctx: ToolContext): Promise<ToolOutput> {
  if (ctx.proposed) return fail("One proposal per run. Finish now.")
  // One open proposal per order: a second one would leave a person two versions of the same decision.
  const [open] = await db.select({ id: proposals.id, status: proposals.status }).from(proposals)
    .where(and(eq(proposals.orderId, ctx.orderId), inArray(proposals.status, OPEN as never[]))).limit(1)
  if (open) return fail(`Proposal ${open.id} is still open (${open.status}). Wait for its outcome; don't propose again.`)
  const command = str(input.command)
  if (!command || !/^[a-z_]+\.[a-z_]+$/.test(command)) return fail("command must look like domain.action")
  const refs = (Array.isArray(input.evidence_refs) ? (input.evidence_refs as EvidenceRef[]) : [])
    .map((r) => (r?.id ? { ...r, table: tableFor(r.id, r.table) } : r))
    .map((r) => (r?.id && ctx.observed[r.id] ? { ...r, observed_at: ctx.observed[r.id].at, mock: ctx.observed[r.id].mock } : r))
  if (!refs.length) return fail("A proposal needs at least one evidence record.")
  const unseen = refs.filter((r) => !r?.id || !ctx.seen.includes(r.id))
  if (unseen.length) return fail(`Not in anything you read this run: ${unseen.map((r) => r?.id).join(", ")}. Cite only records you read.`)
  if (input.decision_deadline != null && !isIso(input.decision_deadline)) return fail("decision_deadline must be ISO 8601 UTC")
  const cost = input.cost && typeof input.cost === "object"
    ? { ...(input.cost as { amount_minor: number; currency: string; note?: string | null }), note: (input.cost as { note?: string | null }).note ?? null, who_pays: null }
    : null
  const id = `prop_${crypto.randomUUID().slice(0, 8)}`
  const { approval, owner_desk } = route(command)
  await db.insert(proposals).values({
    id, orderId: ctx.orderId, runId: ctx.runId, proposedBy: "order-agent", command,
    summary: str(input.summary) ?? "", rationale: str(input.rationale) ?? "",
    payload: (input.payload as Record<string, unknown>) ?? {},
    beforeAfter: Array.isArray(input.before_after) ? (input.before_after as BeforeAfter[]) : [],
    evidenceRefs: refs, approval, ownerDesk: owner_desk, cost,
    decisionDeadline: str(input.decision_deadline), status: "PENDING_CHECK", createdAt: nowIso(),
  })
  ctx.proposed = true
  return { result: { id, status: "PENDING_CHECK", approval, owner_desk }, summary: `Proposal ${id} written, waiting for Shift Watch` }
}

async function finish(input: Input, ctx: ToolContext): Promise<ToolOutput> {
  const waitingOn = WAITING_ON.find((w) => w === input.waiting_on)
  if (!waitingOn) return fail(`waiting_on must be one of ${WAITING_ON.join(", ")}`)
  for (const key of ["next_check_at", "decision_deadline"]) if (input[key] != null && !isIso(input[key])) return fail(`${key} must be ISO 8601 UTC`)
  const open = await db.select().from(proposals)
    .where(and(eq(proposals.orderId, ctx.orderId), inArray(proposals.status, OPEN as never[])))
    .orderBy(desc(proposals.createdAt))
  const row = {
    orderId: ctx.orderId, runId: ctx.runId, summary: str(input.summary) ?? "", waitingOn,
    nextCheckAt: str(input.next_check_at), decisionDeadline: str(input.decision_deadline), deadlineReason: str(input.deadline_reason),
    ownerDesk: open[0]?.ownerDesk ?? null, openProposalIds: open.map((p) => p.id), updatedAt: nowIso(),
  }
  await db.insert(orderStatus).values(row).onConflictDoUpdate({ target: orderStatus.orderId, set: row })
  ctx.finished = true
  return { result: { ok: true }, summary: row.summary }
}

export async function runTool(name: string, input: Input, ctx: ToolContext): Promise<ToolOutput> {
  switch (name) {
    case "read_notes": {
      const [note] = await db.select().from(agentNotes).where(eq(agentNotes.orderId, ctx.orderId))
      return note ? { result: { markdown: note.markdown, updated_at: note.updatedAt }, summary: `Notes from ${note.runId}` } : { result: { markdown: null }, summary: "No notes yet for this order" }
    }
    case "get_order": return getOrder(ctx)
    case "read_messages": return readMessages(ctx)
    case "check_ferry_capacity": {
      const r = ferryCapacity(ctx.orderId, input.refresh === true, nowIso())
      for (const o of r.options) ctx.observed[o.id] = { at: r.checked_at, mock: r.mock }
      const open = r.options.filter((o) => o.vehicle_space).length
      return { result: r, summary: `${input.refresh ? "Fresh" : "Cached"} list, checked ${hhmm(r.checked_at)}: ${open} of ${r.options.length} option(s) with vehicle space` }
    }
    case "check_driver_rest": {
      if (!str(input.driver_id) || !isIso(input.check_in_cutoff_at)) return fail("driver_id and an ISO check_in_cutoff_at are required")
      if (input.available_from != null && !isIso(input.available_from)) return fail("available_from must be ISO 8601 UTC or null")
      const from = str(input.available_from) ?? nowIso()
      const r = driverRest(input.driver_id as string, input.check_in_cutoff_at as string, from)
      ctx.observed[input.driver_id as string] = { at: nowIso(), mock: true }
      return { result: r, summary: `${r.rest_hours_before_check_in} h of rest possible; ${r.fits ? "fits" : "too little"}` }
    }
    case "write_notes": {
      const markdown = str(input.markdown)
      if (!markdown) return fail("markdown is required")
      const row = { orderId: ctx.orderId, markdown, runId: ctx.runId, updatedAt: nowIso() }
      await db.insert(agentNotes).values(row).onConflictDoUpdate({ target: agentNotes.orderId, set: row })
      return { result: { ok: true }, summary: "Notes updated" }
    }
    case "ask_driver": return askDriver(input, ctx)
    case "ask_site": return askSite(input, ctx)
    case "check_booking_outcome": return checkBookingOutcome(input, ctx)
    case "propose": return propose(input, ctx)
    case "finish": return finish(input, ctx)
    default: return fail(`Unknown tool ${name}`)
  }
}
