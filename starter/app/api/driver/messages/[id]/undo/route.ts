import { NextResponse } from "next/server"
import { undoHeld } from "@/lib/shift-watch/review"

export const runtime = "nodejs"

/** Put a released or discarded message back to held, before it reaches the driver. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as { reviewer?: unknown } | null
  if (typeof body?.reviewer !== "string" || !body.reviewer.startsWith("ops-")) return NextResponse.json({ error: "Send reviewer (a desk id such as ops-support)" }, { status: 400 })
  const result = await undoHeld(id)
  return result.ok ? NextResponse.json({ message: result.message }) : NextResponse.json({ error: result.error }, { status: result.status })
}
