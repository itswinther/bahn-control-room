import { NextResponse } from "next/server"
import { undo } from "@/lib/shift-watch/decide"

export const runtime = "nodejs"

/** Take back an approval or rejection while its undo window is open (see Review.takes_effect_at). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as { reviewer?: unknown } | null
  if (typeof body?.reviewer !== "string") return NextResponse.json({ error: "Send reviewer (the desk id that decided, or ops-shift)" }, { status: 400 })
  const result = await undo(id, body.reviewer)
  return result.ok ? NextResponse.json({ proposal: result.proposal }) : NextResponse.json({ error: result.error }, { status: result.status })
}
