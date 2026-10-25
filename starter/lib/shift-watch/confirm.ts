// The day before a pickup, Shift Watch asks the booked driver to confirm. A driver who has gone quiet is found
// with a day left to re-offer the job, not when they finally write "can't do it". Fixed text and no model, so it
// runs the same in replay and live.
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import type { DriverMessage } from "@/lib/contract"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { fmtClock, fmtDay } from "@/lib/present/time"
import { addresses, orders, relatedRecords } from "@/lib/schema"
import { driverMessages } from "@/lib/schema-ours"
import { toDriverMessage } from "./case"

export const CONFIRM_YES = "CONFIRM_YES"
export const CONFIRM_NO = "CONFIRM_NO"
const ASK_AHEAD_MS = 24 * 3_600_000
/** How long a driver has to answer before the dispatch desk gets a card. */
export const REPLY_WITHIN_MS = 3 * 3_600_000

type Row = Record<string, unknown>
const isConfirmAsk = sql`${driverMessages.quickReplies} @> ${JSON.stringify([{ value: CONFIRM_YES }])}::jsonb`

/** Ask every booked driver whose pickup slot starts within a day and who hasn't been asked for it yet. */
export async function askConfirmations(): Promise<number> {
  const now = nowIso()
  const nowMs = Date.parse(now)
  const rows = await db.select({ orderId: relatedRecords.orderId, collection: relatedRecords.collection, details: relatedRecords.details })
    .from(relatedRecords).where(inArray(relatedRecords.collection, ["work_assignments", "time_windows"]))
  const asked = new Set((await db.select({ orderId: driverMessages.orderId }).from(driverMessages)
    .where(and(eq(driverMessages.direction, "OUT"), isConfirmAsk))).map((m) => m.orderId))
  let sent = 0
  for (const a of rows.filter((r) => r.collection === "work_assignments" && r.details.status === "ASSIGNED" && r.orderId && !asked.has(r.orderId))) {
    const slot = rows.map((r): Row => ({ orderId: r.orderId, ...(r.details as Row) }))
      .find((w) => w.orderId === a.orderId && w.purpose === "SELECTED_PICKUP_SLOT" && w.is_selected && typeof w.start_at === "string"
        && Date.parse(w.start_at) > nowMs && Date.parse(w.start_at) - nowMs <= ASK_AHEAD_MS)
    if (!slot) continue
    const [order] = await db.select({ reference: orders.reference, city: addresses.city }).from(orders)
      .innerJoin(addresses, eq(addresses.id, orders.pickupAddressId)).where(eq(orders.id, a.orderId!))
    const zone = String(slot.timezone ?? "UTC")
    const start = String(slot.start_at)
    const when = `${fmtDay(start, zone)} ${fmtClock(start, zone)}–${fmtClock(String(slot.end_at ?? start), zone)} local time`
    await db.insert(driverMessages).values({
      id: `dm_${crypto.randomUUID().slice(0, 8)}`, driverId: String(a.details.driver_id), orderId: a.orderId, direction: "OUT", author: "shift-watch",
      text: `Checking your next pickup: ${order?.reference ?? a.orderId}, collect in ${order?.city ?? "the pickup address"}, ${when}. Are you still on for it?`,
      language: "en", translation: null, hearBackBy: null, simulated: false, repeatsMessageId: null, status: "SENT", createdAt: now,
      quickReplies: [{ kind: "YES_NO", label: "Yes, I'll be there", value: CONFIRM_YES }, { kind: "YES_NO", label: "No, I can't do this job", value: CONFIRM_NO }],
    })
    sent++
  }
  return sent
}

/** "Yes, I'll be there" closes the check: nothing for a person or the agent to do. */
export async function confirmYes(driverId: string, text: string): Promise<{ message: DriverMessage; reply: DriverMessage; run_id: null } | null> {
  const [ask] = await db.select().from(driverMessages)
    .where(and(eq(driverMessages.driverId, driverId), eq(driverMessages.direction, "OUT"), isConfirmAsk)).orderBy(desc(driverMessages.createdAt)).limit(1)
  if (!ask?.orderId) return null
  const now = nowIso()
  const base = { driverId, orderId: ask.orderId, language: "en", translation: null, quickReplies: [], hearBackBy: null, repeatsMessageId: null, status: "SENT" as const }
  const [message] = await db.insert(driverMessages).values({ ...base, id: `dm_${crypto.randomUUID().slice(0, 8)}`, direction: "IN", author: "driver", text, simulated: true, intent: "ORDER", createdAt: now }).returning()
  const [reply] = await db.insert(driverMessages).values({ ...base, id: `dm_${crypto.randomUUID().slice(0, 8)}`, direction: "OUT", author: "shift-watch", text: "Thanks, you're confirmed. Have a good trip.", simulated: false, createdAt: now }).returning()
  return { message: toDriverMessage(message), reply: toDriverMessage(reply), run_id: null }
}
