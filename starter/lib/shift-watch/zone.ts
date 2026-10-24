// Drivers read and write local time; operators work in UTC. This finds where the driver is on a job, so
// messages to them use their clock and the times they write can be read against UTC.
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { fmtClock, fmtDay, zoneCity } from "@/lib/present/time"
import { orders, relatedRecords } from "@/lib/schema"

export type DriverZone = { zone: string; place: string }

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === "string" ? v : null)

/** The driver's zone on this job: the ferry terminal they're heading for, else the pickup end before
 *  pickup and the delivery end after it. Null if the records don't say. */
export async function driverZone(orderId: string): Promise<DriverZone | null> {
  const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId))
  if (!order) return null
  const rows = (await db.select({ collection: relatedRecords.collection, details: relatedRecords.details }).from(relatedRecords)
    .where(and(eq(relatedRecords.orderId, orderId), inArray(relatedRecords.collection, ["travel_reservations", "time_windows"]))))
  const ferry = rows.find((r) => r.collection === "travel_reservations" && r.details.kind === "FERRY" && r.details.status === "BOOKED" && r.details.boarding_confirmation !== "CONFIRMED")?.details
  if (ferry && s(ferry.origin_terminal_id)) {
    const terminals = await db.select({ details: relatedRecords.details }).from(relatedRecords)
      .where(and(isNull(relatedRecords.orderId), eq(relatedRecords.collection, "ferry_terminals")))
    const t = terminals.map((r) => r.details as Row).find((d) => d.id === ferry.origin_terminal_id)
    if (t && s(t.timezone)) return { zone: s(t.timezone)!, place: s(t.city) ?? zoneCity(s(t.timezone)) ?? "local" }
  }
  const picked = !["NEW", "WAITING_FOR_PICKUP"].includes(order.status)
  const w = rows.map((r) => r.details).find((d) => (picked ? /DELIVERY/ : /PICKUP/).test(String(d.purpose)) && s(d.timezone))
  return w ? { zone: s(w.timezone)!, place: zoneCity(s(w.timezone)) ?? "local" } : null
}

/** "11:15 Hamburg time", with the day when it isn't today there; UTC when the zone is unknown. */
export function localTime(iso: string, z: DriverZone | null, now: string): string {
  if (!z) return `${iso.slice(11, 16)} UTC`
  const day = fmtDay(iso, z.zone) === fmtDay(now, z.zone) ? "" : `${fmtDay(iso, z.zone)} `
  return `${day}${fmtClock(iso, z.zone)} ${z.place} time`
}

/** "UTC+2": for telling the agent how to read a time the driver wrote. */
export function utcOffset(z: DriverZone, at: string): string {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: z.zone, timeZoneName: "shortOffset" }).formatToParts(new Date(at)).find((p) => p.type === "timeZoneName")?.value ?? "UTC"
  return name.replace("GMT", "UTC")
}
