import type { QueueItem } from "./contract";

export type Group = "now" | "today" | "parked";

const HOUR = 3_600_000;

export function groupOf(item: QueueItem, now: number): Group {
  if (item.kind === "WAITING") return "parked";
  if (item.kind === "SAFETY") return "now";
  if (item.deadline && Date.parse(item.deadline) - now < HOUR) return "now";
  return "today";
}

/** Safety first, then earliest deadline; no deadline last. */
export function sortQueue(items: QueueItem[]): QueueItem[] {
  const t = (i: QueueItem) => (i.deadline ? Date.parse(i.deadline) : Infinity);
  return [...items].sort((a, b) => {
    if (a.kind === "WAITING" !== (b.kind === "WAITING")) return a.kind === "WAITING" ? 1 : -1;
    if (a.kind === "SAFETY" !== (b.kind === "SAFETY")) return a.kind === "SAFETY" ? -1 : 1;
    return t(a) - t(b);
  });
}
