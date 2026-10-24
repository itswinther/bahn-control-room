import type { QueueItem } from "@/lib/ui/contract";
import { clock, relative, urgency } from "@/lib/ui/present";
import type { LocalDecision } from "../providers";

/** "6m", "2h 47m", "Late 2m", "Sat" */
export function timeLeft(item: QueueItem, now: number, ready: boolean, decision?: LocalDecision) {
  if (decision) return decision.decision === "REJECTED" ? "Sent back" : "Done";
  if (!item.deadline) return "—";
  const t = Date.parse(item.deadline);
  if (!ready) return clock(t).replace(" UTC", "");
  if (t - now > 24 * 3_600_000) return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(t);
  const r = relative(t, now)
    .replace(/^in /, "")
    .replace(/ ago$/, "")
    .replace(" min", "m")
    .replace(" h ", "h ")
    .replace(/ h$/, "h");
  return t < now ? `Late ${r}` : r;
}

export function tone(item: QueueItem, now: number, decision?: LocalDecision) {
  if (decision) return "done";
  if (item.kind === "WAITING") return "grey";
  if (item.kind === "SAFETY") return "red";
  const u = urgency(item.deadline ? Date.parse(item.deadline) : null, now);
  return u === "overdue" || u === "now" ? "red" : u === "soon" ? "orange" : "ink";
}
