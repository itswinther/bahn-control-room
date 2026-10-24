// Shift Watch's pass over one order after its agent runs: check pending proposals and release or
// hold the agent's messages to the driver. It decides; the agent loop does the waking, so the two
// modules don't import each other.
import { and, eq, gt, inArray } from "drizzle-orm"
import { INSTRUCTION, DRIVING_ADVICE } from "@/lib/agents/rules"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { messages, relatedRecords } from "@/lib/schema"
import { agentRuns, agentSteps, driverMessages, proposals } from "@/lib/schema-ours"
import { checkProposal } from "./checks"
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
    let ok = !DRIVING_ADVICE.test(m.text)
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

/** Proposals still waiting for Shift Watch, oldest first (for a catch-up pass after a restart). */
export async function pendingOrders(): Promise<string[]> {
  const rows = await db.selectDistinct({ orderId: proposals.orderId }).from(proposals).where(inArray(proposals.status, ["PENDING_CHECK"]))
  const dm = await db.selectDistinct({ orderId: driverMessages.orderId }).from(driverMessages).where(and(eq(driverMessages.status, "PENDING_CHECK"), gt(driverMessages.createdAt, "1970-01-01T00:00:00Z")))
  return [...new Set([...rows.map((r) => r.orderId), ...dm.map((r) => r.orderId).filter((id): id is string => !!id)])]
}
