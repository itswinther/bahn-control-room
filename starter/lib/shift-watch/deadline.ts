// When a loose-end card is due. Kept apart from queue.ts so the rule can be checked without a database.

type Timed = { deadline: string | null; ours?: true }

/**
 * The earliest time still ahead: a reason's own time or the order's hard time (a check-in, a pickup slot).
 * A promise Shift Watch made (`ours`) always counts, even once it's broken, so a waiting driver is never
 * hidden behind a later check-in by an older overdue loose end. Only when nothing is ahead does the card
 * show its most overdue time. `lead` is the reason the time belongs to; null when it's the hard time.
 */
export function looseEndDeadline<R extends Timed>(reasons: R[], hard: { at: string } | null, nowMs: number): { deadline: string | null; lead: R | null } {
  const timed = reasons.filter((r): r is R & { deadline: string } => !!r.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))
  const live = timed.find((r) => r.ours || Date.parse(r.deadline) >= nowMs)
  if (live && (!hard || live.deadline <= hard.at)) return { deadline: live.deadline, lead: live }
  if (hard) return { deadline: hard.at, lead: null }
  return timed[0] ? { deadline: timed[0].deadline, lead: timed[0] } : { deadline: null, lead: null }
}
