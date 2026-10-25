// Held-out test: Bahn's mistakes in new words (fixtures/reworded-mistakes.json), through the rules
// alone and, with --claude and a key, through the rules plus Claude's reading. Reports, never fails:
// the point is the honest score, not a gate.
//   npm run eval:reworded [-- --claude]
import "dotenv/config"
import { readFileSync } from "node:fs"
import path from "node:path"
import { checkProposal, driverMessageOk, type CheckInput } from "../lib/shift-watch/checks"
import { canRead, readProposalText } from "../lib/shift-watch/judge"
import { readByClaude, readByRules } from "../lib/shift-watch/read"

type Case = { id: string; expect: string; command: string; summary: string; payload: Record<string, unknown>; evidence?: { table: string; id: string; minutes_old: number }[] }
const { cases } = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "reworded-mistakes.json"), "utf8")) as { cases: Case[] }
const withClaude = process.argv.includes("--claude")
if (withClaude && !canRead()) throw new Error("--claude needs ANTHROPIC_API_KEY in .env")

const AT = "2026-10-21T09:00:00Z"
const input = (c: Case): CheckInput => ({
  command: c.command, summary: c.summary, payload: c.payload, created_at: AT,
  evidence: (c.evidence ?? []).map((e) => ({ table: e.table, id: e.id, observed_at: new Date(Date.parse(AT) - e.minutes_old * 60_000).toISOString() })),
})
const right = (c: Case, r: ReturnType<typeof checkProposal>) => c.expect === "PASS" ? r.outcome === "PASS" : r.reasons.some((x) => x.check === c.expect)

async function main() {
  const score = { rules: 0, claude: 0 }
  for (const c of cases) {
    const rules = checkProposal(input(c))
    const both = withClaude ? checkProposal(input(c), await readProposalText(c)) : null
    score.rules += Number(right(c, rules))
    if (both) score.claude += Number(right(c, both))
    const show = (r: ReturnType<typeof checkProposal>) => `${right(c, r) ? "ok  " : "MISS"} ${r.outcome.padEnd(9)}`
    console.log(`${c.id.padEnd(10)} want ${c.expect.padEnd(18)} rules: ${show(rules)}${both ? ` rules+Claude: ${show(both)} ${[...new Set(both.reasons.map((x) => x.check))].join(", ")}` : ""}`)
  }
  console.log(`\nRules alone: ${score.rules} of ${cases.length}.${withClaude ? ` Rules plus Claude: ${score.claude} of ${cases.length}.` : " Add --claude to include Claude's reading."}`)

  // The agent's messages to drivers (fixtures/driver-messages.json), read the way review.ts reads them.
  const { cases: msgs } = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "driver-messages.json"), "utf8")) as { cases: { id: string; expect: "HOLD" | "SEND"; text: string }[] }
  const said = { rules: 0, claude: 0 }
  const verdict = (ok: boolean) => (ok ? "SEND" : "HOLD")
  console.log("\nMessages to drivers:")
  for (const m of msgs) {
    const rules = verdict(driverMessageOk(m.text))
    const both = withClaude ? verdict(driverMessageOk(m.text, await readProposalText({ command: "driver.message", summary: m.text, payload: {} }))) : null
    said.rules += Number(rules === m.expect)
    if (both) said.claude += Number(both === m.expect)
    const show = (v: string) => `${v === m.expect ? "ok  " : "MISS"} ${v}`
    console.log(`${m.id.padEnd(10)} want ${m.expect}  rules: ${show(rules)}${both ? `  rules+Claude: ${show(both)}` : ""}  "${m.text.slice(0, 60)}"`)
  }
  console.log(`\nRules alone: ${said.rules} of ${msgs.length}.${withClaude ? ` Rules plus Claude: ${said.claude} of ${msgs.length}.` : ""}`)

  // What a driver's message is about (fixtures/driver-intents.json): the keyword rules, and Claude's reading with a key.
  const { cases: intents } = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "driver-intents.json"), "utf8")) as { cases: { id: string; text: string; intent: string }[] }
  const sorted = { rules: 0, claude: 0 }
  console.log("\nWhat a driver's message is about:")
  for (const c of intents) {
    const rules = readByRules(c.text).intent
    const claude = withClaude ? (await readByClaude(c.text)).intent : null
    sorted.rules += Number(rules === c.intent)
    if (claude) sorted.claude += Number(claude === c.intent)
    console.log(`${c.id.padEnd(13)} want ${c.intent.padEnd(17)} rules: ${(rules === c.intent ? "ok   " : "MISS ") + rules.padEnd(17)}${claude ? ` Claude: ${claude === c.intent ? "ok   " : "MISS "}${claude}` : ""}`)
  }
  console.log(`\nRules alone: ${sorted.rules} of ${intents.length}.${withClaude ? ` Claude: ${sorted.claude} of ${intents.length}.` : ""}`)

  // Drivers writing casually or in their own language (fixtures/driver-languages.json): live reading only.
  if (!withClaude) return
  type Lang = { id: string; text: string; intent: string; unclear: boolean | null; forbid: string | null }
  const { cases: langs } = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "driver-languages.json"), "utf8")) as { cases: Lang[] }
  let read = 0
  console.log("\nDrivers in their own words:")
  for (const c of langs) {
    const r = await readByClaude(c.text)
    const misses = [
      r.intent !== c.intent ? `intent ${r.intent}` : "",
      c.unclear !== null && c.unclear !== r.unclear.length > 0 ? (c.unclear ? "missed a gap" : "flagged a gap that isn't there") : "",
      c.forbid && new RegExp(c.forbid).test(r.english ?? c.text) ? "added a time" : "",
    ].filter(Boolean)
    read += Number(!misses.length)
    console.log(`${c.id.padEnd(6)} ${misses.length ? `MISS ${misses.join(", ")}` : "ok  "}  "${c.text}" -> ${r.english ?? "(English)"}${r.unclear.length ? ` | unclear: ${r.unclear.join("; ")}` : ""}`)
  }
  console.log(`\nClaude's reading: ${read} of ${langs.length}.`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
