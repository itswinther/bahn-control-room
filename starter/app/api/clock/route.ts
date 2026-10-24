import { NextResponse } from "next/server"
import { nowIso, resetClock } from "@/lib/clock"

export const runtime = "nodejs"

/** The demo clock, for the screens and scripts that run outside the server process. */
export function GET() {
  return NextResponse.json({ now: nowIso() })
}

/** Restart the demo at the snapshot time (the driver page's reset button). */
export function POST() {
  resetClock()
  return NextResponse.json({ now: nowIso() })
}
