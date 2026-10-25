// Re-records the demo cases live, so replay mode has fresh runs to play back. Overwrites the files in
// recordings/. Needs a server started in live mode with recording on:
//   1. In .env: AGENT_MODE=live, RECORD=1, ANTHROPIC_API_KEY=...
//   2. npm run dev
//   3. npm run record [-- ord-00603] [--base=http://localhost:3000]   (an order id records only that case)
// Then set AGENT_MODE=replay again and remove RECORD=1.
import type { RunRequest, RunResponseDetail } from "../lib/contract"

// The order agent's demo wake-ups. CD-420603 comes in through Shift Watch's intake, like the demo.
const CASES: (RunRequest | { order_id: string; driver_id: string; text: string })[] = [
  { order_id: "ord-00603", driver_id: "drv-121", text: "Still in the queue. Navigation now says 14:20 at check-in." },
  { order_id: "ord-00299", reason: "LOOSE_END", reason_detail: "The 07:10 ferry booking attempt for the driver timed out with no reference, and the crossing shows sold out. Nobody has checked what happened to that attempt." },
  { order_id: "ord-00322", driver_id: "drv-319", text: "The warning light is still on. I'm parked and waiting." },
  { order_id: "ord-00593", reason: "LOOSE_END", reason_detail: "The driver at the pickup site said at 07:57 they could wait 30 more minutes; that ran out at 08:27 and the car still isn't released." },
]

const base = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3000"
const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(runId: string): Promise<RunResponseDetail> {
  for (let i = 0; i < 300; i++) {
    const detail = (await (await fetch(`${base}/api/runs/${runId}`)).json()) as RunResponseDetail
    if (detail.run.status !== "RUNNING") return detail
    await sleep(1000)
  }
  throw new Error(`${runId} still running after 5 minutes`)
}

async function main() {
  await post("/api/clock", {}) // recordings are only valid from the snapshot state
  const only = process.argv.slice(2).filter((a) => /^ord-\d{5}$/.test(a))
  for (const c of CASES.filter((c) => !only.length || only.includes(c.order_id))) {
    const res = "driver_id" in c ? await post("/api/driver/messages", { driver_id: c.driver_id, text: c.text, simulated: true }) : await post("/api/agents/run", c)
    const runId = res.body.run_id as string | undefined
    if (!runId) throw new Error(`No run started (${res.status}): ${JSON.stringify(res.body)}`)
    const { run, steps } = await waitFor(runId)
    if (run.mode !== "live") throw new Error("The server is in replay mode. Set AGENT_MODE=live and RECORD=1 in .env, restart npm run dev, then run this again.")
    console.log(`${run.order_id} ${run.reason}: ${run.status}, ${run.tool_calls} tool calls${run.stop_reason ? ` (${run.stop_reason})` : ""}`)
    for (const s of steps.filter((s) => s.kind === "TOOL_CALL" || s.agent === "shift-watch")) console.log(`  ${s.tool ?? s.agent}: ${s.result_summary?.slice(0, 110)}`)
    await post("/api/clock", {}) // each case starts from the snapshot too
  }
  console.log("\nSaved to recordings/. Read each run before committing it, then switch back to AGENT_MODE=replay.")
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
