// The decision queue: what needs a person now, worked out by rules on every request against the
// demo clock, so it still works when the agents are down. Safety first, then earliest deadline.
import { eq, inArray } from "drizzle-orm"
import type { Desk, QueueItem, QueueResponse } from "@/lib/contract"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { alerts, conversations, orders, relatedRecords } from "@/lib/schema"
import { agentSteps, driverMessages, orderStatus, proposals } from "@/lib/schema-ours"

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === "string" ? v : null)
const MINUTE = 60_000

/** Where an alert goes when nobody owns it, by its signal. */
const DESK_BY_SIGNAL: [RegExp, Desk][] = [
  [/FERRY|TRAVEL/, "ops-travel"], [/DRIVER_AVAILABILITY|POSITIONING/, "ops-dispatch"],
  [/RELEASE|SITE_ACCESS/, "ops-readiness"], [/PICKUP_PROOF/, "ops-evidence"],
  [/DELIVERY_ACCESS|PROOF_REVIEW|INVOICE/, "ops-support"],
]
const deskFor = (signal: string): Desk => DESK_BY_SIGNAL.find(([re]) => re.test(signal))?.[1] ?? "ops-shift"

/** Tools whose results are worth showing as "already checked" on a card. */
const SHOWN_TOOLS = new Set(["check_ferry_capacity", "check_driver_rest", "check_booking_outcome", "ask_site", "ask_driver"])

type Reason = { text: string; owner: Desk; deadline: string | null; deadlineReason: string | null }

const DESK_NAME: Record<string, string> = {
  "ops-dispatch": "Driver marketplace", "ops-travel": "Driver travel", "ops-readiness": "Readiness desk", "ops-support": "Support desk",
  "ops-evidence": "Handover evidence", "ops-expenses": "Driver expense review", "ops-shift": "Shift lead", "ops-intake": "Order intake",
  "ops-planning": "Transport planning", "ops-import": "Import operations", "ops-finance": "Cancellation and payment review",
}
const label = (signal: string) => signal.toLowerCase().replace(/_/g, " ")
/** "09:15", or "19 Oct 11:39" when it isn't today on the demo clock. */
const when = (iso: string, now: string) => iso.slice(0, 10) === now.slice(0, 10) ? iso.slice(11, 16)
  : `${Number(iso.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1]} ${iso.slice(11, 16)}`

