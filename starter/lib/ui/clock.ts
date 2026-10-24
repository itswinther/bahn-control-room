/**
 * The demo clock. Starts at the dataset snapshot and runs in real time,
 * so "in 2 h" always means from the snapshot, never the computer's clock.
 */
export const SNAPSHOT = Date.parse(
  process.env.NEXT_PUBLIC_DEMO_CLOCK_START ?? "2026-10-21T09:00:00Z",
);

const KEY = "bahn-demo-clock-start";

/** Real-world ms when this browser session started the demo clock. */
export function demoStartedAt(): number {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) return Number(saved);
    const now = Date.now();
    sessionStorage.setItem(KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

export function resetDemoClock() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: the clock simply restarts on reload */
  }
}

export function demoNow(startedAt: number): number {
  return SNAPSHOT + (Date.now() - startedAt);
}
