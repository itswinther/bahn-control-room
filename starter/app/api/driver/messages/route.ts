import { NextResponse } from "next/server"
import type { DriverMessageRequest } from "@/lib/contract"
import { intake } from "@/lib/shift-watch/intake"

export const runtime = "nodejs"

/** A driver writes in. Shift Watch answers at once and wakes the order's agent if needed. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<DriverMessageRequest> | null
  if (typeof body?.driver_id !== "string" || !/^drv-\d+$/.test(body.driver_id) || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "Send driver_id (like drv-121) and text" }, { status: 400 })
  }
  if (body.text.length > 2000) return NextResponse.json({ error: "Keep messages under 2,000 characters" }, { status: 400 })
  return NextResponse.json(await intake(body.driver_id, body.text.trim(), { quickReplyValue: body.quick_reply_value, simulated: body.simulated }))
}
