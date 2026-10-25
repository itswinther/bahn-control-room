import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { nowIso, resetClock } from "@/lib/clock"
import { db } from "@/lib/db"
import { clearBookings } from "@/lib/mocks"
import { resetPaging } from "@/lib/shift-watch/pager"

export const runtime = "nodejs"

/** The demo clock, for the screens and scripts that run outside the server process. */
export function GET() {
  return NextResponse.json({ now: nowIso() })
}

/**
 * Restart the demo at the snapshot (the reset button): clears our six tables, the mock bookings and the pages,
 * then resets the clock. Bahn's dataset tables are never touched.
 */
export async function POST() {
  await db.execute(sql`TRUNCATE agent_runs, agent_steps, agent_notes, order_status, proposals, driver_messages`)
  clearBookings()
  resetPaging()
  resetClock()
  return NextResponse.json({ now: nowIso() })
}
