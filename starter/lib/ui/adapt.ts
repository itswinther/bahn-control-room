/**
 * Turns Shift Watch's queue and case data into what the screens show. Every value comes from the
 * backend's own builders (lib/shift-watch/queue.ts, case.ts); this only renames, groups and sorts.
 */
import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { CaseResponse, QueueItem as RawItem, QueueResponse as RawQueue, TravelLeg as RawLeg } from "@/lib/contract";
import { nowIso } from "@/lib/clock";
import { db } from "@/lib/db";
import { addresses, orderItems, orders, vehicles } from "@/lib/schema";
import type {
  AgentNote,
  CaseView,
  Fact,
  QueueItem,
  QueueKind,
  QueueResponse,
  Source,
  TimelineEntry,
  TimelineEvent,
  TravelLeg,
} from "./contract";
import { DESK_LABEL } from "./present";

const MIN = 60_000;

/** One label per row, in the words the screens use. */
export function kindOf(raw: Pick<RawItem, "kind" | "decision" | "safety">): QueueKind {
  if (raw.safety) return "SAFETY";
  if (raw.kind === "PROPOSAL" || raw.kind === "DECIDED") return raw.decision.startsWith("Held for a person") ? "HELD" : "DECISION";
  if (/^(Driver (still )?waiting|Driver's wait (ran out|ends)|Message to the driver held)/.test(raw.decision)) return "DRIVER_WAITING";
  if (raw.decision.startsWith("Next check (")) return "WAITING";
  return "LOOSE_END";
}

/** The row's words, without what its chip already says ("Due:", "Overdue:"). */
const title = (decision: string) =>
  decision
    .replace(/^Held for a person: /, "")
    .replace(/^(Overdue|Due): /, "")
    .replace(/^Approved at (\S+) but not carried out: /, "Approved $1, never run: ")
    .replace(/^Next check overdue \(\S+\): waiting on /, "Overdue: waiting on ")
    .replace(/^Next check \(\S+\): waiting on /, "Waiting on ");

function eventsFor(raw: RawItem, kind: QueueKind): TimelineEvent[] {
  if (!raw.deadline) return [];
  const end = Date.parse(raw.deadline);
  const label = raw.deadline_reason ?? "Decide by";
  if (kind === "WAITING") return [{ type: "CHECK", start: raw.deadline, end: null, label }];
  const type: TimelineEvent["type"] =
    kind === "SAFETY" ? "SAFETY"
    : kind === "DRIVER_WAITING" || /^Driver (was promised|said)/.test(label) ? "DRIVER"
    : /check-in|Pickup slot/i.test(label) ? "TRAVEL"
    : "DECISION";
  return [{ type, start: new Date(end - 30 * MIN).toISOString(), end: raw.deadline, label }];
}

/** Car and route per order, for the list rows and search. */
async function orderFacts(ids: string[]) {
  if (!ids.length) return new Map<string, { vehicle: string; route: string }>();
  const [rows, cars] = await Promise.all([
    db.select({ id: orders.id, pickup: orders.pickupAddressId, delivery: orders.deliveryAddressId }).from(orders).where(inArray(orders.id, ids)),
    db.select({ orderId: orderItems.orderId, role: orderItems.role, make: vehicles.make, model: vehicles.model })
      .from(orderItems).innerJoin(vehicles, eq(vehicles.id, orderItems.vehicleId)).where(inArray(orderItems.orderId, ids)),
  ]);
  const places = await db.select({ id: addresses.id, city: addresses.city })
    .from(addresses).where(inArray(addresses.id, rows.flatMap((r) => [r.pickup, r.delivery])));
  const city = new Map(places.map((p) => [p.id, p.city]));
  return new Map(rows.map((r) => {
    const car = cars.find((c) => c.orderId === r.id && c.role === "PRIMARY") ?? cars.find((c) => c.orderId === r.id);
    return [r.id, { vehicle: car ? `${car.make} ${car.model}` : "", route: `${city.get(r.pickup) ?? "?"} → ${city.get(r.delivery) ?? "?"}` }];
  }));
}

export async function adaptQueue(raw: RawQueue, mode: "replay" | "live"): Promise<QueueResponse> {
  const facts = await orderFacts([...new Set(raw.items.map((i) => i.order_id))]);
  const items: QueueItem[] = raw.items.map((i) => {
    const kind = kindOf(i);
    const f = facts.get(i.order_id);
    return {
      id: i.id, order_id: i.order_id, reference: i.reference, kind, title: title(i.decision),
      vehicle: f?.vehicle || null, route: f?.route ?? null, owner_desk: i.owner_desk,
      deadline: i.deadline, deadline_reason: i.deadline_reason,
      checked: i.checked, proposal_id: i.proposal_id, held_message_id: i.held_message_id, outcome: i.outcome,
      stopped_because: i.stopped_because, if_no_decision: i.if_no_decision, escalated_from: i.escalated_from,
      events: eventsFor(i, kind),
    };
  });
  return {
    generated_at: raw.at, mode: mode === "live" ? "LIVE" : "REPLAY",
    orders_checked: raw.quiet_count + new Set(raw.items.map((i) => i.order_id)).size,
    quiet_count: raw.quiet_count, summary: raw.summary, items,
  };
}

/* ---------- One order ---------- */

function sourceOf(channel: string): Source {
  if (/EMAIL/i.test(channel)) return "EMAIL";
  if (/PHONE|CALL/i.test(channel)) return "CALL";
  if (/NOTE|INTERNAL|SLACK/i.test(channel)) return "OPERATOR";
  return "APP_CHAT";
}

function timelineOf(c: CaseResponse): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const t of c.view.threads) for (const m of t.messages) {
    out.push({
      id: m.id, at: m.at, source: m.author.kind === "agent" ? "AGENT" : sourceOf(m.channel),
      who: [m.author.name, m.author.role].filter((x, i, all) => x && (i === 0 || x.toLowerCase() !== all[0]?.toLowerCase())).join(" · "),
      text: m.body, language: m.language ?? undefined,
    });
  }
  for (const a of c.view.alerts) {
    out.push({ id: a.id, at: a.triggeredAt, source: "SYSTEM", who: `Alert · ${a.signalLabel}`, text: a.summary, tone: a.tone === "danger" ? "critical" : "warning" });
  }
  // The driver chat as the driver saw it: held or unchecked agent messages haven't reached them.
  const driverName = (id: string) => c.view.assignments.find((a) => a.driver.id === id)?.driver.name ?? "Driver";
  for (const m of c.driver_messages) {
    if (m.direction === "OUT" && m.status !== "SENT") continue;
    out.push({
      id: m.id, at: m.created_at, source: m.direction === "IN" ? "APP_CHAT" : m.author === "operator" ? "OPERATOR" : "SHIFT_WATCH",
      who: m.direction === "IN" ? `${driverName(m.driver_id)} · driver${m.simulated ? " (scripted for the demo)" : ""}` : m.author === "operator" ? "Operator" : "Shift Watch",
      text: m.text, language: m.language, translation: m.translation ?? undefined,
      agent_written: m.direction === "OUT" && m.author !== "operator", hear_back_by: m.hear_back_by,
      tone: m.intent === "SAFETY" ? "critical" : undefined,
    });
  }
  for (const p of c.proposals) {
    out.push({ id: `${p.id}-made`, at: p.created_at, source: "AGENT", who: "Order agent", text: `Proposed: ${p.summary}` });
    if (p.check && p.check.outcome !== "PASS") {
      out.push({ id: `${p.id}-check`, at: p.check.checked_at, source: "SHIFT_WATCH", who: "Shift Watch", text: `${p.check.outcome === "HOLD" ? "Held for a person" : "Sent back to the agent"}: ${p.check.reasons.map((r) => r.message).join(" ")}`, tone: "warning" });
    }
    if (p.review) {
      out.push({ id: `${p.id}-review`, at: p.review.at, source: "OPERATOR", who: DESK_LABEL[p.review.reviewer as keyof typeof DESK_LABEL] ?? p.review.reviewer, text: `${p.review.decision === "REJECTED" ? "Rejected" : p.review.decision === "EDITED" ? "Approved with changes" : "Approved"}: ${p.summary}${p.review.note ? ` (${p.review.note})` : ""}`, tone: p.review.decision === "REJECTED" ? undefined : "good" });
    }
    if (p.execution) {
      out.push({ id: `${p.id}-ran`, at: p.execution.at, source: "SHIFT_WATCH", who: "Shift Watch", text: p.execution.result_summary, tone: p.execution.status === "FAILED" ? "critical" : "good" });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

const MODE: Record<RawLeg["kind"], TravelLeg["mode"]> = { FERRY: "FERRY", TRAIN: "TRAIN", FLIGHT: "FLIGHT", BUS: "BUS", TAXI: "TAXI", HOTEL: "HOTEL", DRIVE: "DRIVE" };

const utc = (iso: string) => {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  return `${day}, ${iso.slice(11, 16)} UTC`;
};

function travelOf(legs: RawLeg[]): TravelLeg[] {
  return legs.map((l, n) => ({
    id: `${l.source.id}-${n}`, mode: MODE[l.kind], label: l.label, state: l.state,
    when: l.departs_at ? `Departs ${utc(l.departs_at)}` : "",
    detail: [
      l.check_in_cutoff_at ? `Check-in closes ${utc(l.check_in_cutoff_at)}.` : null,
      l.boarding === "UNCONFIRMED" ? "Boarding not confirmed." : l.boarding === "CONFIRMED" ? "Boarded." : null,
      l.state === "QUOTED" ? "A quote, not a booking." : null,
    ].filter(Boolean).join(" "),
    reference: l.reference ?? undefined, checked_at: l.source.observed_at ?? undefined, mock: l.source.mock,
  }));
}

function notesOf(c: CaseResponse): AgentNote[] {
  if (!c.note) return [];
  return c.note.markdown.split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean)
    .map((text) => ({ text, source: "Order agent's notes", at: c.note!.updated_at }));
}

export function adaptCase(c: CaseResponse): CaseView {
  const now = nowIso();
  const h = c.view.header;
  const driver = c.view.assignments.find((a) => a.status === "IN_PROGRESS" || a.status === "ASSIGNED")?.driver ?? null;
  const active = c.proposals.find((p) => p.status === "PENDING_REVIEW" || p.status === "HELD");
  const latest = c.runs[0];
  const kind: QueueKind = active?.status === "HELD" ? "HELD" : active?.approval === "SHIFT_LEAD" ? "SAFETY" : active ? "DECISION" : "LOOSE_END";
  const facts: Fact[] = c.view.tiles.map((t) => ({ label: t.label, value: t.value, hint: t.hint }));
  return {
    order: {
      id: h.id, reference: h.reference, vehicle: h.vehicle?.title ?? "",
      pickup: { place: h.from.city, country: h.from.country, tz: h.from.zone ?? "UTC" },
      delivery: { place: h.to.city, country: h.to.country, tz: h.to.zone ?? "UTC" },
      customer: h.customer.name, driver: driver?.id ? { id: driver.id, name: driver.name } : null,
    },
    headline: c.view.story.headline, detail: c.view.story.detail, kind, status: c.status,
    proposals: c.proposals, steps: c.steps,
    stop_reason: latest?.stop_reason ?? null, running: latest?.status === "RUNNING",
    notes: notesOf(c), notes_updated_at: c.note?.updated_at ?? null,
    timeline: timelineOf(c), travel: travelOf(c.legs), facts,
    // Held ones, and ones a person just released that the driver won't see until the undo window closes.
    held_messages: c.driver_messages.filter((m) => m.direction === "OUT" && (m.status === "HELD" || (m.status === "SENT" && m.created_at > now))),
  };
}