export async function buildQueue(): Promise<QueueResponse> {
  const now = nowIso()
  const nowMs = Date.parse(now)
  const [orderRows, alertRows, threadRows, related, ours, statusRows] = await Promise.all([
    db.select({ id: orders.id, reference: orders.reference, status: orders.status }).from(orders),
    db.select().from(alerts).where(inArray(alerts.status, ["OPEN", "ACKNOWLEDGED"])),
    db.select().from(conversations).where(eq(conversations.status, "OPEN")),
    db.select().from(relatedRecords).where(inArray(relatedRecords.collection, ["work_items", "incidents", "agent_proposals", "travel_reservations", "time_windows"])),
    db.select().from(proposals).where(inArray(proposals.status, ["PENDING_REVIEW", "HELD"])),
    db.select().from(orderStatus),
  ])
  const chat = await db.select().from(driverMessages).orderBy(driverMessages.createdAt)
  const ref = new Map(orderRows.map((o) => [o.id, o.reference]))
  const byOrder = (collection: string) => {
    const map = new Map<string, Row[]>()
    for (const r of related) if (r.collection === collection && r.orderId) (map.get(r.orderId) ?? map.set(r.orderId, []).get(r.orderId)!).push(r.details)
    return map
  }
  const workItems = byOrder("work_items"), incidents = byOrder("incidents"), bahnProposals = byOrder("agent_proposals")
  const reservations = byOrder("travel_reservations"), windows = byOrder("time_windows")

  const safety = new Set<string>([
    ...alertRows.filter((a) => a.signal === "SAFETY_STOP").map((a) => a.orderId),
    ...[...incidents].filter(([, list]) => list.some((i) => i.kind === "VEHICLE_WARNING" && !i.resolved_at)).map(([id]) => id),
  ])

  // Loose ends, per order.
  const reasons = new Map<string, Reason[]>()
  const add = (orderId: string, r: Reason) => (reasons.get(orderId) ?? reasons.set(orderId, []).get(orderId)!).push(r)

  for (const [orderId, list] of workItems) for (const w of list) {
    if (w.status !== "OPEN") continue
    const due = s(w.due_at)
    const overdue = due && Date.parse(due) < nowMs
    add(orderId, { text: `${overdue ? "Overdue" : "Due"}: ${s(w.summary)}`, owner: (s(w.owner) as Desk) ?? "ops-shift", deadline: due, deadlineReason: overdue ? `Work item was due ${when(due!, now)}` : "Work item due" })
  }
  for (const a of alertRows) {
    const owner = s((a.details as Row).owner)
    if (owner) continue
    add(a.orderId, { text: `Alert with no owner: ${label(a.signal)}. Routed to ${DESK_NAME[deskFor(a.signal)]}.`, owner: deskFor(a.signal), deadline: null, deadlineReason: null })
  }
  for (const [orderId, list] of bahnProposals) for (const p of list) {
    const reviewedAt = s((p.review as Row | null)?.reviewed_at)
    if (p.status !== "APPROVED_AWAITING_EXECUTION" || !reviewedAt || nowMs - Date.parse(reviewedAt) < 15 * MINUTE) continue
    add(orderId, { text: `Approved at ${when(reviewedAt, now)} but not carried out: ${s(p.summary)}`, owner: (s((p.review as Row).reviewer_id) as Desk) ?? "ops-shift", deadline: reviewedAt, deadlineReason: "Approved, waiting to run" })
  }
  for (const c of threadRows) {
    const d = c.details as Row
    const next = s(d.next_check_at)
    if (!next || !s(d.waiting_on)) continue
    const late = Date.parse(next) < nowMs
    add(c.orderId, { text: `${late ? "Next check overdue" : "Next check"} (${when(next, now)}): waiting on ${label(s(d.waiting_on)!)}`, owner: (s(d.owner) as Desk) ?? "ops-support", deadline: next, deadlineReason: "Next check" })
  }
  for (const st of statusRows) {
    if (st.nextCheckAt && Date.parse(st.nextCheckAt) < nowMs) add(st.orderId, { text: `Agent's next check (${when(st.nextCheckAt, now)}) is overdue: ${st.summary}`, owner: st.ownerDesk ?? "ops-shift", deadline: st.nextCheckAt, deadlineReason: "Agent's next check" })
  }

  // Drivers promised an answer: the latest "you'll hear back by" with no real answer after it.
  const promises = new Map<string, string>()
  for (const orderId of new Set(chat.map((m) => m.orderId).filter((x): x is string => !!x))) {
    const mine = chat.filter((m) => m.orderId === orderId)
    const promise = [...mine].reverse().find((m) => m.direction === "OUT" && m.hearBackBy)
    if (!promise) continue
    const answered = mine.some((m) => m.direction === "OUT" && m.status === "SENT" && !m.hearBackBy && m.createdAt > promise.createdAt)
    if (answered) continue
    const asked = [...mine].reverse().find((m) => m.direction === "IN" && m.createdAt <= promise.createdAt)
    if (asked?.intent === "SAFETY") safety.add(orderId)
    promises.set(orderId, promise.hearBackBy!)
    const late = Date.parse(promise.hearBackBy!) < nowMs
    add(orderId, {
      text: `Driver ${late ? "still " : ""}waiting: "${(asked?.translation ?? asked?.text ?? "").slice(0, 90)}"`,
      owner: statusRows.find((s) => s.orderId === orderId)?.ownerDesk ?? (asked?.intent === "SAFETY" ? "ops-shift" : "ops-support"),
      deadline: promise.hearBackBy, deadlineReason: `Driver was promised an answer by ${when(promise.hearBackBy!, now)}`,
    })
  }

  // A hard time in the order itself caps every deadline: a ferry check-in or a pickup slot still ahead.
  const hardDeadline = (orderId: string): { at: string; why: string } | null => {
    const picked = orderRows.find((o) => o.id === orderId)?.status !== "NEW" && orderRows.find((o) => o.id === orderId)?.status !== "WAITING_FOR_PICKUP"
    const times = [
      ...(reservations.get(orderId) ?? []).filter((r) => r.kind === "FERRY" && r.status === "BOOKED" && s(r.check_in_cutoff_at) && Date.parse(s(r.check_in_cutoff_at)!) > nowMs)
        .map((r) => ({ at: s(r.check_in_cutoff_at)!, why: "Ferry check-in closes" })),
      ...(picked ? [] : (windows.get(orderId) ?? []).filter((w) => w.purpose === "SELECTED_PICKUP_SLOT" && w.is_selected && s(w.start_at) && Date.parse(s(w.start_at)!) > nowMs)
        .map((w) => ({ at: s(w.start_at)!, why: "Pickup slot starts" }))),
    ].sort((a, b) => a.at.localeCompare(b.at))
    return times[0] ?? null
  }

  const items: QueueItem[] = []
  const covered = new Set<string>()

  // Agent proposals waiting for a person. An order's loose ends go on its proposal card.
  const runSteps = ours.length ? await db.select().from(agentSteps).where(inArray(agentSteps.runId, ours.map((p) => p.runId))) : []
  for (const p of ours) {
    covered.add(p.orderId)
    const hard = hardDeadline(p.orderId)
    const st = statusRows.find((r) => r.orderId === p.orderId)
    const checked = runSteps.filter((x) => x.runId === p.runId && x.tool && SHOWN_TOOLS.has(x.tool)).map((x) => x.resultSummary)
    if (p.check) checked.push(p.check.outcome === "PASS" ? "Shift Watch: passed all checks" : `Shift Watch: ${p.check.reasons.map((r) => r.message).join(" ")}`)
    for (const r of reasons.get(p.orderId) ?? []) checked.push(`Also open: ${r.text}`)
    // Decide-by times only: the proposal's own, the agent's status and the order's hard times. A loose
    // end's "was due" time isn't a decide-by time. No deadline at all means decide as soon as possible.
    const deadline = [p.decisionDeadline, st?.decisionDeadline, hard?.at, promises.get(p.orderId)].filter((x): x is string => !!x).sort()[0] ?? p.createdAt
    items.push({
      id: `q_${p.id}`, kind: "PROPOSAL", order_id: p.orderId, reference: ref.get(p.orderId) ?? p.orderId,
      decision: p.status === "HELD" ? `Held for a person: ${p.summary}` : p.summary,
      owner_desk: p.ownerDesk, deadline,
      deadline_reason: deadline === p.createdAt && !p.decisionDeadline ? "No deadline given; decide as soon as possible"
        : deadline === promises.get(p.orderId) ? `Driver was promised an answer by ${when(deadline, now)}`
        : deadline === hard?.at ? hard.why : st?.deadlineReason ?? "Decision deadline",
      safety: safety.has(p.orderId) || p.approval === "SHIFT_LEAD", checked, proposal_id: p.id,
    })
  }

  // Loose ends on orders with no proposal: one card per order, its most pressing reason first.
  for (const [orderId, list] of reasons) {
    if (covered.has(orderId)) continue
    const hard = hardDeadline(orderId)
    const sorted = [...list].sort((a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9"))
    const top = sorted[0]
    const deadline = [top.deadline, hard?.at].filter((x): x is string => !!x).sort()[0] ?? null
    items.push({
      id: `q_${orderId}`, kind: "LOOSE_END", order_id: orderId, reference: ref.get(orderId) ?? orderId,
      decision: top.text, owner_desk: top.owner, deadline,
      deadline_reason: deadline === top.deadline ? top.deadlineReason : hard?.why ?? null,
      safety: safety.has(orderId), checked: sorted.slice(1).map((r) => r.text), proposal_id: null,
    })
  }

  items.sort((a, b) => Number(b.safety) - Number(a.safety) || (a.deadline ?? "9").localeCompare(b.deadline ?? "9"))
  return { at: now, summary: summarise(items, nowMs), items, quiet_count: orderRows.length - new Set(items.map((i) => i.order_id)).size }
}

/** Three lines from rules, so the summary works without the model. */
function summarise(items: QueueItem[], nowMs: number): [string, string, string] {
  const soon = items.filter((i) => i.deadline && Date.parse(i.deadline) < nowMs + 60 * MINUTE)
  const safety = items.filter((i) => i.safety).length
  const byDesk = new Map<string, number>()
  for (const i of soon) byDesk.set(i.owner_desk, (byDesk.get(i.owner_desk) ?? 0) + 1)
  const [busiest, load] = [...byDesk].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  const proposalsWaiting = items.filter((i) => i.kind === "PROPOSAL").length
  return [
    `${items.length} need a person: ${safety} safety, ${soon.length} due within the hour.`,
    busiest ? `Busiest desk: ${DESK_NAME[busiest] ?? busiest}, ${load} due within the hour.` : "No desk has anything due within the hour.",
    `${proposalsWaiting} agent proposal${proposalsWaiting === 1 ? "" : "s"} ready to decide; ${items.length - proposalsWaiting} loose end${items.length - proposalsWaiting === 1 ? "" : "s"} to chase.`,
  ]
}

