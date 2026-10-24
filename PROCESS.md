# How we worked with AI

How we built our entry for Bahn's Car Delivery Control Room challenge with
coding agents (Claude Code and Claude in the desktop app): what we asked for,
what we checked, what we threw away, and where we did not take the first
answer.

The first section is the short version: the decisions that changed the
product. The log below it is the full record, written as we go, newest at the
bottom. Every entry points to the commit, file or output that backs it up.

## Decisions that mattered

1. **We measured before designing, and it changed the pitch.**
   We asked Claude to dig into the dataset for an "overseer" idea. It measured
   how long Bahn's people took to review agent proposals (mostly 2–14 minutes)
   and how long drivers waited for a reply (median 12 minutes, longest 152,
   counting the 20 replies addressed to the driver; a first count of 24 wrongly
   included internal notes). People respond fast, so speed was not the problem. We dropped
   "faster" from the pitch and focused on the quality of what reaches a person.
   Evidence: `dataset/data/agent_proposals.jsonl`, `dataset/data/messages.jsonl`.

2. **Bahn's own corrections became our checklist.**
   Of Bahn's 14 recorded agent proposals, people edited 3, rejected 1, and 1
   failed when it ran. Each correction names a mistake (stale ferry list, a
   quote treated as a booking, blaming the driver, restart advice, retrying a
   timed-out booking). Those five became Shift Watch's checks, and the 14
   proposals became its test set.
   Evidence: _link the proposal replay output here._

3. **We checked our teammate's analysis instead of trusting it.**
   A teammate's review bundle cited 45 record IDs and shipped a script. Claude
   verified every ID against the dataset and re-ran the script (66 quiet
   orders, 17 flagged: matched). It also found 3 factual slips and 2 urgent
   cases the bundle missed (CD-420603, CD-420593).

