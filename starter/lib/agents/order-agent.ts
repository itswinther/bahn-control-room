import Anthropic from "@anthropic-ai/sdk"
import type { BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { and, eq } from "drizzle-orm"
import type { AgentStep, RunRequest } from "@/lib/contract"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { agentRuns, agentSteps } from "@/lib/schema-ours"
import { runTool, toolDefs, type ToolContext } from "./tools"

const MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5-5"
const MAX_TOOL_CALLS = 12

// Shift Watch enforces data freshness, not this prompt: reading the cached list first is the
// agent's honest cheap move, and the check sends it back (team decision, see PROCESS.md).
const SYSTEM = `You are the order agent for one car delivery at Bahn. Bahn's freelance drivers drive used cars from sellers to dealers across Finland, Denmark and Germany. You do the legwork on your order, then either finish the job or hand a person one clear decision.

How you work:
- Do the cheap work first: read your notes, the order and its messages, then look things up.
- On your own you may read records, look up ferry capacity and driver rest, and write notes.
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
- "Now" is the demo clock given in each message. Times are UTC unless a zone is shown.
- Cite only records you read in this run, by table and id. Mock data is marked mock; keep that mark.

Write for operations people: plain words, the decision first, no jargon.`

let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic())

async function addStep(step: AgentStep) {
  await db.insert(agentSteps).values({
    runId: step.run_id, seq: step.seq, agent: step.agent, kind: step.kind, tool: step.tool,
    input: step.input, resultSummary: step.result_summary, at: step.at,
  })
}

/** Create the run row and return its id, or null if this order already has a run going (one at a time per order). */
export async function createRun(req: RunRequest): Promise<string | null> {
  const [busy] = await db.select({ id: agentRuns.id }).from(agentRuns)
    .where(and(eq(agentRuns.orderId, req.order_id), eq(agentRuns.status, "RUNNING"))).limit(1)
  if (busy) return null
  const id = `run_${crypto.randomUUID().slice(0, 8)}`
  await db.insert(agentRuns).values({
    id, orderId: req.order_id, reason: req.reason, reasonDetail: req.reason_detail,
    mode: "live", status: "RUNNING", toolCalls: 0, startedAt: nowIso(),
  })
  return id
}

export async function runOrderAgent(runId: string, req: RunRequest): Promise<void> {
  const ctx: ToolContext = { runId, orderId: req.order_id, seen: "", proposed: false, finished: false }
  let seq = 0
  let toolCalls = 0
  const step = (kind: AgentStep["kind"], tool: string | null, input: Record<string, unknown>, summary: string) =>
    addStep({ run_id: runId, seq: ++seq, agent: "order-agent", kind, tool, input, result_summary: summary, at: nowIso() })
  const end = (status: "FINISHED" | "STOPPED" | "FAILED", stopReason: string | null) =>
    db.update(agentRuns).set({ status, stopReason, toolCalls, endedAt: nowIso() }).where(eq(agentRuns.id, runId))

  await step("WAKE", null, {}, `${req.reason}: ${req.reason_detail}`)
  const messages: BetaMessageParam[] = [{
    role: "user",
    content: `Now (demo clock): ${nowIso()}\nOrder: ${req.order_id}\nYou were woken because: ${req.reason} - ${req.reason_detail}`,
  }]
  let nudged = false
  let capWarned = false

  try {
    while (true) {
      const response = await anthropic().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: toolDefs,
        messages,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      messages.push({ role: "assistant", content: response.content })

      if (response.stop_reason === "refusal") return void (await end("STOPPED", "The model declined this request"))
      if (response.stop_reason === "max_tokens") return void (await end("FAILED", "Response hit the token limit"))

      for (const block of response.content) if (block.type === "text" && block.text.trim()) await step("TEXT", null, {}, block.text.trim())

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
        toolCalls++
        const input = (call.input ?? {}) as Record<string, unknown>
        const out = await runTool(call.name, input, ctx)
        const text = JSON.stringify(out.result)
        ctx.seen += text
        await step(call.name === "finish" ? "FINISH" : out.error ? "ERROR" : "TOOL_CALL", call.name, input, out.summary)
        results.push({ type: "tool_result", tool_use_id: call.id, content: text, is_error: out.error })
      }
      messages.push({ role: "user", content: results })

      if (ctx.finished) return void (await end("FINISHED", ctx.proposed ? "Handed a proposal to Shift Watch" : null))
      // One warned round past the cap, then stop, so a model that keeps calling tools can't loop forever.
      if (refused && capWarned) return void (await end("STOPPED", "Tool-call limit reached"))
      capWarned ||= refused
    }
  } catch (error) {
    await step("ERROR", null, {}, error instanceof Error ? error.message : String(error))
    await end("FAILED", "Agent error")
  }
}
