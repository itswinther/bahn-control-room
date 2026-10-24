import { NextResponse } from "next/server"
import type { DecisionRequest } from "@/lib/contract"
import { decide } from "@/lib/shift-watch/decide"

export const runtime = "nodejs"

const DECISIONS = ["APPROVED", "EDITED", "REJECTED"]
const PAYERS = ["BAHN", "CUSTOMER", "DRIVER"]

/** Approve, edit or reject a proposal. It takes effect after a short undo window (review.takes_effect_at);
 *  then an approval runs and its execution says what happens next. Read the result from the case view. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as Partial<DecisionRequest> | null
  if (!body || !DECISIONS.includes(body.decision ?? "") || typeof body.reviewer !== "string" || (body.who_pays && !PAYERS.includes(body.who_pays))) {
    return NextResponse.json({ error: `Send decision (${DECISIONS.join(", ")}), reviewer (a desk id such as ops-travel) and, if it costs money, who_pays (${PAYERS.join(", ")})` }, { status: 400 })
  }
  const result = await decide(id, body as DecisionRequest)
  return result.ok ? NextResponse.json({ proposal: result.proposal }) : NextResponse.json({ error: result.error }, { status: result.status })
}
