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
  "verify booking outcome" counts as bundling a customer review.
- Evidence: decision 7.

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
