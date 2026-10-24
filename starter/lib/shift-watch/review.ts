// Shift Watch's pass over one order after its agent runs: check pending proposals and release or
// hold the agent's messages to the driver. It decides; the agent loop does the waking, so the two
// modules don't import each other.
import { and, eq, gt, inArray, or } from "drizzle-orm"
import { INSTRUCTION } from "@/lib/agents/rules"
import { nowIso, UNDO_MS } from "@/lib/clock"
import { db } from "@/lib/db"
import { messages, relatedRecords } from "@/lib/schema"
import { agentRuns, agentSteps, driverMessages, proposals } from "@/lib/schema-ours"
import type { DriverMessage, HeldMessageReview } from "@/lib/contract"
import { toDriverMessage } from "./case"
import { checkProposal, driverMessageOk } from "./checks"
import { liveReading, readProposalText } from "./judge"

/** After this many send-backs on one order, the next failing proposal is held for a person instead. */
const MAX_SEND_BACKS = 2

export type ReviewOutcome = { sendBack: { proposalId: string; reason: string } | null; released: number; held: number }

async function failuresFor(orderId: string) {
  // Bahn's recorded proposals that failed when they ran, and ours.
  const bahn = await db.select({ details: relatedRecords.details }).from(relatedRecords)
    .where(and(eq(relatedRecords.orderId, orderId), eq(relatedRecords.collection, "agent_proposals")))
  const ours = await db.select({ command: proposals.command, execution: proposals.execution }).from(proposals)
    .where(and(eq(proposals.orderId, orderId), eq(proposals.status, "FAILED")))
  return [
    ...bahn.map((r) => r.details as { command: string; execution?: { status?: string; attempted_at?: string } })
      .filter((d) => d.execution?.status === "FAILED" && d.execution.attempted_at)
      .map((d) => ({ at: d.execution!.attempted_at!, command: d.command })),
    ...ours.filter((p) => p.execution?.at).map((p) => ({ at: p.execution!.at, command: p.command })),
  ]
}

async function outcomeChecks(orderId: string): Promise<string[]> {
  const rows = await db.select({ at: agentSteps.at }).from(agentSteps)
    .innerJoin(agentRuns, eq(agentRuns.id, agentSteps.runId))
    .where(and(eq(agentRuns.orderId, orderId), eq(agentSteps.tool, "check_booking_outcome"), eq(agentSteps.kind, "TOOL_CALL")))
  return rows.map((r) => r.at)
}

async function reviewProposals(orderId: string): Promise<ReviewOutcome["sendBack"]> {
  const pending = await db.select().from(proposals).where(and(eq(proposals.orderId, orderId), eq(proposals.status, "PENDING_CHECK")))
  if (!pending.length) return null
  const failures = await failuresFor(orderId)
  const checkedAt = await outcomeChecks(orderId)
  const sentBack = (await db.select({ id: proposals.id }).from(proposals).where(and(eq(proposals.orderId, orderId), eq(proposals.status, "SENT_BACK")))).length
  let sendBack: ReviewOutcome["sendBack"] = null
  for (const p of pending) {
    // Live: Claude also reads the text. If that call fails, the rules still run on their own.
    const read = liveReading() ? await readProposalText(p).catch(() => undefined) : undefined
    const result = checkProposal({
      command: p.command, summary: p.summary, payload: p.payload, created_at: p.createdAt,
      evidence: p.evidenceRefs.map((e) => ({ table: e.table, id: e.id, observed_at: e.observed_at })),
      failures, outcomeCheckedSince: (iso) => checkedAt.some((at) => at > iso),
    }, read)
    let outcome = result.outcome
    const reasons = [...result.reasons]
    if (outcome === "SEND_BACK" && sentBack >= MAX_SEND_BACKS) {
      outcome = "HOLD"
      reasons.push({ check: reasons[0].check, message: `Sent back ${sentBack} times already; a person takes it from here.` })
    }
    const status = outcome === "PASS" ? "PENDING_REVIEW" : outcome === "SEND_BACK" ? "SENT_BACK" : "HELD"
    await db.update(proposals).set({ status, check: { outcome, reasons, checked_at: nowIso() } }).where(eq(proposals.id, p.id))
    if (status === "SENT_BACK") sendBack = { proposalId: p.id, reason: reasons.map((r) => r.message).join(" ") }
  }
  return sendBack
}

