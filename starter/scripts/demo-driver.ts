// The scripted demo driver: sends the driver's lines at set points so the video can't go off-script.
// In the live pitch a teammate types on the driver page instead.
//
//   npx tsx scripts/demo-driver.ts [demo] [--direct] [--base=http://localhost:3000]
//
// By default each line goes to Shift Watch's POST /api/driver/messages. --direct stands in for
// Shift Watch until that route exists: it stores the message and wakes the order agent itself.
import "dotenv/config"
import postgres from "postgres"

type Line = {
  driver_id: string
  order_id: string // used by --direct only; Shift Watch finds the order itself
  text: string
  /** Seconds to wait before sending. */
  after_s?: number
  /** Wait for Shift Watch's next message to this driver before sending. */
  wait_for_reply?: boolean
}

const DEMOS: Record<string, Line[]> = {
  // Team plan, "One case, step by step": the CD-420603 driver in the terminal queue. One line only: a
  // second message would wake the agent again, and its recording only fits the snapshot state.
  "ord-00603": [
    { driver_id: "drv-121", order_id: "ord-00603", after_s: 5, text: "Still in the queue. Navigation now says 12:20 at check-in." },
  ],
}

const args = process.argv.slice(2)
const demo = args.find((a) => !a.startsWith("--")) ?? "ord-00603"
const direct = args.includes("--direct")
const base = args.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3000"
const lines = DEMOS[demo]
if (!lines) throw new Error(`No demo "${demo}". Known: ${Object.keys(DEMOS).join(", ")}`)

const sql = postgres(process.env.DATABASE_URL ?? "postgres://controlroom:controlroom@localhost:5438/controlroom")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function latestOutgoing(driverId: string): Promise<string | null> {
  const [row] = await sql`SELECT created_at FROM driver_messages WHERE driver_id = ${driverId} AND direction = 'OUT' ORDER BY created_at DESC LIMIT 1`
  return row ? new Date(row.created_at).toISOString() : null
}

async function send(line: Line) {
  if (!direct) {
    const res = await fetch(`${base}/api/driver/messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ driver_id: line.driver_id, text: line.text, simulated: true }),
    })
    if (res.status === 404) throw new Error("POST /api/driver/messages doesn't exist yet. Use --direct until Shift Watch's intake is built.")
    return `${res.status} ${await res.text()}`
  }
  // Stand-in for Shift Watch's intake: store the message on the demo clock, then wake the order's agent.
  const { now } = (await (await fetch(`${base}/api/clock`)).json()) as { now: string }
  const id = `dm_${crypto.randomUUID().slice(0, 8)}`
  await sql`INSERT INTO driver_messages (id, driver_id, order_id, direction, author, text, language, quick_replies, simulated, status, created_at)
    VALUES (${id}, ${line.driver_id}, ${line.order_id}, 'IN', 'driver', ${line.text}, 'en', '[]'::jsonb, true, 'SENT', ${now})`
  const res = await fetch(`${base}/api/agents/run`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: line.order_id, reason: "DRIVER_MESSAGE", reason_detail: `Driver message relayed by Shift Watch at ${now.slice(11, 16)}: '${line.text}'` }),
  })
  return `${res.status} ${await res.text()}`
}

async function main() {
  for (const line of lines) {
    if (line.wait_for_reply) {
      const since = await latestOutgoing(line.driver_id)
      process.stdout.write("waiting for Shift Watch's reply")
      for (let i = 0; i < 600 && (await latestOutgoing(line.driver_id)) === since; i++) { await sleep(1000); if (i % 10 === 9) process.stdout.write(".") }
      console.log()
    }
    if (line.after_s) await sleep(line.after_s * 1000)
    console.log(`driver ${line.driver_id}: "${line.text}" -> ${await send(line)}`)
  }
  await sql.end()
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
