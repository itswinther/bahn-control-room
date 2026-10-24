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
   and how long drivers waited for a reply (median 12 minutes, longest 152, from
   20 replies addressed to the driver; see decision 7 for how that count was
   corrected). People respond fast, so speed was not the problem. We dropped
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

7. **A teammate checked Claude's plan against the data and found four errors
   before anyone built on them.**
   - Claude's plan promised the replay would catch all 5 corrected or failed
     proposals. Run by hand, it catches the 4 that people corrected before they
     ran. CD-420299's booking used a 2-minute-old quote and failed at the ferry
     company, so only a retry can be held. Two pending proposals get flagged
     for bundling a customer contact, which is right, not a false alarm.
   - A plain "older than 30 minutes" rule would have flagged two refresh
     proposals whose job is to refresh that data. The rule now applies only to
     booking and buying, and Claude added that missing evidence counts as stale.
   - The demo's ferry quotes for CD-420603 don't exist in the dataset, so they
     became labelled mock fixtures.
   - CD-420593's "30 more minutes" had already run out at 08:27.
   - Claude's reply-time count included internal operator notes. The
     teammate's method, counting only replies addressed to the driver, gives a
     median of 12 minutes and a longest of 152 from 20 replies.
   Claude re-ran each check against the data before we changed the plan; all
   four held.
   Evidence: `starter/fixtures/proposal-replay-expected.json` (expected result
   per proposal), the team plan's change list.

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

### 2026-10-24 · teammate + Claude · checking the plan against the data

- Asked (teammate): run Bahn's 14 recorded proposals through the plan's seven
  checks by hand, and check the demo case, the stated driver limit and the
  reply-time numbers against the records.
- Checked (Claude): re-ran each finding against the dataset. The 2- , 76- and
  92-minute evidence ages, the missing ferry quotes for CD-420603, the 07:57
  message on CD-420593, and both reply-time methods (24 replies with internal
  notes vs 20 replies addressed to the driver).
- Changed or threw away: the "catches all 5" target and pitch line; the plain
  30-minute rule; the claim that CD-420603's quotes were real; "will wait 30
  more minutes"; the earlier reply-time numbers. Open call: whether CD-420299's
  "verify booking outcome" counts as bundling a customer review. Settled
  later: it is flagged, so the pitch line says "3 more".
- Evidence: decision 7.

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

### 2026-10-24 · Mike + Claude · replay mode and a subagent test

- Asked: run a simulated version without an API key, have a separate agent
  test it end to end, and continue checkpoint B.
- Checked: a subagent set up the database, ran the CD-420603 path twice in
  replay (first proposal from the 07:10 list, then a send-back and a fresh
  proposal) and tried edge cases. Everything on the happy path passed. It found
  four real bugs: two parallel requests could both start a run (check-then-
  insert race), a numeric order id passed and reached a file path, timestamps
  weren't ISO as the contract says, and a second run could open a second
  proposal for the same order. All four fixed and re-tested: 4 parallel
  requests now give one 202 and three 409s.
- Changed or threw away: replay records the model's answers, not its steps, so
  replays go through the same tools and database writes as live runs. The
  CD-420603 recordings are hand-written simulations, labelled as such; real
  ones come from `RECORD=1` live runs. Evidence times now come from the tool
  that returned the record, not from the agent. Known limit: a replay can't
  adapt, so it is only valid from the state it was recorded in.
- Evidence: `starter/recordings/`, `starter/lib/agents/model.ts`.

### 2026-10-24 · Mike + Claude · first live runs on Sonnet 5.5

- Asked: run the agent live on CD-420603, 420299, 420322 and 420593 and record
  each run for replay.
- Checked: every proposal, driver message, note and status, line by line
  against the plan's rules. CD-420299 checked the timed-out booking before
  retrying; CD-420322 gave no restart advice and asked for the photo and
  location nobody had requested; CD-420593 released the waiting driver without
  taking a different car; all four flagged who pays where money was involved.
- Changed or threw away: the agent named evidence tables after get_order's
  sections ("bookings", "travel_quotes"), which Shift Watch's freshness check
  wouldn't recognise, so the table now comes from the record id's prefix in
  code. The rest mock counted from now, so CD-420299 got "72 h of rest" before
  the driver had even collected the car, and the agent repeated it as fact; the
  tool now takes when the driver reaches the terminal. Two driver messages
  carried instructions ("keep the car stopped", "don't take another car"); agent
  messages to drivers now wait for Shift Watch's check. The live CD-420603
  agent refreshed capacity on its own, so the demo's "caught" moment doesn't
  happen naturally: open for the team.
- Evidence: `starter/recordings/` (live, Sonnet 5.5).

### 2026-10-24 · Mike + Claude · team calls after the live runs

- Asked: three calls the live runs raised.
- Changed or threw away: the staged "careless agent" run for CD-420603. The
  live agent refreshed capacity on its own, so the demo shows our agent doing
  it right and Shift Watch catching Bahn's own recorded mistake on CD-420194.
  An acknowledgement may now repeat an instruction a person already gave the
  driver, citing that message; anything new still needs a proposal. Turned on
  short progress notes so each agent step can show why.
- Checked: a new assert caught that the driving-advice backstop missed
  "restarting", because of a word boundary: Bahn's real recorded mistake
  ("Try restarting the vehicle once") would have got through. Fixed. The
  re-recorded runs cite dataset tables, and CD-420322's reminder cites the
  support desk's 08:13 message. Progress notes are sparse (about one per run).
- Evidence: `starter/lib/agents/rules.ts`, `starter/recordings/`.

### 2026-10-24 · Mike + Claude · scripted demo driver

- Asked: build the scripted driver for the video.
- Checked: ran it against replay: the message lands on the demo clock, the
  agent reads it in the driver chat and the recorded proposal comes back.
  Claude caught its own bug before the first run: the script stamped messages
  with the computer's clock (24 Oct), so the agent, which only reads up to the
  demo clock, would never have seen them. Fixed with a clock route the screens
  can use too.
- Changed or threw away: waiting for Backend 2's driver route. The script has a
  `--direct` mode that stands in for Shift Watch's intake until it lands.
- Evidence: `starter/scripts/demo-driver.ts`, `starter/app/api/clock/`.

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
