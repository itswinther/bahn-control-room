import { NextResponse } from "next/server"
import type { HeldMessageReview } from "@/lib/contract"
import { reviewHeld } from "@/lib/shift-watch/review"

export const runtime = "nodejs"

/** A person sends (as is or edited) or discards an agent message to a driver that Shift Watch held. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as Partial<HeldMessageReview> | null
  if (!body || !["SEND", "DISCARD"].includes(body.action ?? "") || typeof body.reviewer !== "string" || !body.reviewer.startsWith("ops-")
    || (body.text !== undefined && (typeof body.text !== "string" || body.text.length > 2000))) {
    return NextResponse.json({ error: "Send action (SEND or DISCARD), reviewer (a desk id such as ops-support) and, to send an edited version, text" }, { status: 400 })
  }
  const result = await reviewHeld(id, body as HeldMessageReview)
  return result.ok ? NextResponse.json({ message: result.message }) : NextResponse.json({ error: result.error }, { status: result.status })
}
