import { after, NextResponse } from "next/server"
import type { RunRequest, RunResponse, WakeReason } from "@/lib/contract"
import { createRun, orderExists, runOrderAgent } from "@/lib/agents/order-agent"

export const runtime = "nodejs"

const REASONS: WakeReason[] = ["DRIVER_MESSAGE", "SENT_BACK", "LOOSE_END", "OPERATOR_REQUEST", "NEXT_CHECK"]
// The id also names the recording file, so only the dataset's own format gets through.
const ORDER_ID = /^ord-\d{5}$/

/** Wake an order agent. Returns at once; follow the run with GET /api/runs/:runId. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<RunRequest> | null
  if (typeof body?.order_id !== "string" || !ORDER_ID.test(body.order_id) || !REASONS.includes(body.reason as WakeReason) || typeof body.reason_detail !== "string" || !body.reason_detail) {
    return NextResponse.json({ error: `Send order_id (like ord-00603), reason (${REASONS.join(", ")}) and reason_detail` }, { status: 400 })
  }
  const req = body as RunRequest
  if (!(await orderExists(req.order_id))) return NextResponse.json({ error: `No order ${req.order_id}` }, { status: 404 })
  const runId = await createRun(req)
  if (!runId) return NextResponse.json({ error: `${req.order_id} already has a run going` }, { status: 409 })
  after(() => runOrderAgent(runId, req))
  return NextResponse.json({ run_id: runId } satisfies RunResponse, { status: 202 })
}