async function reviewDriverMessages(orderId: string) {
  const pending = await db.select().from(driverMessages)
    .where(and(eq(driverMessages.orderId, orderId), eq(driverMessages.status, "PENDING_CHECK"), eq(driverMessages.direction, "OUT")))
  let released = 0
  let held = 0
  for (const m of pending) {
    // Live: Claude reads the message too, as for proposals. If that call fails, the word list still runs.
    const read = liveReading() ? await readProposalText({ command: "driver.message", summary: m.text, payload: {} }).catch(() => undefined) : undefined
    let ok = driverMessageOk(m.text, read)
    if (ok && INSTRUCTION.test(m.text)) {
      // A repeated instruction must cite an operator's own message to this driver.
      const [cited] = m.repeatsMessageId
        ? await db.select({ details: messages.details, authorType: messages.authorType }).from(messages).where(eq(messages.id, m.repeatsMessageId))
        : []
      ok = !!cited && cited.authorType === "operator" && (cited.details as { recipient_id?: string }).recipient_id === m.driverId
    }
    await db.update(driverMessages).set({ status: ok ? "SENT" : "HELD" }).where(eq(driverMessages.id, m.id))
    if (ok) released++
    else held++
  }
  return { released, held }
}

export async function reviewOrder(orderId: string): Promise<ReviewOutcome> {
  const sendBack = await reviewProposals(orderId)
  const { released, held } = await reviewDriverMessages(orderId)
  return { sendBack, released, held }
}

type HeldResult = { ok: true; message: DriverMessage } | { ok: false; status: number; error: string }

/** A person sends a held message (as is, or their edited text) or discards it. Only a held message can be
 *  reviewed, once: the update is conditional on the status. A sent one is delivered after the undo window:
 *  the driver's thread shows a message only from its created_at. */
export async function reviewHeld(id: string, req: HeldMessageReview): Promise<HeldResult> {
  const edited = req.action === "SEND" && req.text?.trim() ? req.text.trim() : null
  const deliverAt = new Date(Date.parse(nowIso()) + UNDO_MS).toISOString()
  const [m] = await db.update(driverMessages)
    .set(req.action === "DISCARD" ? { status: "DISCARDED" } : { status: "SENT", createdAt: deliverAt, ...(edited ? { text: edited, author: "operator" } : {}) })
    .where(and(eq(driverMessages.id, id), eq(driverMessages.status, "HELD"))).returning()
  if (m) return { ok: true, message: toDriverMessage(m) }
  const [exists] = await db.select({ status: driverMessages.status }).from(driverMessages).where(eq(driverMessages.id, id))
  return exists ? { ok: false, status: 409, error: `This message is ${exists.status.toLowerCase()}; only a held message can be sent or discarded.` } : { ok: false, status: 404, error: "No such message" }
}

/** Put a reviewed message back to held: a send before it reaches the driver, or a discard at any time. */
export async function undoHeld(id: string): Promise<HeldResult> {
  const now = nowIso()
  const [m] = await db.update(driverMessages).set({ status: "HELD" })
    .where(and(eq(driverMessages.id, id), or(eq(driverMessages.status, "DISCARDED"), and(eq(driverMessages.status, "SENT"), gt(driverMessages.createdAt, now)))))
    .returning()
  if (m) return { ok: true, message: toDriverMessage(m) }
  const [exists] = await db.select({ id: driverMessages.id }).from(driverMessages).where(eq(driverMessages.id, id))
  return exists ? { ok: false, status: 409, error: "Too late to undo: the driver already has this message." } : { ok: false, status: 404, error: "No such message" }
}

/** Proposals still waiting for Shift Watch, oldest first (for a catch-up pass after a restart). */
export async function pendingOrders(): Promise<string[]> {
  const rows = await db.selectDistinct({ orderId: proposals.orderId }).from(proposals).where(inArray(proposals.status, ["PENDING_CHECK"]))
  const dm = await db.selectDistinct({ orderId: driverMessages.orderId }).from(driverMessages).where(and(eq(driverMessages.status, "PENDING_CHECK"), gt(driverMessages.createdAt, "1970-01-01T00:00:00Z")))
  return [...new Set([...rows.map((r) => r.orderId), ...dm.map((r) => r.orderId).filter((id): id is string => !!id)])]
}
