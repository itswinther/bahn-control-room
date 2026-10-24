import type { QueueItem } from "@/lib/ui/contract";
import { clock, relative, urgency } from "@/lib/ui/present";

/** "6m", "2h 47m", "Late 2m", "Sat"; "Done" once a person has decided. */
export function timeLeft(item: QueueItem, now: number, ready: boolean) {
  if (item.outcome) return item.outcome.failed ? "Failed" : item.outcome.decision === "REJECTED" ? "Rejected" : "Done";
  if (!item.deadline) return "—";
  const t = Date.parse(item.deadline);
  if (!ready) return clock(t).replace(" UTC", "");
  if (t - now > 24 * 3_600_000) return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(t);
  const r = relative(t, now)
    .replace(/^in /, "")
    .replace(/ ago$/, "")
    .replace(" min", "m")
    .replace(" h ", "h ")
    .replace(/ h$/, "h")
    .replace(/ days?$/, "d");
  // Late by more than an hour: the hours are enough, and the chip stays short.
  return t < now ? `Late ${now - t > 3_600_000 ? r.replace(/ \d+m$/, "") : r}` : r;
}

export function tone(item: QueueItem, now: number) {
  if (item.outcome) return item.outcome.failed ? "red" : "done";
  if (item.kind === "WAITING") return "grey";
  if (item.kind === "SAFETY") return "red";
  const u = urgency(item.deadline ? Date.parse(item.deadline) : null, now);
  return u === "overdue" || u === "now" ? "red" : u === "soon" ? "orange" : "ink";
}
