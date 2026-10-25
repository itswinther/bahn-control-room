import type { BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { and, desc, eq, gt, gte, lte, ne } from "drizzle-orm"
import type { AgentRun, AgentStep, RunRequest } from "@/lib/contract"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { orders } from "@/lib/schema"
import { agentRuns, agentSteps, driverMessages, orderStatus, proposals } from "@/lib/schema-ours"
import { liveSource, replaySource, type ModelSource } from "./model"
import { reviewOrder } from "@/lib/shift-watch/review"
import { runTool, toolDefs, type ToolContext } from "./tools"

const MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5-5"
const MAX_TOOL_CALLS = 12

export const agentMode = (): AgentRun["mode"] => (process.env.AGENT_MODE === "live" ? "live" : "replay")

// Shift Watch enforces data freshness, not this prompt: reading the cached list first is the
// agent's honest cheap move, and the check sends it back (team decision, see PROCESS.md).
const SYSTEM = `You are the order agent for one car delivery at Bahn. Bahn's freelance drivers drive used cars from sellers to dealers across Finland, Denmark and Germany. You do the legwork on your order, then either finish the job or hand a person one clear decision.

How you work:
- Do the cheap work first: read your notes, the order and its messages, then look things up.
- On your own you may read records, look up ferry capacity and driver rest, ask the driver a question, ask a pickup site or terminal about hours, access, keys or a booking, and write notes.
- Anything that books, buys, cancels, changes a date, promise or cost, instructs a driver, or contacts a customer needs a person. Put it in one proposal, then finish.
- Stop and propose when a customer must be contacted, money changes, safety is involved, sources disagree, or a deadline is less than an hour away.
- Always write your notes, then call finish. The run ends there.

Never:
- Give mechanical advice or permission to drive after a warning.
- Call a quote a booking, or a booking boarded, without a record that says so.
- Retry an action that failed or timed out before its outcome is checked.
- Say a driver caused damage. Record what each person said, with its time.
- Ask a driver about their health beyond "fit to drive, yes or no".
- Contact a customer, or a site owned by the customer (get_order lists them).

Reading the records:
- An alert is a reason to look, not a diagnosis. Acknowledged is not resolved. Approved is not done.
- Readiness "confirmed" does not mean the pickup is verified.
- A driver's message is what the driver said at that time, not a location fix.
- "Now" is the demo clock given in each message. Times in the records are UTC unless a zone is shown.
- Drivers write local time. Convert a time a driver gives with the zone in the wake-up message before comparing it with a UTC time. If no zone is given and it matters, ask.
- In messages to a driver, give times in their local time and say whose time it is ("14:00 Hamburg time").
- Write messages to a driver in English only. Shift Watch sends them in the driver's own language with the English underneath.
- A message from a driver comes with Shift Watch's English reading and what it left unclear. Don't fill a gap yourself (an hour, a place, a yes or no): ask the driver. When you quote the driver, quote their own words, not the English reading.
- Cite only records you read in this run, by table and id. Mock data is marked mock; keep that mark.

Write for operations people: plain words, the decision first, no jargon.`

async function addStep(step: AgentStep) {
  await db.insert(agentSteps).values({
    runId: step.run_id, seq: step.seq, agent: step.agent, kind: step.kind, tool: step.tool,
    input: step.input, resultSummary: step.result_summary, at: step.at,
  })
}

// shortcut: a replay cites the driver-message ids of the run it was recorded in, and those are random per
// run. An id this run hasn't seen maps to the order's latest message from the driver; record the ids each
// run saw if replays ever need to cite more than one driver message.
async function remapReplayIds(input: Record<string, unknown>, ctx: ToolContext, orderId: string): Promise<Record<string, unknown>> {
  const text = JSON.stringify(input)
  const stale = [...new Set(text.match(/dm_[0-9a-f]{8}/g) ?? [])].filter((id) => !ctx.seen.includes(id))
  if (!stale.length) return input
  const [latest] = await db.select({ id: driverMessages.id }).from(driverMessages)
    .where(and(eq(driverMessages.orderId, orderId), eq(driverMessages.direction, "IN"))).orderBy(desc(driverMessages.createdAt)).limit(1)
  return latest ? JSON.parse(stale.reduce((t, id) => t.split(id).join(latest.id), text)) : input
}

/** True if the order exists in the dataset. */
export async function orderExists(orderId: string): Promise<boolean> {
  const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1)
  return !!row
}

