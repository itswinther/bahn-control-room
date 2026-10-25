// Who Shift Watch pages, and how: pure rules, so they can be checked without a database.
import type { Desk, PageChannel, PageTrigger, Person, QueueItem } from "@/lib/contract"

export const ACK_WINDOW_MS = 3 * 60_000
export const DUE_SOON_MS = 10 * 60_000

/** Made-up people, not from Bahn's dataset. Sara starts away, so the demo's first page is a DM. */
export const PEOPLE: Person[] = ([
  ["ops-shift", "Mira Aaltonen", "Jonas Brekke"],
  ["ops-dispatch", "Sara Lindqvist", "Tomas Weber"],
  ["ops-travel", "Aino Virtanen", "Lukas Hoffmann"],
  ["ops-readiness", "Freja Madsen", "Niko Salo"],
  ["ops-support", "Emil Kask", "Hanna Berg"],
  ["ops-evidence", "Oskar Lund", "Leena Koski"],
  ["ops-expenses", "Ida Holm", "Paul Richter"],
] as const).flatMap(([desk, primary, backup]) => [primary, backup].map((name, i) => ({
  id: name.toLowerCase().replace(" ", "-"), name, desk, role: i ? "BACKUP" : "PRIMARY",
  presence: name === "Sara Lindqvist" ? "AWAY" : "ACTIVE",
} satisfies Person)))

/** Bahn's own room names where they exist (crossing, dispatch, handover); any other desk goes to the shift lead. */
export const ROOM_BY_DESK: Partial<Record<Desk, string>> = {
  "ops-travel": "crossing-desk", "ops-dispatch": "dispatch-desk", "ops-readiness": "handover-desk", "ops-evidence": "handover-desk",
  "ops-shift": "shift-lead", "ops-support": "support-desk", "ops-expenses": "expenses-desk",
}
export const roomFor = (desk: Desk) => ROOM_BY_DESK[desk] ?? "shift-lead"

/** A driver saying they won't do the job. Tested against near misses ("I can't find the keys") in check-paging.ts. */
export const DROP_OUT = /\b(can'?t|cannot|won'?t|will not|not able to|unable to|no longer)\b[^.!?]{0,40}\b(deliver|do (this|the|that) (job|gig|delivery|pickup|trip)|take (this|the) (job|car|gig)|make (it to )?the pickup)\b|\b(drop(ping)?|cancel(l?ing)?|giv(e|ing) up|quit(ting)?)\b[^.!?]{0,20}\b(job|gig|delivery|assignment)\b/i

export type PageNeed = { order_id: string; reference: string; trigger: PageTrigger; desk: Desk; what: string; deadline: string | null }

/** Cards that need a person now. Already-overdue cards never page: at 09:00 Bahn's queue is full of "Late 2d". */
export function pageNeeds(now: string, items: QueueItem[]): PageNeed[] {
  const nowMs = Date.parse(now)
  const needs = new Map<string, PageNeed>()
  // First match wins, so one order gets one page.
  for (const trigger of ["SAFETY", "ESCALATED", "DUE_SOON"] as const) for (const i of items) {
    if (i.outcome || needs.has(i.order_id)) continue
    const left = i.deadline ? Date.parse(i.deadline) - nowMs : NaN
    const hit = trigger === "SAFETY" ? i.safety : trigger === "ESCALATED" ? !!i.escalated_from
      : (!!i.proposal_id || !!i.driver_waiting_until) && left > 0 && left <= DUE_SOON_MS
    if (hit) needs.set(i.order_id, {
      order_id: i.order_id, reference: i.reference, trigger, deadline: i.deadline,
      desk: trigger === "DUE_SOON" ? i.owner_desk : "ops-shift",
      what: trigger === "ESCALATED" ? `Moved to the shift lead: ${i.decision}` : i.decision,
    })
  }
  return [...needs.values()]
}

/** Rung 0 the desk's person (room if at their desk, else DM), 1 their backup, 2 the shift lead; null when nobody's left. */
export function rungTarget(desk: Desk, rung: number, trigger: PageTrigger, people: Person[]): { person: Person; channel: PageChannel } | null {
  const home = people.some((p) => p.desk === desk) ? desk : "ops-shift"
  if (rung > 2 || (rung === 2 && home === "ops-shift")) return null
  const person = people.find((p) => p.desk === (rung === 2 ? "ops-shift" : home) && p.role === (rung === 1 ? "BACKUP" : "PRIMARY"))!
  // Safety reaches the person's phone even when they're at their desk.
  return { person, channel: rung === 0 && person.presence === "ACTIVE" && trigger !== "SAFETY" ? "ROOM" : "DM" }
}
