import type { QueueItem } from "./contract";

export type Group = "now" | "today" | "parked";

const HOUR = 3_600_000;

export function groupOf(item: QueueItem, now: number): Group {
  if (item.kind === "WAITING") return "parked";
  if (item.kind === "SAFETY" || item.outcome) return "now";
  if (item.deadline && Date.parse(item.deadline) - now < HOUR) return "now";
  return "today";
}

/** Shift Watch's order (safety first, then earliest deadline), with parked rows last. */
export function sortQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => Number(a.kind === "WAITING") - Number(b.kind === "WAITING"));
}

/** Still needs a person: not just decided (a failed one still does). */
export const needsCall = (i: QueueItem) => !i.outcome || i.outcome.failed;