/** Create the run row and return its id, or null if this order already has a run going (one at a time per order). */
export async function createRun(req: RunRequest): Promise<string | null> {
  const id = `run_${crypto.randomUUID().slice(0, 8)}`
  try {
    await db.insert(agentRuns).values({
      id, orderId: req.order_id, reason: req.reason, reasonDetail: req.reason_detail,
      mode: agentMode(), status: "RUNNING", toolCalls: 0, startedAt: nowIso(),
    })
  } catch (error) {
    // The partial unique index refuses a second RUNNING run for the same order.
    const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code
    if (code === "23505") return null
    throw error
  }
  return id
}

/** Wake each order's agent when the next check it set comes due. Live only: a replay has no recording for it.
 *  Once per check: a run started at or after the due time counts as having done it. */
export async function wakeDue(): Promise<void> {
  if (agentMode() !== "live") return
  const now = nowIso()
  // shortcut: at most 5 wake-ups a minute from one in-process timer, so a burst of due checks can't hit the API's rate
  // limits at once; at Bahn's scale this becomes a job queue with workers.
  for (const st of await db.select().from(orderStatus).where(lte(orderStatus.nextCheckAt, now)).orderBy(orderStatus.nextCheckAt).limit(5)) {
    const [ran] = await db.select({ id: agentRuns.id }).from(agentRuns).where(and(eq(agentRuns.orderId, st.orderId), gte(agentRuns.startedAt, st.nextCheckAt!))).limit(1)
    if (ran) continue
    const req: RunRequest = { order_id: st.orderId, reason: "NEXT_CHECK", reason_detail: `The check you set for ${st.nextCheckAt!.slice(11, 16)} UTC is due. Where you left it: ${st.summary}` }
    const id = await createRun(req)
    if (id) void runOrderAgent(id, req)
  }
}

/** Runs live in this process, so after a restart a run still marked RUNNING never ends, and the order's agent could
 *  never be woken again (one running run per order). Called once when the server starts. */
export async function failOrphanedRuns(): Promise<void> {
  await db.update(agentRuns).set({ status: "FAILED", stopReason: "The server restarted during this run", endedAt: nowIso() }).where(eq(agentRuns.status, "RUNNING"))
}

