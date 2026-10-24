import { after, NextResponse } from "next/server"
import type { RunRequest, RunResponse, WakeReason } from "@/lib/contract"
import { createRun, runOrderAgent } from "@/lib/agents/order-agent"

export const runtime = "nodejs"

const REASONS: WakeReason[] = ["DRIVER_MESSAGE", "SENT_BACK", "LOOSE_END", "OPERATOR_REQUEST", "NEXT_CHECK"]

/** Wake an order agent. Returns at once; follow the run with GET /api/runs/:runId. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<RunRequest> | null
  if (!body?.order_id || !REASONS.includes(body.reason as WakeReason) || !body.reason_detail) {
    return NextResponse.json({ error: `Send order_id, reason (${REASONS.join(", ")}) and reason_detail` }, { status: 400 })
  }
  if (process.env.AGENT_MODE !== "live") {
    return NextResponse.json({ error: "Replay mode isn't built yet. Set AGENT_MODE=live and ANTHROPIC_API_KEY in .env." }, { status: 501 })
  }
  const req = body as RunRequest
  const runId = await createRun(req)
  if (!runId) return NextResponse.json({ error: `${req.order_id} already has a run going` }, { status: 409 })
  after(() => runOrderAgent(runId, req))
  return NextResponse.json({ run_id: runId } satisfies RunResponse, { status: 202 })
}