4. **We reversed Claude's own recommendation.**
   Claude first suggested making the chat with Shift Watch the main screen.
   Weighed against the taste criterion ("does one glance tell you what is
   wrong?"), a chat can't be scanned. The queue and case view stayed primary;
   the chat moved to a side panel.

5. **The challenge partner changed our focus.**
   We expected problems that span several orders to be the overseer's main
   job. The partner told us they are not common, and that driver chat is
   still handled by people only. We moved the focus to one agent that drivers
   and operators both talk to.

6. **Claude got a fact about our own team wrong, and we caught it.**
   Claude assumed our teammate's review bundle came from a competing team and
   repeated that in our shared docs. We corrected it, and fixed every doc that
   said so.

## Log

Format for every entry:

```text
### <date> <time> · <who> · <topic>
- Asked:
- Checked:
- Changed or threw away:
- Evidence: <commit, file or output>
```

### 2026-10-24 · team + Claude · reading the packet

- Asked: read the brief, operations context, dataset README, schema and every
  file in the repo; brainstorm solution directions.
- Checked: counts and examples against the JSONL files, not only the docs.
- Changed or threw away: settled on an overseer agent over one deep area,
  pending the challenge partner's answer.
- Evidence: this repo's `dataset/`.

### 2026-10-24 · team + Claude · overseer deep dive

- Asked: look deeper at the data as an operations expert; what would an
  overseer catch that one agent per order can't?
- Checked: every agent proposal and its review, alerts, incidents, work items,
  room posts and driver conversations; measured review and reply times.
- Changed or threw away: the "faster" pitch (see decision 1); kept the five
  recorded corrections as checks (decision 2).
- Evidence: `dataset/data/agent_proposals.jsonl`.

### 2026-10-24 · team + Claude · starter or fresh build

- Asked: keep the starter or start from scratch?
- Checked: the starter's size, stack and setup.
- Changed or threw away: kept its data layer and reading code; the screens get
  replaced.
- Evidence: `starter/lib/present/`.

### 2026-10-24 · team + Claude · checking the teammate's review bundle

- Asked: read and evaluate the bundle.
- Checked: all 45 cited record IDs, a re-run of its script, the claims marked
  as inference or estimate.
- Changed or threw away: corrected 3 claims; added 2 missed urgent cases.
- Evidence: decision 3.

### 2026-10-24 · team + Claude · challenge partner talk

- Asked: what do the partner's answers change?
- Checked: the insights from conversation against the plan.
- Changed or threw away: moved the focus to driver communication; dropped the
  cost display (cost is not graded).
- Evidence: decision 5.

### 2026-10-24 · team + Claude · critical review against the judging criteria

- Asked: evaluate the whole plan against the criteria and the time left.
- Checked: each recommendation against taste and the hours remaining.
- Changed or threw away: chat-first layout (decision 4); cut to three screens
  and three demo beats.
- Evidence: decision 4.

### 2026-10-24 · Mike + Claude · checking the plan against the data

- Asked: check the team plan's data claims before anyone builds on them.
- Checked: all 14 recorded proposals against the plan's seven checks; the
  CD-420603 travel records; CD-420593's message times; driver reply times by
  two methods. The other laptop's Claude re-checked each point and agreed.
- Changed or threw away: the target "catch the 5" (CD-420299's booking failed
  at the ferry company and can't be caught in advance); the plain 30-minute
  freshness rule (it would flag two refresh proposals whose job is refreshing);
  "will wait 30 more minutes" for CD-420593 (its limit passed at 08:27); the
  24-reply count. Added: a booking with no capacity evidence counts as stale.
  New pitch line: catches all 4 that people corrected, holds the retry after
  the 1 failure, and finds 3 more that bundle a customer step with a lookup.
- Evidence: `starter/fixtures/proposal-replay-expected.json`.

### 2026-10-24 · Mike + Claude · Backend 1 contract

- Asked: draft the shared contract, our tables and sample data (checkpoint 0).
- Checked: `npm run typecheck`; `drizzle-kit export` creates our 6 tables next
  to the starter's 13. CD-420603 has no ferry quotes in the data, so its ferry
  lists are marked mock, and the stale list is dated 07:10 to match a real
  operator message.
- Changed or threw away: added review, execution ("what happens next") and
  travel-leg shapes the plan lacked. Dropped Claude's first idea of time-
  filtering the starter's loader: the demo clock starts at the snapshot, so
  only our own mock rows can leak the future. Sample data is TypeScript with
  `satisfies`, because JSON imports would let wrong values through the type
  check. The agent is not told the 30-minute rule; Shift Watch enforces it, so
  reading the cache first is the agent's honest cheap move, not a staged one.
- Evidence: `starter/lib/contract.ts`, `starter/lib/schema-ours.ts`,
  `starter/fixtures/order-agent.ts`.

### 2026-10-24 · Mike + Claude · Backend 1 agent loop (checkpoint A)

- Asked: build the order agent's Claude tool loop, its first tools, the ferry
  and rest mocks, the demo clock and the two agent routes.
- Checked: `npm run typecheck`; `scripts/check-agent-rules.ts` asserts who
  approves each kind of proposal and the mock results. Claude reviewed its own
  loop and found two bugs before any run: once the 12-call cap was hit it could
  loop forever, and two runs could start on the same order. Both fixed.
- Changed or threw away: a hand-written loop instead of the SDK's tool runner,
  so every call is saved as a step and the cap is enforced in code. The
  approval level and owning desk are set in code from the command, never by
  the agent. A proposal may only cite record ids the agent read in that run,
  so it can't invent a source. Not yet live-tested: needs an API key.
- Evidence: `starter/lib/agents/`, `starter/scripts/check-agent-rules.ts`.

_Teammate's earlier log (`AI-PROCESS.md` in the review bundle, 17 entries):
merge its entries here._

## Evidence in this repo

Filled in as the build goes:

- `recordings/`: every recorded agent run (also used by replay mode).
- Proposal replay output: what Shift Watch would have done with Bahn's 14
  recorded proposals, next to what Bahn's people decided.
- Load test results: 5,000 generated orders.
- Screenshots of the screens before and after each round of changes.

## Rules we keep

- Every claim points to a record ID or a file; without one it's unverified.
- Claude says what it didn't check, and we read those lines.
- Ideas are tested against the data before they become features.
- Guesses are marked as guesses, in docs and in the product.