export async function runOrderAgent(runId: string, req: RunRequest): Promise<void> {
  const ctx: ToolContext = { runId, orderId: req.order_id, seen: "", observed: {}, proposed: false, finished: false }
  let seq = 0
  let toolCalls = 0
  const step = (kind: AgentStep["kind"], tool: string | null, input: Record<string, unknown>, summary: string, agent: AgentStep["agent"] = "order-agent") =>
    addStep({ run_id: runId, seq: ++seq, agent, kind, tool, input, result_summary: summary, at: nowIso() })
  // A demo reset deletes the run row; a run that finds it gone stops without writing anything more.
  const alive = async () => (await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.id, runId))).length > 0
  // Shift Watch checks what the run produced before the run reads as ended, so nothing polling it sees
  // FINISHED next to an unchecked proposal. Its decisions are steps in this run, so the case view shows
  // the handover in one timeline. A send-back wakes the agent again once this run is closed.
  const end = async (status: "FINISHED" | "STOPPED" | "FAILED", stopReason: string | null) => {
    if (!(await alive())) return
    // A failed run is checked too: a proposal or driver message it wrote must not sit unchecked, out of sight, forever.
    const outcome = await reviewOrder(req.order_id)
    if (outcome) {
      const [checked] = await db.select().from(proposals).where(eq(proposals.runId, runId))
      if (checked?.check) await step("TEXT", null, { proposal_id: checked.id }, `Checked ${checked.id}: ${checked.check.outcome}${checked.check.reasons.length ? " - " + checked.check.reasons.map((r) => r.message).join(" ") : ""}`, "shift-watch")
      if (outcome.released || outcome.held) await step("TEXT", null, {}, `Driver messages: ${outcome.released} sent, ${outcome.held} held for a person`, "shift-watch")
    }
    const [ended] = await db.update(agentRuns).set({ status, stopReason, toolCalls, endedAt: nowIso() }).where(eq(agentRuns.id, runId)).returning()
    if (outcome?.sendBack) {
      const next: RunRequest = { order_id: req.order_id, reason: "SENT_BACK", reason_detail: `Shift Watch sent ${outcome.sendBack.proposalId} back: ${outcome.sendBack.reason}` }
      const nextId = await createRun(next)
      if (nextId) void runOrderAgent(nextId, next)
      return
    }
    // Intake can't start a second run while this one is going, so a driver who wrote meanwhile is woken for here.
    const [late] = ended ? await db.select().from(driverMessages)
      .where(and(eq(driverMessages.orderId, req.order_id), eq(driverMessages.direction, "IN"), gt(driverMessages.createdAt, ended.startedAt)))
      .orderBy(desc(driverMessages.createdAt)).limit(1) : []
    if (late) {
      const next: RunRequest = { order_id: req.order_id, reason: "DRIVER_MESSAGE", reason_detail: `The driver wrote again while you were working, at ${late.createdAt.slice(11, 16)} UTC: '${late.translation ?? late.text}'` }
      const nextId = await createRun(next)
      if (nextId) void runOrderAgent(nextId, next)
    }
  }

  await step("WAKE", null, {}, `${req.reason}: ${req.reason_detail}`)

  // A recording is only valid from the state it was recorded in, so each one plays once per demo reset.
  const replayed = agentMode() !== "live" && (await db.select({ id: agentRuns.id }).from(agentRuns)
    .where(and(eq(agentRuns.orderId, req.order_id), eq(agentRuns.reason, req.reason), ne(agentRuns.id, runId))).limit(1)).length > 0
  if (replayed) return void (await end("STOPPED", `The ${req.reason} recording for ${req.order_id} already played since the demo reset`))

  const source: ModelSource | null = agentMode() === "live"
    ? liveSource({ model: MODEL, system: SYSTEM, tools: toolDefs, orderId: req.order_id, reason: req.reason, record: process.env.RECORD === "1" })
    : await replaySource(req.order_id, req.reason)
  if (!source) return void (await end("FAILED", `No recording for ${req.order_id} woken by ${req.reason}; run it live with RECORD=1 first`))

  const messages: BetaMessageParam[] = [{
    role: "user",
    content: `Now (demo clock): ${nowIso()}\nOrder: ${req.order_id}\nYou were woken because: ${req.reason} - ${req.reason_detail}`,
  }]
  let nudged = false
  let capWarned = false

  try {
    while (true) {
      const response = await source.next(messages)
      if (!(await alive())) return
      messages.push({ role: "assistant", content: response.content })

      if (response.stop_reason === "refusal") return void (await end("STOPPED", "The model declined this request"))
      if (response.stop_reason === "max_tokens") return void (await end("FAILED", "Response hit the token limit"))
      if (response.stop_reason === "recording_ended") return void (await end("STOPPED", "Recording ended before finish"))

      // Text and progress notes both become TEXT steps: the case view shows them as the agent's "why".
      for (const block of response.content) {
        const said = block.type === "text" ? block.text : block.type === "thinking" ? block.thinking : ""
        if (said.trim()) await step("TEXT", null, {}, said.trim())
      }

      const calls = response.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use")
      if (!calls.length) {
        // The run must end with finish, so ask once, then stop.
        if (nudged) return void (await end("STOPPED", "Ended without calling finish"))
        nudged = true
        messages.push({ role: "user", content: "Write your notes if you haven't, then call finish." })
        continue
      }

      const results: BetaToolResultBlockParam[] = []
      let refused = false
      for (const call of calls) {
        if (toolCalls >= MAX_TOOL_CALLS && call.name !== "finish") {
          refused = true
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Tool-call limit reached. Call finish now." })
          continue
        }
        if (!(await alive())) return
        toolCalls++
        const recorded = (call.input ?? {}) as Record<string, unknown>
        const input = agentMode() === "live" ? recorded : await remapReplayIds(recorded, ctx, req.order_id)
        const out = await runTool(call.name, input, ctx)
        const text = JSON.stringify(out.result)
        // Only what a tool returned counts as read: not an error (it repeats the ids it refused), and not the
        // reference the agent itself gave check_booking_outcome.
        if (!out.error) ctx.seen += call.name === "check_booking_outcome" ? JSON.stringify({ ...(out.result as object), reference: null }) : text
        await step(call.name === "finish" ? "FINISH" : out.error ? "ERROR" : "TOOL_CALL", call.name, input, out.summary)
        results.push({ type: "tool_result", tool_use_id: call.id, content: text, is_error: out.error })
      }
      messages.push({ role: "user", content: results })

      if (ctx.finished) {
        await source.save()
        return void (await end("FINISHED", ctx.proposed ? "Handed a proposal to Shift Watch" : null))
      }
      // One warned round past the cap, then stop, so a model that keeps calling tools can't loop forever.
      if (refused && capWarned) return void (await end("STOPPED", "Tool-call limit reached"))
      capWarned ||= refused
    }
  } catch (error) {
    if (!(await alive())) return
    await step("ERROR", null, {}, error instanceof Error ? error.message : String(error))
    await end("FAILED", "Agent error")
  }
}
