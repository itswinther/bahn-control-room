/**
 * Codes to words, and times people can read.
 * Mirrors the starter's lib/present/labels.ts and time.ts; swap to those once the
 * starter is merged in.
 */
import type { Approval, Desk, LegState, QueueKind, Source, WhoPays } from "./contract";

export const DESK_LABEL: Record<Desk, string> = {
  "ops-travel": "Travel desk",
  "ops-dispatch": "Driver marketplace",
  "ops-shift": "Shift lead",
  "ops-readiness": "Readiness desk",
  "ops-support": "Support desk",
  "ops-expenses": "Expenses",
};

export const APPROVAL_LABEL: Record<Approval, string> = {
  NONE: "No sign-off needed",
  DESK: "Desk signs off",
  SHIFT_LEAD: "Shift lead signs off",
  CUSTOMER_VIA_PERSON: "A person calls the customer",
};

export const KIND_LABEL: Record<QueueKind, string> = {
  SAFETY: "Safety",
  DECISION: "Your call",
  HELD: "Held back",
  DRIVER_WAITING: "Driver waiting",
  LOOSE_END: "Loose end",
  WAITING: "Parked",
};

export const LEG_LABEL: Record<LegState, string> = {
  BOOKED: "Booked",
  QUOTED: "Quoted, not booked",
  UNCONFIRMED: "Unconfirmed",
  NOT_BOOKED: "Not booked yet",
  FAILED: "Failed",
  NOT_NEEDED: "Nothing to book",
};

export const SOURCE_LABEL: Record<Source, string> = {
  APP_CHAT: "App chat",
  EMAIL: "Email",
  CALL: "Call transcript",
  SYSTEM: "System",
  AGENT: "Order agent",
  SHIFT_WATCH: "Shift Watch",
  OPERATOR: "Operator",
  TRACKING: "Driver app reading",
};

export const WHO_PAYS_LABEL: Record<WhoPays, string> = {
  BAHN: "Bahn",
  CUSTOMER: "Customer",
  DRIVER_EXPENSE: "Driver expense",
  UNDECIDED: "Decide later",
};

const MIN = 60_000;
const HOUR = 60 * MIN;

/** "in 6 min", "in 2 h 5 min", "3 min ago", "2 days ago" */
export function relative(target: number, now: number): string {
  const diff = target - now;
  const abs = Math.abs(diff);
  let text: string;
  if (abs < MIN) text = "less than a minute";
  else if (abs < HOUR) text = `${Math.round(abs / MIN)} min`;
  else if (abs < 24 * HOUR) {
    const total = Math.round(abs / MIN);
    const h = Math.floor(total / 60);
    const m = total % 60;
    text = m ? `${h} h ${m} min` : `${h} h`;
  } else {
    const d = Math.round(abs / (24 * HOUR));
    text = `${d} day${d === 1 ? "" : "s"}`;
  }
  if (abs < MIN) return diff >= 0 ? "now" : "just now";
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** How long ago a fact was checked: "checked 4 min ago" */
export function age(at: number, now: number): string {
  if (now - at < MIN) return "just now";
  return relative(at, now);
}

export type Urgency = "overdue" | "now" | "soon" | "today" | "later" | "none";

export function urgency(deadline: number | null, now: number): Urgency {
  if (deadline == null) return "none";
  const diff = deadline - now;
  if (diff < 0) return "overdue";
  if (diff < 30 * MIN) return "now";
  if (diff < HOUR) return "soon";
  if (diff < 12 * HOUR) return "today";
  return "later";
}

/** Clock time in a place, with its zone: "14:00 CEST". Defaults to UTC. */
export function clock(iso: string | number, tz = "UTC"): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
  return `${time} ${zoneName(d, tz)}`;
}

/** "Wed 21 Oct, 14:00 CEST" */
export function dayClock(iso: string | number, tz = "UTC"): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(d);
  return `${day}, ${clock(d.getTime(), tz)}`;
}

/** Clock time, with the day in front when it isn't the same day as `now`. */
export function when(iso: string | number, now: number, tz = "UTC"): string {
  const d = new Date(iso);
  const key = (t: number) => new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeZone: tz }).format(t);
  return key(d.getTime()) === key(now) ? clock(d.getTime(), tz) : dayClock(d.getTime(), tz);
}

function zoneName(d: Date, tz: string): string {
  if (tz === "UTC") return "UTC";
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  // en-GB gives "CEST" for Berlin but "GMT+3" for Helsinki; name the common ones.
  const names: Record<string, string> = { "GMT+3": "EEST", "GMT+2": "EET" };
  return part ? (names[part] ?? part) : tz;
}

export function money(minor: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
