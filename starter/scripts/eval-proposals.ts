// Runs Bahn's 14 recorded agent proposals through Shift Watch's checks and compares the result with
// fixtures/proposal-replay-expected.json, which was written before the checks existed.
//   npm run eval:proposals          (exits 1 on any mismatch)
//   npm run eval:proposals -- --claude   (adds Claude's reading of the text, as in live mode)
import "dotenv/config"
import { readFileSync } from "node:fs"
import path from "node:path"
import { checkProposal } from "../lib/shift-watch/checks"
import { readProposalText } from "../lib/shift-watch/judge"

const withClaude = process.argv.includes("--claude")

const data = path.join(process.cwd(), "..", "dataset", "data")
const rows = (file: string) => readFileSync(path.join(data, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))

type Recorded = {
  id: string; order_id: string; command: string; summary: string; created_at: string; status: string
  proposed_payload: Record<string, unknown>; evidence_refs: { table: string; id: string }[]
  review: { decision: string } | null; execution: { status: string; attempted_at: string } | null
}
type Expected = { order: string; command: string; outcome: string; approval?: string; checks: string[]; uncertain?: boolean }

const proposals = rows("agent_proposals.jsonl") as Recorded[]
const quoteTimes = new Map<string, string>(rows("travel_options.jsonl").map((o) => [o.id, o.checked_at]))
const expected = (JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "proposal-replay-expected.json"), "utf8")).proposals) as Expected[]

async function main() {
let mismatches = 0
const lines: string[] = []
for (const p of [...proposals].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
  // Failures Bahn recorded before this proposal; a verify-outcome proposal that ran counts as a check.
  const failures = proposals
    .filter((q) => q.order_id === p.order_id && q.execution?.status === "FAILED")
    .map((q) => ({ at: q.execution!.attempted_at, command: q.command }))
  const outcomeCheckedSince = (iso: string) => proposals.some((q) => q.order_id === p.order_id && q.command.endsWith("verify_booking_outcome") && q.status === "EXECUTED" && q.created_at > iso)

  const result = checkProposal({
    command: p.command, summary: p.summary, payload: p.proposed_payload ?? {}, created_at: p.created_at,
    evidence: p.evidence_refs.map((e) => ({ ...e, observed_at: e.table === "travel_options" ? quoteTimes.get(e.id) ?? null : null })),
    failures, outcomeCheckedSince,
  }, withClaude ? await readProposalText({ command: p.command, summary: p.summary, payload: p.proposed_payload ?? {} }) : undefined)
  const want = expected.find((e) => e.order === p.order_id && e.command === p.command)
  const checks = [...new Set(result.reasons.map((r) => r.check))].sort()
  const ok = !!want && want.outcome === result.outcome && (!want.approval || want.approval === result.approval) && JSON.stringify([...want.checks].sort()) === JSON.stringify(checks)
  if (!ok) mismatches++
  const bahn = p.review?.decision ?? p.status
  lines.push(`${ok ? "ok  " : "DIFF"} ${p.order_id} ${p.command.padEnd(32)} Bahn: ${bahn.padEnd(16)} Shift Watch: ${result.outcome.padEnd(9)} ${result.approval.padEnd(5)} ${checks.join(", ")}${want?.uncertain ? "  (uncertain)" : ""}`)
  if (!ok) lines.push(`       expected ${want ? `${want.outcome} ${want.approval ?? ""} ${want.checks.join(", ")}` : "no entry"}`)
}
console.log(lines.join("\n"))
console.log(`\n${proposals.length - mismatches} of ${proposals.length} match the expected outcome.`)
process.exit(mismatches ? 1 : 0)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
