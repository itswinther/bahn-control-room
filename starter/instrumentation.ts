// Start the demo clock when the server starts, not on the first request that asks for the time.
// Then, once a minute, wake each order's agent whose own next check has come due (live mode only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  ;(await import("./lib/clock")).now()
  const timers = globalThis as { __wakeTimer?: ReturnType<typeof setInterval> }
  if (timers.__wakeTimer) return // a dev-server reload must not start a second one
  const { wakeDue } = await import("./lib/agents/order-agent")
  timers.__wakeTimer = setInterval(() => void wakeDue().catch((e) => console.error("wakeDue:", e)), 60_000)
}
