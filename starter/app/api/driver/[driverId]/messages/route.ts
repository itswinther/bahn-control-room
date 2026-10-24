import { NextResponse } from "next/server"
import { thread } from "@/lib/shift-watch/intake"

export const runtime = "nodejs"

/** One driver's chat, as the driver sees it: their messages and what was actually sent to them. */
export async function GET(_request: Request, context: { params: Promise<{ driverId: string }> }) {
  const { driverId } = await context.params
  if (!/^drv-\d+$/.test(driverId)) return NextResponse.json({ error: "A driver id looks like drv-121" }, { status: 400 })
  return NextResponse.json({ messages: await thread(driverId) })
}
