import { and, eq, ne, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { advanceClock, nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { driverMessages } from "@/lib/schema-ours"
import { CONFIRM_YES, askConfirmations, confirmYes } from "@/lib/shift-watch/confirm"

export const runtime = "nodejs"

/** Demo only: move the demo clock forward by `minutes` (1–1440). The day-before checks go out first, so the jump
 *  shows what happens when a driver doesn't answer one. With `quiet_order_id`, every other asked driver answers
 *  "yes" first, so only that order's driver has gone quiet. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { minutes?: unknown; quiet_order_id?: unknown } | null
  const minutes = Number(body?.minutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return NextResponse.json({ error: "Send minutes, 1 to 1440." }, { status: 400 })
  await askConfirmations()
  if (typeof body?.quiet_order_id === "string") {
    const others = await db.selectDistinct({ driverId: driverMessages.driverId }).from(driverMessages).where(and(
      eq(driverMessages.direction, "OUT"), ne(driverMessages.orderId, body.quiet_order_id),
      sql`${driverMessages.quickReplies} @> ${JSON.stringify([{ value: CONFIRM_YES }])}::jsonb`))
    for (const { driverId } of others) await confirmYes(driverId, "Yes, I'll be there")
  }
  advanceClock(minutes * 60_000)
  return NextResponse.json({ now: nowIso() })
}
