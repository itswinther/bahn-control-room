// Start the demo clock when the server starts, not on the first request that asks for the time.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") (await import("./lib/clock")).now()
}
