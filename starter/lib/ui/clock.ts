/**
 * The demo clock. The server owns it (lib/clock.ts): it starts at the dataset snapshot and runs in
 * real time, so "in 2 h" always means from the snapshot, never the computer's clock.
 */
export const SNAPSHOT = Date.parse(process.env.NEXT_PUBLIC_DEMO_CLOCK_START ?? "2026-10-21T09:00:00Z");

/** Demo time minus this computer's time, from GET /api/clock; null if the server can't be reached. */
export async function syncDemoClock(): Promise<number | null> {
  try {
    const sent = Date.now();
    const res = await fetch("/api/clock", { cache: "no-store" });
    const { now } = (await res.json()) as { now: string };
    // Assume the answer was made halfway through the round trip.
    return Date.parse(now) - (sent + (Date.now() - sent) / 2);
  } catch {
    return null;
  }
}
