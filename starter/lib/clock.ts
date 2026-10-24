// The demo clock: starts at the dataset snapshot when the server starts and runs in real time.
// Every "now" in our code comes from here, never from the computer's clock.

const SNAPSHOT = "2026-10-21T09:00:00Z"

type ClockState = { startAt: number; realStart: number }
// Kept on globalThis so a dev-server hot reload doesn't restart the demo.
const store = globalThis as { __demoClock?: ClockState }

function state(): ClockState {
  return (store.__demoClock ??= { startAt: Date.parse(process.env.DEMO_CLOCK_START ?? SNAPSHOT), realStart: Date.now() })
}

export function now(): Date {
  const s = state()
  return new Date(s.startAt + (Date.now() - s.realStart))
}

export const nowIso = () => now().toISOString()

export function resetClock(): void {
  store.__demoClock = undefined
  state()
}

/** How long a person's decision or released message can be undone before it takes effect. */
export const UNDO_MS = 10_000
