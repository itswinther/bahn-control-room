// Start the demo clock when the server starts, not on the first request that asks for the time.
// Then, once a minute, wake each order's agent whose own next check has come due (live mode only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  ;(await import("./lib/clock")).now()
  const timers = globalThis as { __wakeTimer?: ReturnType<typeof setInterval> }
  if (timers.__wakeTimer) return // a dev-server reload must not start a second one
  const { failOrphanedRuns, wakeDue } = await import("./lib/agents/order-agent")
  await failOrphanedRuns().catch((e) => console.error("failOrphanedRuns:", e))
  // Anything a run left unchecked before the restart is checked now, so it can't sit out of sight.
  const { pendingOrders, reviewOrder } = await import("./lib/shift-watch/review")
  for (const id of await pendingOrders().catch(() => [])) await reviewOrder(id).catch((e) => console.error("reviewOrder:", e))
  // Once a minute: wake agents whose next check is due (live), and ask tomorrow's drivers to confirm (both modes).
  const { askConfirmations } = await import("./lib/shift-watch/confirm")
  timers.__wakeTimer = setInterval(() => {
    void wakeDue().catch((e) => console.error("wakeDue:", e))
    void askConfirmations().catch((e) => console.error("askConfirmations:", e))
  }, 60_000)
}
