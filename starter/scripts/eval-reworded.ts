// Held-out test: Bahn's mistakes in new words (fixtures/reworded-mistakes.json), through the rules
// alone and, with --claude and a key, through the rules plus Claude's reading. Reports, never fails:
// the point is the honest score, not a gate.
//   npm run eval:reworded [-- --claude]
import "dotenv/config"
import { readFileSync } from "node:fs"
import path from "node:path"
import { checkProposal, type CheckInput } from "../lib/shift-watch/checks"
import { canRead, readProposalText } from "../lib/shift-watch/judge"

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
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
