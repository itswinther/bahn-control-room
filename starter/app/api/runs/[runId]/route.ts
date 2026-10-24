import { NextResponse } from "next/server"
import { asc, eq } from "drizzle-orm"
import type { AgentRun, AgentStep, RunResponseDetail } from "@/lib/contract"
import { db } from "@/lib/db"
import { agentRuns, agentSteps } from "@/lib/schema-ours"

export const runtime = "nodejs"

/** One run and its steps so far. The screens poll this while a run is RUNNING. */
export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId))
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 })
  const steps = await db.select().from(agentSteps).where(eq(agentSteps.runId, runId)).orderBy(asc(agentSteps.seq))
  const body: RunResponseDetail = {
    run: {
      id: run.id, order_id: run.orderId, reason: run.reason, reason_detail: run.reasonDetail, mode: run.mode,
      status: run.status, stop_reason: run.stopReason, tool_calls: run.toolCalls, started_at: run.startedAt, ended_at: run.endedAt,
    } satisfies AgentRun,
    steps: steps.map((s) => ({
      run_id: s.runId, seq: s.seq, agent: s.agent, kind: s.kind, tool: s.tool, input: s.input,
      result_summary: s.resultSummary, at: s.at,
    }) satisfies AgentStep),
  }
  return NextResponse.json(body)
}
