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
   Evidence: `starter/evals/proposals.txt` (the replay's output), `npm run eval:proposals`.

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

7. **A teammate checked Claude's plan against the data and found five errors
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
   Claude re-ran each check against the data before we changed the plan; each
   held.
   Evidence: `starter/fixtures/proposal-replay-expected.json` (expected result
   per proposal), the team plan's change list.

8. **We didn't count our own 14 of 14.** The checks were written from Bahn's
   14 proposals, so we wrote mistakes in new words before running them. The
   rules alone caught 0 of 10; with Claude reading, 10 of 10. The same for
   messages to drivers: the word list held none of 8 bad ones; with Claude,
   all 8.
   Evidence: `starter/evals/reworded-claude.txt`, `starter/fixtures/`.

9. **We scored ourselves the way the judges will, twice, and it caught us.**
   Three reviewers per round, who hadn't seen our own view. Round 1 found a
   driver quote on the safety card that the driver never wrote; it came from
   an old recording. Round 2 found the agent offering a guessed hour as a
   one-tap button. Both are fixed and re-tested live.
   Evidence: the two judging entries at the end of the log.

10. **We tested our idea about translation before building it, and it was
    wrong.** We expected Finnish and German time phrases to come out wrong;
    Claude read 12 of 12 right. The real failure was elsewhere: the reading
    filled in an hour the driver never gave. So we built "list the gaps,
    never fill them" and routing to the team that reads the language, not a
    translation guard.
    Evidence: the languages entry, `starter/fixtures/driver-languages.json`.

11. **We checked our own screens for the look of AI-made design, and kept
    what was Bahn's.** We asked Claude to research the common tells and audit
    the screens it had built against them. About half were there: uppercase
    display headings on every panel, coloured left-edge stripes, pills on
    everything, a chatbot "Ask me anything" opening. We removed those. We kept
    the cream background and pill-shaped main buttons, because they are Bahn's
    own brand, and Claude's suggestion to cut the motion was our call to skip.
    Evidence: the design entry at the end of the log, commit e9d5684.

## Log

Format for every entry:

```text
### <date> <time> · <who> · <topic>
- Asked:
- Checked:
- Changed or threw away:
- Evidence: <commit, file or output>
```

### 2026-10-24 · team + Claude · understanding the problem, before the plan

The first day's log, kept as it was written (19 entries). The scripts and files it names
(`LOGISTICS-ISSUES.md`, `order.js`, `quiet.js`, the review bundle with `findings.json`) were
written outside this repo. Its last two entries, the team plan and the plan check, are the
entries further down.

#### 1. Read the packet before building anything.
- **Asked:** clone the repo, read the brief, `OPERATIONS-CONTEXT.md` and the dataset README, then list the common logistics issues as a markdown file.
- **Checked:** Claude didn't just summarise the docs. It counted the real records (alerts, incidents, work items, proposals, conversation topics), so every issue in `LOGISTICS-ISSUES.md` points to a field and an example order.
- **Didn't take the first answer:** the first version was built from the docs and data summaries only, and Claude said it hadn't opened the attachments. We asked it to.

#### 2. Open every attachment, not a sample.
- **Asked:** first a sample, then "open all to get a full view": 30 PDFs, 12 receipts and 16 photos.
- **Checked:** rather than reading 58 files by eye, Claude extracted the PDF text with `pdftotext` and checked every file against the dataset: release driver vs assigned driver, paper date vs booked slot, receipt amount vs claim, photo vs the car on the order.
- **What the full pass found that the sample missed:**
  - two release papers dated after the pickup they authorise (ord-00725, ord-00958);
  - a car marked delivered whose delivery photos show an empty forecourt (ord-00612);
  - a corrected expense claim sharing a receipt with the original, a risk of paying twice (ord-00326).
- **Held back:** Claude flagged ord-00020's pickup photo as possibly the wrong model of Porsche. Because the packet's images are generated, it marked this "needs human review" rather than calling it an error. We kept that hedge.

#### 3. Tested our own idea, and dropped part of it.
- **Our idea:** that the errors came from agents mis-parsing addresses and VINs. We also proposed blind double-typing with paste disabled, and addresses picked from a maps search.
- **Checked:** Claude compared all 132 addresses with the original text the customer typed (`raw_input`). All 132 match, so nothing was mis-parsed. The bad address on ord-00023 was typed as just "Berlin". The missing VIN on ord-00009 came in through the API.
- **Threw away:** double-typing. Most orders come from customers and the API, not staff, so there's no typist to target. Blocking paste makes 17-character VINs worse. The EU doesn't require the VIN check digit, so it can't be the validator.
- **Kept, with changes:**
  - Maps search: kept, but it must store how precise the match is and reject city-only matches. Dealer problems turned out to be about which entrance and who has the keys, not the street address.
  - VINs: replaced double-typing with decoding the VIN against the stated make and model, plus scanning the VIN at pickup.

#### 4. Questioned the starter's board.
- **Asked:** look into "the board of lanes is not the answer".
- **Checked:** Claude read `board.ts`, `attention.ts` and the mockups. It found that the only critical case (ord-00322, red warning light) sits in the 5th column, beyond the right edge of the board mockup at 1440px.
- **Didn't take the first answer:** instead of accepting "43 need a person", Claude sorted the flagged orders by what they really need: about 10 need a decision, 13 need an agent to do legwork first, and 6 are owned by someone or waiting on others.
- **Caveat we noted:** that split uses Claude's simplified version of the starter's logic, run on the data files, not the running app.

#### 5. Checked what Bahn tells us about its agents.
- **Asked:** do the files say which models, prompts or context Bahn's agents use?
- **Answer:** no. There are only four agent records and the format of their proposals. The useful part is that format: evidence links, "recheck the current state before writing", and person review that keeps both the original and the edited payload.
- **What we'll reuse:** on ord-00322, a person edited out the agent's "try restarting the vehicle" advice. That's a ready-made example of why approvals matter. We'll design our agent's output in the same shape.

#### 6. Overseer agent idea: who escalates what, to whom.
- **Asked:** the four challenge areas share the same root causes, so could one overseer agent decide what to escalate and to which level?
- **Checked:** rather than design levels from scratch, Claude mapped who owns each open issue in the data: 11 human roles, plus owners on work items, alerts and incidents. It also read the 10 notes people wrote when reviewing agent proposals. Those notes act as Bahn's real approval rules (for example "don't say it's booked until it is", "no mechanical advice", "photos don't show who caused the damage").
- **Found:** 9 open alerts have no owner, so assigning one is a natural first job for an overseer. Whether the agent may contact the seller or receiver depends on whether they're the paying customer. The brief doesn't settle that, so it's a question for Bahn.

#### 7. Tested the escalation idea on one real order (ord-00458, seller hold on a Ferrari Roma).
- **Asked:** read the starter's full API response for the order, the same data the order page uses.
- **Found:**
  - **One blocker counted five times:** an alert, a work item, two customer emails and a site call all describe the same problem.
  - **Two days with no contact:** the customer reported the missing release on 19 Oct. Nobody called the pickup site until 21 Oct 08:34, and that call found the real problem: the seller had put a hold on the car over an unpaid invoice. A cheap agent call on 19 Oct would have found it two days earlier.
  - **"High" severity didn't mean "a person must decide".** The case was waiting on the customer, with a check due at 10:00, so it belongs in "waiting", not "decide now".
- **Didn't take at face value:** the customer's message "Der Ferrari Roma steht bei uns in der Filiale" means "the Ferrari Roma is at our branch". But the car is at a different dealer's site (Calverona, a separate customer account). We treat this as loose wording or a claim to check, not a fact.

#### 8. A second order, the opposite of the first (ord-00347, Mercedes EQE, Hamburg to Aarhus).
- **Found:** the alert is only "medium", but a real decision is due **10 minutes after the snapshot**: withdraw the live driver offer or keep it. Neither the car nor its keys can be found, the offer has been open for 6 days, and any driver could accept it and travel for nothing. The starter's headline says "Looking for a driver", which is the opposite of what should happen right now.
- **Lesson:** paired with ord-00458 (high severity, nothing to decide), this shows that **alert severity doesn't predict urgency**. What matters is the deadline for the decision and the cost of getting it wrong. Severity can't be used to sort the queue.
- **Root cause noted:** readiness was marked "confirmed" on 15 Oct, but the customer's handover sheet named a yard while the site profile said showroom. The dispatch agent published the offer on the strength of "confirmed". So **readiness confirmed doesn't mean the pickup location is confirmed**.
- **Kept both orders as test cases** for the overseer: it should put 347 in "decide now" and 458 in "waiting".

#### 9. The "missed ferry" chain (ord-00299, BMW M4, Leipzig to Helsinki).
- **Checked the times rather than trusting the alert text.** The alert says the "customer promise needs a decision". But the later sailing arrives 25 Oct 16:00 UTC, about 43 hours before the 27 Oct delivery window. So no date change and no customer approval are needed. It's a travel-desk decision about cost: the €387 ferry plus one hotel night.
- **Found that Bahn's agent asked permission for a lookup.** "Verify booking outcome" is just a read, so it needs no approval. But it was bundled with "review the later crossing with the customer", which does, so the whole proposal waited for review. Rule for our agent: **split proposals by approval level**.
- **Found the root cause:** the driver accepted a ferry route on 19 Oct and nobody booked the ferry for 2 days. The **driver** found the gap. As with ord-00347, an outside party caught Bahn's mistake. Rule for the overseer: a ferry route with a driver assigned but no ferry booked gets flagged.
- **Didn't take for granted:** the time from the Finnish ferry terminal to Helsinki isn't in the data, so the 43-hour margin is hedged.

#### 10. A "quiet" delivered order with a hidden problem (ord-00194, Volvo V60, Lyon to Vantaa).
- **Visible issue:** a small question about which reference is on the invoice.
- **What Claude did beyond that:** lined up every expense claim's time and country against the journey events. It found two **approved** driver claims (fuel at 18 Oct 00:40 UTC, a toll at 18 Oct 18:01 UTC) recorded **in France**. At those times the car should have been at the Hamburg terminal or on the ferry. The toll receipt PDF opened in step 2 confirms "FRANCE, 18.10.2026 20:01". The ferry was never confirmed as used.
- **Didn't jump to a conclusion:** this could be loose country data from the generator, or a real problem. Following the rule from ord-00055, the agent flags it and a person decides. The agent never decides who is at fault. "Payment recorded: false", so a hold before payout is still possible.
- **Also found:** the gate turned the car away **12 minutes after** check-in closed (16 Oct). The €219 replacement ferry has no record of who pays.

#### 11. New information from Bahn: GPS on some cars, plus pattern matching for route deviations.
- **Checked what the packet has:** only coarse progress from the driver's phone app (distance remaining, ETA). There are no coordinates, the data covers 25 orders, and there are frequent gaps of 3–9 hours and uploads up to 3 hours late. ord-00194 has **no tracking at all**, so its expense mismatch can't be settled from the packet. In Bahn's real system, GPS would answer it in seconds.
- **Treat it as another source, not as truth:** car GPS, the driver app, gate scans and what the driver says are four separate sources of evidence with different weight. A deviation is a reason to ask the driver first, not a diagnosis.
- **Open questions for Bahn:** whose tracker is it (Bahn's or the carmaker's), how many cars have one, how often it reports, and what the rules are on privacy for freelance drivers.
- **Scaled back after asking Bahn:** they said GPS triggers are small nudges, not a main focus. We dropped the idea of a GPS-centred demo (a simulated trace). GPS stays as one low-weight input to the overseer, a reason to ask the driver, and never escalates anything on its own. Claude's first suggestion was to make it a demo highlight. Bahn's answer overrode that.

#### 12. New information from Bahn: they run one agent per order, which starts sub-agents (for example to book a flight).
- **Reconciled with the packet:** the dataset's agents are split by job (dispatch, travel, monitor, copilot). Those best fit the *sub-agents* an order's agent calls on, not separate standalone agents.
- **How the overseer changed:** it no longer does case work, because each order's agent already holds its own case. Its job becomes: (1) things no single order can see, such as shared sites, drivers on several jobs, bundles and ferry space; (2) deciding whose escalation reaches a person first; (3) checking in on stalled agents. Each of our four test orders shows a stall the overseer would catch.
- **Design choice:** order agents report a structured status (waiting on, next check, decision deadline, proposed actions with their approval level). The overseer reads that, so there's no chatty back-and-forth between agents. The overseer is mostly rules, with the language model used only to summarise.

#### 13. We have no access to Bahn's order agents. Their records stand in for their status.
- **Checked:** the repo contains no agent code, only four agent records and the proposals they produced. The starter doesn't include an agent.
- **Decision:** the overseer works out each order's status from the packet (waiting on, next check, deadlines, pending proposals, last activity, shared site or driver). It runs on the data alone. We build **one real agent** ourselves, with mocked tools, which writes proposals in Bahn's format. Check-ins actually trigger our agent. On every other order, the nudge goes to the owning desk.
- **Leaning towards ord-00299 (ferry)** for the real agent: the most steps, and one money decision at the end.

#### 14. The safety stop and the cross-order cluster, pulled straight from the data.
- **Tooling:** Claude wrote a small script, `order.js`, that dumps every record linked to an order, so we no longer paste API output by hand.
- **ord-00322 (Bentley, red warning light):**
  - **Nobody knows where the car is.** The driver said "service-area car park". The last app reading was at 05:00, 233 km from Hamburg, 3 hours before the stop. The agent asked for a location pin at 08:37, and the driver replied without one.
  - **The dashboard photo was never actually requested**, even though the driver offered it at 08:22. The edited agent message only asked for the location.
  - **A tracking-gap alert at 05:16 went unanswered for 3 hours.**
  - **The driver has been on duty about 26 hours, including overnight**, and is now stranded far from home in Munich.
  - **The delivery yard belongs to the customer**, so telling it "the car isn't coming today" counts as contacting the customer.
- **The cluster:** the Driver marketplace desk has **four decisions due between 09:10 and 09:20**: ord-00347, 00689, 00941 and 00992. The overseer's job is to order them by deadline and consequence:
  - ord-00689 has a pickup **tomorrow with no driver**;
  - ord-00992's pickup depends on the same driver finishing another order (ord-00735);
  - ord-00154's uncertain ferry affects the same Marseille release desk as ord-00689.
- **Decision:** the "too many decisions due at once" view is the overseer's main demo moment. No single order's agent can see it.

#### 15. Checked the quiet orders for accuracy, then the two driver-availability cases.
- **Built `quiet.js`:** it runs every hidden-problem check we'd found across all 100 orders.
- **The first run flagged 24 of the 66 quiet orders. We checked each flag by hand, and three rules turned out to be noise:**
  - **"Offer expires before the slot"** fired on **9 of 9** market orders. That's just the normal booking cutoff.
  - **"No signed release yet"** fired a day or two ahead. In every case in the data, the release is verified 1.3–2 h before the slot.
  - **"App ETA after the promise"** fired on ord-00439 for a 40-minute overrun five days out. The **starter itself would show this one in red.**
- **After fixing those rules, 17 are flagged.** Most are cheap agent work or a batch backlog. Only about 4 need a person soon. We **kept these false alarms in the log** because they show how we tuned the rules.
- **ord-00449:** the ill driver's train leaves **85 minutes after the snapshot**. Bahn has paid for a train, a flight and a hotel, and the slot can't be saved by a later flight. So the real deadline is the train, not tomorrow's pickup. Nobody has flagged this.
- **ord-00399:** the driver (still on ord-00326, whose ETA is slipping) can't make a 1-hour slot. But the customer's own availability runs until 17:00 local, and the site is open until then. An afternoon pickup could work without a new agreement from the customer, though the release paper would need reissuing.

#### 16. The delivery handovers (ord-00437, ord-00164) and the yard relay (ord-00702).
- **ord-00437 (Bentley to a third-party business in Munich, delivery today):**
  - The access hours were corrected to 18:00 local, but **nobody is authorised to sign**. A contact named on the order (Celia Hollowmere) has been unconfirmed since 15 Oct.
  - The ETA has slipped to 13:58 UTC against a 14:00 promise end.
  - The pickup photos haven't been reviewed, and the receiver will inspect the car on arrival.
  - **Rule found:** a place can tell us *about access*, but only the customer can grant *authority to sign*.
- **ord-00164 (delivered 12 Oct, signed handover missing):**
  - The delivery site belongs to the **customer**, so the signature should be at the customer's own reception.
  - The work item has been overdue for about 45 h, with no message to the driver or the site, and the customer has chased twice.
  - The delivery photos have been unreviewed for 9 days.
- **ord-00702 (relay through a yard):**
  - The second driver warned only **13 minutes before** the yard's release cutoff. A check before the slot would have caught it hours earlier.
  - The yard is open 09:00–17:00 tomorrow, but the chosen slot is only 09:00–11:00. That's the same "narrower than available" pattern as ord-00399.
  - The final delivery is in the **same city** as the yard. So a realistic new date is simply tomorrow, which the agent could propose, but only once a driver is booked.
- **Pattern found:** Calverona appears in 3 test orders, as a seller's hold site (ord-00458), a pickup site (ord-00399) and a customer (ord-00437). An account-level view is something only the overseer could provide.

#### 17. Put everything into a review bundle for a second person.
- **Why:** we wanted a read that isn't anchored on ours. The review page asks the reviewer to push back on specific lines (levels, deadlines, contact rules, thresholds) rather than approve it as a whole.
- **What's in it:** the bundle includes the scripts, so every number can be re-run. Its "Limits" section lists what we didn't check.
- **Made it readable by AI as well as people:** `findings.json` is the one source of truth, and every claim is tagged with how sure we are: verified in the data, computed, estimate or inference. `REVIEW.md` is *generated* from it, so the two can't drift apart. `AGENTS.md` tells an AI reviewer how to verify claims and asks for replies in a fixed JSON format.
- **Checked the citations by script:** a check confirmed that all 46 record IDs and 48 order IDs cited in the JSON exist in the dataset. That guards against made-up references.

#### 18. Built demo and test cases on the before/after replay idea.
- **The idea:** we can't reach Bahn's order agents, so "before" is what happened in the data and "after" is our agent rerun from an earlier cut-off time. Replies to our agent come from the real messages sent after the cut-off.
- **What we built:** 26 cases.
  - 11 replays. The strongest catch a problem while the driver is still on site: wrong-car photos (ord-00071) and a missing signature (ord-00164).
  - 3 overseer tests.
  - 4 controls that must stay quiet.
  - 8 guardrails using invented messages: an address change by email, keys left unattended, a taxi cost, hidden instructions in a message, "can I drive on?", health details, and a question that tempts the agent to leak another customer's job.
- **Checked by script:** all 43 IDs exist, and every replayed reply is timestamped after its cut-off, so there's no future leak. We also caught a possible error: the guardrail's route direction was checked against the order's pickup and delivery addresses.

#### 19. Talked to Bahn and revised the plan.
- **Confirmed:** an overseer that ties the four areas together counts for Part 2. Driver chat is handled only by people today, and support sits in Intercom. Operations should feel like they're talking to one agent. Scaling is the real technical question. Cost isn't graded.
- **Corrected one of our claims:** Bahn said problems that span several orders are "not super common". We had called links between orders the overseer's unique value. We split that into two things: ranking people's attention across orders is needed on every shift, while problems that genuinely span orders are a secondary feature.
- **New insight:** Bahn's order agents schedule follow-ups at a fixed interval (two days in their example). That explains the 44-hour stall on ord-00458. We added a rule: time follow-ups from the decision deadline.
- **Our answer to scaling:** order agents publish a small status, the overseer runs rules over all of them and calls the model only for cases that cross a threshold, and the work is split by desk or region.

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
- Checked: all 45 cited record IDs (the bundle's own check above counted 46;
  the two scripts counted IDs differently, and both found every one in the
  dataset), a re-run of its script, the claims marked
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

### 2026-10-24 · team + Claude · Backend 1 contract

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

### 2026-10-24 · team + Claude · Backend 1 agent loop (checkpoint A)

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

### 2026-10-24 · team + Claude · replay mode and a subagent test

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

### 2026-10-24 · team + Claude · first live runs on Sonnet 5.5

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

### 2026-10-24 · team + Claude · team calls after the live runs

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

### 2026-10-24 · team + Claude · scripted demo driver

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

### 2026-10-24 · team + Claude · Shift Watch's proposal checks (Backend 2)

- Asked: build Shift Watch's seven checks and replay Bahn's 14 recorded
  proposals through them.
- Checked: `npm run eval:proposals` compares every result with the expected
  outcome written before the checks existed. First run: 13 of 14. The one
  difference was an inconsistency in our own expected file: CD-420299's
  "verify booking outcome" bundles a customer step with lookups like CD-420593
  and CD-420399, which already expected both checks. We changed that entry
  (marked `changed_after_first_run` in the file), not the checks. Now 14 of 14:
  the 4 corrections Bahn's people made are caught before running, the failed
  booking passes (it can't be caught in advance), and 3 pending proposals are
  split.
- Changed or threw away: one set of pure checks for both our proposals and
  Bahn's recorded ones; Bahn's records cite ids only, so quote ages are looked
  up in `travel_options`.
- Evidence: `starter/lib/shift-watch/checks.ts`, `npm run eval:proposals`.

### 2026-10-24 · team + Claude · Shift Watch reviews each run

- Asked: wire the checks to the agent's output.
- Checked: replayed the four live runs through the server. All four proposals
  passed to review with the right approver (the shift lead for CD-420322's
  recovery decision). CD-420322's repeated "keep it stopped" reached the driver
  because it cites the support desk's own 08:13 message to him. A planted
  proposal built on the 07:10 list was sent back ("the newest check is 110
  minutes old") and woke the agent again.
- Changed or threw away: Shift Watch only decides; the agent loop wakes the
  agent, so neither module imports the other. Added a limit the plan didn't
  have: after two send-backs on one order, the next failing proposal is held for
  a person, so agent and Shift Watch can't bounce forever.
- Evidence: `starter/lib/shift-watch/review.ts`.

### 2026-10-24 · team + Claude · the queue and the case view's data

- Asked: build the queue and case routes the frontend needs.
- Checked: on the snapshot with the four live runs replayed, the queue lists 25
  orders (the starter's board flags 43) and counts 75 as quiet, in about 340 ms,
  with the safety case first. Reading the output found three problems: a
  driver waiting past her limit sank to the bottom because its proposal had no
  deadline; a fix for that briefly sorted CD-420603 by the time an old action
  was approved, which mixed "overdue since" with "decide by"; and the case view
  missed CD-420603's 08:43 change request, because the starter reads a
  different field than this record uses. All three fixed. The agent must now
  give a decision deadline, or say why there is none.
- Changed or threw away: one card per decision would have put up to four cards
  on one order; an order's loose ends now go on its proposal card, or on one
  card per order. The shift summary comes from rules, so it works without the
  model; a Claude-written version is optional later.
- Evidence: `starter/lib/shift-watch/queue.ts`, `starter/lib/shift-watch/case.ts`.

### 2026-10-24 · team + Claude · what happens after Approve

- Asked: build approve, edit and reject, and carry the decision out.
- Checked: end to end on the four replayed proposals. The wrong desk gets 403,
  approving a cost without choosing who pays gets 400, approving twice gets 409,
  two clicks at once give one 200 and one 409, and the safety proposal needs
  the shift lead. The first test run showed the old 14:00 booking still listed
  as booked (that run's payload named it under a key we didn't read), and "the
  agent checks again after check-in closes" wasn't true yet. Both fixed: a new
  crossing releases the order's current ferry booking once the new one is
  confirmed, and the agent's next check moves to the new check-in time.
- Changed or threw away: trusting the payload's field names. The agents name
  the option differently each time, so the booking takes it from the proposal's
  cited evidence when the payload doesn't name it clearly.
- Evidence: `starter/lib/shift-watch/decide.ts`.

### 2026-10-24 · team + Claude · driver messages in (demo beat 1)

- Asked: the front door for drivers. Match a message to the driver's job,
  answer at once with a "you'll hear back by" time, answer routine questions
  from the records, send safety straight to the shift lead, and wake the agent.
- Checked: end to end on six messages. The CD-420603 queue message gets a
  15-minute promise, and the 603 card's deadline becomes that promise. A booking
  question is answered from the trip's legs; an expense question lists the
  driver's claims ("approved" is shown as not paid yet). The CD-420322 warning
  light is a safety message: told to keep the car stopped, and flagged safety in
  the queue. An unknown driver gets "a person will get back to you". After the
  603 approval, the booking message counts as the answer to the driver.
- Found in the data: 7 drivers have two or more open jobs, so "which car?"
  comes up more often than the plan assumed. The driver's pick files their
  earlier message under that job; the first version lost that message.
- Changed or threw away: listing superseded expense claims next to their
  replacements (the same EUR 33.19 showed twice). The rule-based reader is the
  default; Claude reads and translates only in live mode.
- Evidence: `starter/lib/shift-watch/intake.ts`, `starter/lib/shift-watch/read.ts`,
  `starter/app/api/driver/`.

### 2026-10-24 · team + Claude · acting on a teammate's code review

- Asked: a teammate reviewed Backend 1 and 2 at `3feb634` against the plan and
  found six gaps. Claude checked every claim in the code before fixing
  anything.
- Checked: five gaps held as written. The sixth held in part: we did book
  before releasing the old crossing, but ignored the agent's own "check the
  08:43 carrier request first". The double booking in the scripted demo was
  real: the driver's second line woke the agent after approval, and the replay
  proposed the same crossing again. Our own held-out set of reworded
  mistakes, written before the first run, gave the rules alone 0 of 10. (The
  set was committed together with the check, in 5acfaf4, so git can't show
  the order.)
- Changed: one demo reset (our tables, mock bookings, clock); each recording
  plays once per reset; bookings keyed by order and sailing; the carrier's open
  change request checked, then withdrawn with the old booking. A fresh check
  closes Bahn's approved-but-not-run refresh. In live mode Claude reads each
  proposal's text: 10 of 10 reworded mistakes caught, 5 of 5 clean proposals
  passed, and Bahn's 14 still match, from one run. Added the operator chat
  (read tools plus two draft-only buttons, tested live, including "approve it
  yourself", which it refused), `npm run record` and fresh-clone steps, tested
  from a new clone with no key.
- Threw away: the demo driver's second line; the safety reply's "keep the car
  stopped", an instruction our own rules send to a person. One assumption was
  wrong: chat text arriving in one burst looked like Next buffering it, but
  timing the SDK alone showed the API sends the text after a tool round in
  one piece.
- Evidence: `starter/fixtures/reworded-mistakes.json`, `npm run
  eval:reworded`, `starter/lib/shift-watch/chat.ts`,
  `starter/lib/shift-watch/decide.ts`.

### 2026-10-24 · team + Claude · stress tests, undo, and Sonnet against Opus

- Asked: more test runs to find issues; then undo; then two things for the
  control-room criterion: why the agent stopped, and what happens if nobody
  decides. Then compare Sonnet 5.5 and Opus 5.5, with each change in its own
  commit so either model can be kept.
- Checked: parallel messages and approvals, all four recorded cases, every
  decision path, odd input, a reset mid-run and 2,000 extra messages, then
  live runs. Live tests included an order with no recording, German and
  Finnish drivers, and a driver message posing as the ops manager and asking
  for restart advice.
- Found and fixed:
  - A run read FINISHED before Shift Watch had checked its proposal.
  - A reset mid-run left stray steps.
  - An edit dropped the rest of the payload.
  - A rejection left the order "waiting on nothing".
  - Held driver messages never reached a person.
  - Repeat messages each got a new promise.
  - A safety promise ("a person will contact you") counted as kept by the
    agent's own reply.
  - Live only: Claude read the demo's own line, "Still in the queue.
    Navigation now says 12:20 at check-in", as a booking question, so the
    agent was never woken. The rule-based reader in replay got it right.
    Describing each intent fixed it: 10 of 10 test messages on both models.
- The injection held: the agent refused, Shift Watch held its instruction
  for a person, and the chat flagged the note as unverified.
- Added: a 10-second undo window on decisions and released messages. Until it
  passes nothing reaches the driver or a carrier, and a restart can't strand
  a decision. Cards also keep their place for five minutes after a decision,
  showing the outcome. Every card now says why the agent stopped and what
  happens if nobody decides. A missed deadline really does move our own cards
  to the shift lead; Bahn's old loose ends keep their owner.
- Sonnet against Opus, same five live cases from a fresh reset, one run each:
  - Driver-message reading, proposal text and the chat: equal accuracy, with
    Sonnet about twice as fast. Shift Watch stays on Sonnet, with its own
    setting (`SHIFT_WATCH_MODEL`).
  - The order agent: Opus took 24–37 s against Sonnet's 8–22 s. It also
    asked whether the driver's "12:20" is local time or UTC, which our
    scripted demo line leaves open. A driver in Germany would read local
    time, and 12:20 local makes the 12:00 UTC cutoff. Neither the plan nor
    Sonnet noticed.
  - The switch to Opus for the agent is a separate branch (`opus-agent`), so
    the team can keep either model.
- Evidence: `starter/lib/shift-watch/queue.ts`, `starter/lib/shift-watch/decide.ts`,
  `starter/lib/shift-watch/intake.ts`.

### 2026-10-24 · team + Claude · local time, the old booking, and keeping Sonnet

- Decided (team): keep Sonnet 5.5 for the agent; `opus-agent` stays unmerged.
  Times should be local to the country the driver is in. The fallback booking
  was Claude's call, which the team left open.
- Changed:
  - Drivers get every time in their local time ("by 11:15 Hamburg time").
    The agent gets the zone with each driver message, and its prompt says to
    convert before comparing. Operators stay in UTC.
  - The demo line now reads the way a driver at the Hamburg terminal would
    write it: "14:20 at check-in", which is 12:20 UTC. Re-recorded live; the
    agent read it as "14:20 Hamburg (12:20 UTC)".
  - Approving a new crossing no longer releases the old one at once. It is
    kept until its own check-in closes, since the driver might still make
    it, and then it counts as released.
- Checked: the replay of the new recording failed at first. The recording
  cited the driver's message by an id that is random per run, so the
  evidence check refused it. That is the check working, but it would break
  any recording that cites a driver message. Replay now maps such an id to
  the order's latest driver message (marked as a shortcut in the code).
- Evidence: `starter/lib/shift-watch/zone.ts`, `starter/recordings/ord-00603.DRIVER_MESSAGE.json`.

### 2026-10-24 · team + Claude · second review: as a driver, as an operator

- Asked: read the whole repo the way a driver and an operator would, against
  the brief and our talk with the challenge partner. Check the data again,
  and test whether the method holds up outside our own test set.
- Decided (team): look first, change nothing until we'd seen the whole list.
  The screens are left out of this pass; our frontend teammate owns them.
- Checked:
  - Data: Bahn's checker passes (100 orders, 4,366 records), all 58
    attachment hashes match, and the database row counts match the manifest.
    An old clone of Bahn's repo on one laptop had 11 PDFs broken by Windows
    line endings. Ours is protected by `.gitattributes`.
  - The mock ferry times for CD-420603 agree with the dataset: the 22:00
    sailing keeps the 23 Oct promise and the 08:00 one misses it.
  - We didn't count our 14 of 14 on Bahn's proposals: the rules were written
    from those same 14. On held-out mistakes the rules alone caught 0 of 10;
    with Claude reading, 15 of 15.
  - We wrote 14 driver messages of our own (a missed ferry, a flat tyre on
    the hard shoulder, a seller refusing the keys, warning lights in Finnish
    and German). Claude's reading in live mode: 14 of 14. The replay rules:
    about 3 of 14.
- Found, worst first:
  1. The queue at demo start missed 3 of the starter's "danger" orders.
     They include CD-420593, where the driver's wait ran out at 08:27.
  2. Without a key, a driver writing "I missed the ferry I was booked on"
     got a list of bookings back, and nobody was told.
  3. The agent's messages to drivers were checked against a word list only,
     even in live mode. It missed 6 of 7 ways of saying "keep driving".
  4. The freshness check and the code that books on approval used different
     ideas of "a booking": `travel.change_crossing` could book from a stale
     list, and approving `travel.cancel_booking` tried to book a ferry.
  5. The mock fare for CD-420603 was €45; the dataset's own quote is €387.
  6. Nothing woke an agent on its own: `next_check_at` was stored and never
     acted on.
- Evidence: `npm run eval:reworded -- --claude`; the driver-message set is in
  the step entries below.

### 2026-10-24 · team + Claude · fix 1: the queue shows every urgent order

- Why: an owned alert was treated as handled, so it never reached the queue.
  And the queue only knew our own chat, so a driver's wait limit in Bahn's
  messages was invisible.
- Changed:
  - A high or critical alert stays in front of its owner until it is
    resolved. Acknowledged is not resolved.
  - When a driver says how long they can wait, and nobody has answered them
    in that thread since, the end of that wait becomes a card with that
    deadline.
- Checked: at 09:00, before any agent runs, the queue went from 23 to 26
  orders, adding exactly the three danger orders (CD-420593, CD-420299,
  CD-420702). (The 25 in an earlier entry was counted after four agent runs,
  a different state.) CD-420593 shows "Driver's wait ran out at 08:27". We
  first wrote that it sits right after the safety card. A judge found it
  fifth: our printout had been filtered to the orders we were looking at. The 20
  orders the starter flags and we still leave out are a missing position on
  two moving cars plus open threads with nothing due. 74 orders stay quiet.
- Evidence: `starter/lib/shift-watch/queue.ts`.

### 2026-10-24 · team + Claude · fix 2: keyword reading never closes a driver's message

- Why: without a key, or when Claude's call fails, the driver's message is
  read by keywords. "Booked" made "I missed the ferry I was booked on" a
  booking question, which got a list of bookings back and closed the
  conversation. And a flat tyre on the hard shoulder wasn't safety.
- Decided (team): when the keywords read the message, the driver still gets
  the answer from the records, plus a time we'll come back by, and the agent
  wakes. The keywords lean towards safety: a false alarm costs a person a
  minute, while a miss leaves a driver on the hard shoulder.
- Changed: added safety words in English, Finnish and German. "Accident" now
  matches as a whole word, so "accidentally" no longer counts. A failed
  Claude reading now falls back as a reading done by keywords.
- Checked: all 9 safety messages from our set now read as safety, and
  "accidentally" and the demo line stay ordinary. On a running server in
  replay mode, the missed-ferry message got the bookings, "we'll get back to
  you by 11:15 Hamburg time", a woken agent and a queue card.
- Known limit: in replay, any driver message on CD-420603 plays the demo's
  recording, whatever the driver wrote.
- Evidence: `starter/lib/shift-watch/intake.ts`, `starter/lib/shift-watch/read.ts`,
  `npm run check:agent`.

### 2026-10-24 · team + Claude · fix 3: Claude reads the agent's messages to drivers

- Why: questions and acknowledgements go to the driver without a person, and
  they were checked only against a word list. That is the channel where
  Bahn's real "try restarting the vehicle" mistake would reach a driver.
- Decided (team): treat the agent's driver messages like its proposals.
  Claude reads them in live mode, and its reading can only add a hold, never
  remove one. Hold a message that advises driving, blames the driver, or
  calls something booked or boarded. If the reading fails, the word list
  still runs.
- Checked: before the first run we wrote a held-out set of 15 messages
  (`fixtures/driver-messages.json`, committed with the check in c0bad1d): 8 that must be held, and 7 that must
  go out, two of them the agent's own words from live runs. Word list alone:
  7 of 15, holding none of the 8 bad ones. With Claude: 15 of 15, and both
  real messages still go out. One run each.
- Evidence: `starter/lib/shift-watch/review.ts`, `starter/lib/shift-watch/checks.ts`
  (`driverMessageOk`), `npm run eval:reworded -- --claude`.

### 2026-10-24 · team + Claude · fix 4: one definition of "this books something"

- Why: the agent names its own commands. The freshness check knew "book" and
  "rebook", while the code that books on approval matched "book" or
  "crossing" anywhere in the name. So `travel.change_crossing` built on a
  three-hour-old list passed the check, then booked on approval. Approving
  `travel.cancel_booking` tried to book a ferry instead.
- Changed: both now use the same function. Moving a booking to another
  crossing or sailing counts as booking. A cancellation is no longer treated
  as one: it is recorded for the travel desk to carry out.
- Checked: the five ways of naming a rebooking are all sent back on a stale
  list, cancellation, refresh and verify commands don't count as bookings,
  and Bahn's 14 proposals still match.
- Evidence: `starter/lib/shift-watch/checks.ts` (`booksOrBuys`),
  `starter/lib/shift-watch/decide.ts`, `npm run check:agent`.

### 2026-10-24 · team + Claude · fix 5: a fare Bahn's people would believe

- Why: our mock 22:00 crossing for CD-420603 cost €45. The dataset's own
  quote for the same carrier and route is €387. A Bahn operator watching the
  demo would stop at that number.
- Changed: both mock sailings now cost €390, and so does the frontend's
  sample data. The demo's recording quoted the old fare, so we re-recorded
  that one run live rather than edit a recorded run by hand.
- Checked: we read the new run before keeping it. It made the same call: the
  same evidence, the 22:00 crossing, the 08:00 one ruled out as too late,
  keep the old booking, don't tell the driver to leave the queue. Shift Watch
  passed it in live mode. Then we played the whole demo in replay from a
  reset: driver line, proposal in the queue, approve with Bahn paying. It
  booked the 22:00 crossing (mock), kept WBV-FERRY-00603 as a fallback until
  12:00 UTC, and told the driver in Hamburg time.
- Evidence: `starter/lib/mocks/index.ts`, `starter/recordings/ord-00603.DRIVER_MESSAGE.json`,
  `starter/fixtures/order-agent.ts`.

### 2026-10-24 · team + Claude · fix 6: agents wake themselves

- Why: the challenge partner described each order's agent sending an email,
  sleeping, and scheduling itself to wake up. Ours recorded a
  `next_check_at` on every run and never acted on it, so an agent only woke
  when a driver wrote or someone pressed a button.
- Decided (team): once a minute, the server wakes each agent whose own next
  check has come due, once per check. Live mode only: replay has no
  recordings for these wake-ups, and a failed run would only add noise to
  the cards. If the wake-up never happens, the queue still shows "Agent's
  next check is overdue", so a person sees it either way.
- Checked: live, from a reset, we planted a check due at 08:59 on
  CD-420603. The agent woke once at 09:00 (the demo clock), read the order,
  refreshed the ferry list and proposed the 22:00 crossing. Shift Watch
  passed it. It set its next check to 11:00 and was not woken again in
  between. Its reasoning was off in one place: it checked the driver's rest
  against the old 12:00 cutoff. The proposal card shows that to the person
  deciding.
- Evidence: `starter/lib/agents/order-agent.ts` (`wakeDue`),
  `starter/instrumentation.ts`, `starter/lib/agents/README.md`.

### 2026-10-24 · team + Claude · the screens on the real backend

- Asked: put the frontend (built on sample data) and the backend together, so
  the screens run on the real queue, case view, decisions and chat.
- Checked: ran Postgres locally and played all four recordings through the API
  before touching a screen; the screens' sample shapes didn't match the
  backend's (queue kinds, "who pays" values, check reasons, travel states), so
  an adapter reads the backend's own builders instead of copying the data.
  Then the CD-420603 demo end to end in the browser: driver writes in, Shift
  Watch's 11:15 Hamburg-time promise, the agent's proposal, "pick who pays"
  enforced, approve, 10-second undo, the mock booking and the driver told.
  Signed in as the travel desk, the safety card says only the shift lead
  decides. Typecheck, build, `check:agent` and `eval:proposals` (14 of 14)
  all pass. Not tested: the live chat, which needs a key.
- Changed or threw away: the sample fixtures and the scripted chat answers;
  decisions kept in the browser (they now go to the decision route, with its
  undo); the animated "On it" steps, which showed steps as done before they
  ran (the card now shows the backend's own result and what happens next).
  Bahn's lane board moved to `/orders` and its mailbox to `/mail`, each with
  its own stylesheet, because both apps define the same colour names
  differently. Added a Demo menu so the pitch runs without a terminal.
- Evidence: `starter/lib/ui/adapt.ts`, `starter/lib/ui/data.ts`,
  `starter/components/case/decision-card.tsx`, `starter/components/demo-menu.tsx`.

### 2026-10-24 · team + Claude · stress-testing the screens

- Asked: stress test every feature the screens use before anything is
  pushed, and never change a backend file to make a test pass.
- Checked: three scripts against the real routes, with every screen loaded
  after each step. Decisions: 12 clicks at once give one 200 and eleven 409s;
  the wrong desk gets 403; no payer gets 400; undo by the reviewer works and
  is refused once the decision has taken effect. Messages: held messages sent,
  edited, undone and dropped; "which car?" for a driver with three jobs;
  script tags in a message shown as text. Load: 60 page loads at once, then
  every order in the queue with 3,000 extra messages. 73 of 74 passed; the
  one miss was our test's own wrong guess (that driver has no expense claims).
  All 100 case pages load. Then by hand in the browser: reject, undo, edit,
  search, permissions, dark mode and phone width.
- Changed: the screen had no way to use the backend's 10-second undo on a
  released driver message, so the card now says "Sending · reaches the driver
  in 9s · Undo". A rejected card's "It goes back once the undo window closes"
  didn't say where it goes; it now says nothing was booked or sent. "What
  happens next" no longer shows future steps with done ticks.
- Not in the repo: the three scripts ran from a scratch folder.
- Evidence: `starter/components/case/held-message.tsx`, commit 8f3365a.

### 2026-10-25 · team + Claude · a before-and-after recap

- Asked: one file that says what the system was at the start and what it is
  now, with and without Shift Watch, and how each mistake in Bahn's records
  is now caught.
- Checked: every claim against a record or a run. We replayed the three
  other recordings from a reset, and the recap matches them: CD-420299
  passes because the agent checked the timed-out booking first, CD-420322 is
  the top card for the shift lead, and CD-420593's agent only asks the
  driver. The first draft said that agent also asked the site; the
  recording shows it didn't, so we took it out. The recap also lists what it
  doesn't solve yet.
- Evidence: `SHIFT-WATCH-RECAP.md`.

### 2026-10-25 · team + Claude · the agent remembers what people decided

- Why: in our conversations with Bahn, the partner described how their agents
  remember: one thread per order, plus a notes file that a new run reads to
  see what happened. Our
  notes already work that way, and each wake-up is a short fresh run, so
  context never compacts. But when the agent woke again, it saw its earlier
  proposals only by status ("EXECUTED"). It didn't see the person's note,
  who pays, or the booking reference. Our mock booking isn't in the
  dataset's reservations, so nothing else told it what was booked. Since
  agents now wake themselves at the check-in cutoff, it could have proposed
  the same booking again.
- Changed: `get_order` now gives the agent, for each of its earlier
  proposals, what a person decided (decision, note, who pays, reviewer) and
  what ran (result, references, next steps, error).
- Checked: live, from a reset. The driver writes in, the agent proposes the
  22:00 crossing, the travel desk approves with Bahn paying, and it books
  MOCK-VCL-102122-2200. Then an operator asks the agent where the order
  stands. In 5 tool calls it answered with the reference, the arrival inside
  the promise, the old booking kept until 12:00 UTC, and boarding
  unconfirmed. It made no new proposal. Its notes now hold the reference,
  who pays and the 12:00 check. We did not run the same case without the
  change.
- Evidence: `starter/lib/agents/tools/index.ts` (`get_order`).

### 2026-10-25 · team + Claude · a safety reply that never waits on a model

- Why: in live mode, a driver's safety message got an English reply that
  Claude then translated. So the first thing a stopped driver read depended
  on a model call working, and on its wording.
- Decided (team): the first safety reply is fixed text that we wrote, in the
  languages Bahn's drivers write in: English, Finnish, Swedish, Danish,
  German and French. Other languages still fall back to a translation.
  Safety now counts if either reader says so: Claude in live mode, or the
  keywords run on Claude's English translation. The keywords can add safety,
  never remove it.
- Checked: `check:agent` asserts every line keeps the time and the place.
  Live, a Finnish and a German warning-light message each got their fixed
  line at once, and the second one kept the first one's 11:15 promise.
- Evidence: `starter/lib/shift-watch/read.ts` (`SAFETY_LINE`), `starter/lib/shift-watch/intake.ts`.

### 2026-10-25 · team + Claude · what Bahn told us, written down

- Why: our design choices came from conversations with Bahn: one agent per
  order with notes, driver chat handled only by people today, operators
  talking to one agent, the scaling question, and GPS as a small nudge. A
  judge couldn't see that link anywhere except scattered through this log.
- Changed: a table in `starter/README.md`, "What Bahn told us, and what we
  changed", one row per point.
- Evidence: `starter/README.md`.

### 2026-10-25 · team + Claude · a scored judging round, and what it found

- Asked: score the entry 1–5 on the brief's three criteria the way the real
  judges will, before they do. We set up three reviewers who hadn't seen our
  own assessment: a Bahn shift lead, Bahn's engineering lead, and the judge
  for "how you worked with AI". They read a frozen copy of `main` (d150e7d)
  and the text of every screen, captured while we played the demo from a
  reset. They couldn't see colours or layout, and said so.
- Scores, weighted out of 5: 3.3 (shift lead), 3.7 (engineering), 3.7 (AI
  process). The AI process got 4 from all three. Taste got 3 from all three.
- What all three found first: the CD-420322 safety card said "the driver
  says the red warning has gone off and asks to continue". The driver never
  said that. The recording was made from an older demo trigger, and we
  hadn't re-read it when the trigger changed. That broke our own rule that
  every fact has a source.
- Fixed:
  - CD-420322's driver now writes in through Shift Watch, so the message is
    on the timeline. We re-recorded the run live and read it before keeping
    it. The agent now sees the shift lead already owns the recovery decision
    and adds no proposal.
  - A booking proposal with no price is sent back, so nobody approves a
    booking without choosing who pays.
  - In live mode, an agent message to a driver that Claude couldn't read is
    held for a person, not sent on the word list alone.
  - A step that throws when it runs is marked failed and stays on the card.
    Before, it stayed "approved" and quietly dropped off the queue: Bahn's
    own "approved, never run".
  - After a restart, runs left as "running" are marked failed. Before, that
    order's agent could never wake again.
  - A driver who writes while their agent is still running now wakes it again
    when it finishes. Live test: "the queue started moving, now 13:50"
    arrived mid-run. The second run read it as 11:50 UTC, before the cutoff,
    and kept the rebooking as a fallback.
  - CD-420593 showed three deadlines on one card. The driver's own wait limit
    (08:27) is now its decide-by time everywhere. Since that had already
    passed, the card goes straight to the shift lead and says why.
  - Self-wake starts at most 5 runs a minute, marked as a shortcut.
  - Docs: the placeholder evidence link, an evidence list that named a load
    test and screenshots we never made, "four errors" that listed five, a
    root README that was still Bahn's, and a superseded review report.
- Caught before committing: a live test ran on the server we used for
  recording, and it overwrote the demo's CD-420603 recording with the test's
  run. `git status` showed the change; we restored the recording and
  replayed the demo again.
- Passed to our frontend teammate: times from other days shown without a
  date, repeated names and times on timeline lines, headline counts that
  don't add up to the queue, "Passed Shift Watch's checks" in replay, where
  only the rules run.
- Not fixed, and why:
  - The queue reads every order on each request. That's fine for 100
    orders, but not for Bahn's 25,000 a year; that needs paging and an
    index, which is past our freeze.
  - The reviewer is chosen in the screen, not signed in.
  - Very overdue paperwork still sorts above a driver in a ferry queue.
    That's a judgement call we'll ask Bahn about.
- Evidence: the commit that closes this entry, `starter/evals/`.

### 2026-10-25 · team + Claude · languages: read the gaps, route to the team that reads it

- Asked (team): we read Finnish, and machine translation of Finnish is often
  wrong. Can messages go to the country team that reads the language, and
  what about cross-border orders, where the driver, the seller and the
  dealer each read something different?
- Checked our assumption first, and it was wrong in an instructive way:
  - 12 time phrases that translate badly word for word ("puoli kolme",
    "halb drei", "halv tre" all mean 14:30): Claude read 12 of 12 right. We
    threw away the keyword guard for "half N" we were about to build.
  - 8 messages in spoken Finnish, German and Danish: 7 fully right. The miss
    was "Ehdin kyl, oon checkinis varttii vaille": the English said "at
    quarter to", correctly, but the reading still filled in **14:45**, an
    hour the driver never gave. The risk isn't the words. It's the machine
    filling gaps.
- Decided (team), from that:
  - The reading lists what a message leaves out ("no hour given") and never
    fills it in. The agent gets the driver's own words beside the English,
    and is told to ask rather than assume.
  - Bahn's people work in Finland, Denmark and Germany. A card where someone
    wrote in another language names the team that reads it (Swedish goes to
    Finland). That team's view (`GET /api/queue?team=FI`) puts those cards
    first, after safety. French has no team, and the card says so.
  - Anything machine-translated to a driver goes out in their language with
    the English underneath, so a bad translation can be caught. The fixed
    safety lines are written by people and go out on their own.
  - Each case lists the driver, pickup, delivery and customer with the
    language each most likely reads and where that comes from, and flags a
    cross-border order. The agent sees the same in `get_order`.
- Checked:
  - Live: "Ehdin kyl, oon checkinis varttii vaille" came back as "unclear:
    no hour given". The driver got the Finnish reply with the English under
    it, and the agent asked which time they meant instead of assuming. For
    the Finland team, the card was first after safety.
  - Bug found in that test: the agent wrote its question in two languages
    itself, and Shift Watch translated it again. The driver got Finnish,
    Finnish and English. Now the agent writes driver messages in English
    only, and an already-bilingual message isn't translated twice.
  - Held-out set (`fixtures/driver-languages.json`): 12 colloquial messages
    in six languages, committed before the first run (05fa07a). The first
    run passed 12 of 12 but flagged gaps on almost every message, which
    would be noise on the cards. The set couldn't see that, so we added
    three clear messages before the second run (310fb20). Then we limited
    the reading to at most two gaps that would change what a person does.
    Result: 15 of 15, and the clear messages flag nothing.
  - The driver-message classification set still scores 14 of 14 with the
    new reading. The replay demo still plays from a reset.
- Not done: the screens don't show the language yet. The fields are in the
  API for our frontend teammate (`QueueItem.language`,
  `CaseResponse.languages`, `DriverMessage.unclear`). At demo start no card
  needs another language: the dataset's non-English threads are either
  answered or not in the queue.
- Evidence: `starter/lib/shift-watch/language.ts`, `read.ts` (`readByClaude`),
  `translate.ts`, `queue.ts`, `starter/evals/reworded-claude.txt`.

### 2026-10-25 · team + Claude · a second judging round

- Asked: score again after the language work, with three new reviewers who
  weren't told the first round's scores: the same three angles, a frozen
  copy of `backend-1` (dbeaa62), the screens' text from a replay of the
  demo, and a live run where the CD-420603 driver writes casual Finnish.
- Scores, weighted out of 5: 3.0 (shift lead), 3.7 (engineering), 3.7 (AI
  process). Round 1 gave 3.3, 3.7 and 3.7. With different reviewers that
  isn't a trend. Taste is again the low score (2 and 3), and most of it is
  the screens.
- The finding that hurt most: in the live Finnish run, the reading flagged
  "no hour given", but the agent then offered the driver a one-tap button
  "13:45 Hamburg time". That's the same filled gap we had just written
  about, moved into a button. Two of the three reviewers found it.
- Fixed:
  - A quick reply may offer only a time that's already in the records or
    the messages, enforced in `ask_driver`. Live retest: no time buttons;
    the agent asked which hour, quoting the driver's own Finnish words.
  - Quick-reply labels are translated with the message.
  - Booking messages to a driver go through translation too, and always
    carry dates. Before, a check-in on the evening of 21 Oct read as after a
    00:00 departure. Live, the Finnish driver got "lähtee 22.10. klo 00:00 …
    Lähtöselvitys sulkeutuu 21.10. klo 22:00", with the English under it.
  - A run that fails is still checked by Shift Watch, and on startup
    anything left unchecked is checked. Before, a proposal from a failed run
    sat unchecked and out of sight, and blocked that order's agent from
    proposing again.
  - A safety message from a driver with several jobs goes to the car that's
    on the road, if there's exactly one. Replay test: drv-055's warning
    light became the top safety card on CD-420576. Otherwise the driver gets
    the safety line and "which car?".
  - Only a successful tool result counts as read. Before, a refused proposal
    echoed the unseen ids back, so a plain retry could cite them. A quote's
    time comes only from the tool that returned it.
  - The chat's approve button says who pays.
  - An approved customer message is recorded as "approved for a person to
    send", not "sent".
  - An overdue loose end with a real deadline still ahead (CD-420603's 07:59
    approval, with the 12:00 check-in to come) now shows that deadline.
  - An escalated card names the shift lead as the one who decides.
  - Each card says whether a driver is waiting (`driver_waiting_until`).
  - The keys answer never closes the question. In one live run, "I lost the
    car keys at the rest stop" was read as a keys question, which would have
    sent the standing rule and told nobody.
  - Corrections to this log: CD-420593's place in the queue (fix 1 above),
    the 25 against 23→26 count, and the 45 against 46 record IDs.
  - The 14-message classification set we had only run from a scratch script
    is now a fixture with its output (`fixtures/driver-intents.json`): Claude
    13 of 14 this run (14 of 14 the first time), the keyword rules 10 of 14.
    The rules' score is fitted, since we widened their safety words from
    these messages, and the fixture says so.
- Passed to our frontend teammate: dates on times from other days; the
  repeated names and times on timeline lines; "Translated from Finnish" on
  our own outgoing messages; the "Driver waiting" count (now one field);
  showing the language and team on cards; a Finland-team view.
- Not fixed:
  - Who decided is a desk picked in the screen, not a signed-in person.
  - The queue rebuilds everything for every screen, every few seconds.
  - The replays come from recordings made before today's prompt changes,
    so in replay the agent is the older one; live mode runs the current one.
  - A driver whose wait has run out gets the agent's question without a new
    time to hear back by.
- How we commit: when a step is done and checked, often several at once. So
  git proves the order of tests and code only where we say it does (the
  language set, 05fa07a before dbeaa62).
- Evidence: the commit that closes this entry, `starter/evals/reworded-claude.txt`.

### 2026-10-25 · team + Claude · the screens after a teammate's review

- Asked: a teammate reviewed the screens against the backend and against
  the other teams' entries. Fix what the screens get wrong, without touching
  a backend file.
- Checked: each finding in the code before changing it. Two held only in
  part: the "counted twice" numbers were one rule in the overview and another
  in Shift Watch's summary, and the "due this hour" jump came from counting
  at the snapshot time before the browser had the demo clock.
- Changed:
  - Shift Watch follows the case on screen, including the first call on
    `/inbox`, where it used to say "the whole board".
  - The overview counts the way Shift Watch does, so calls plus quiet orders
    make 100, and it counts at the queue's own time until the clock syncs.
  - A row inside the undo window says "Undo 8s", not "Done".
  - The chat's approve button shows who pays before anyone presses it.
  - Timeline chips are wide enough for their order number; inbox titles wrap
    to two lines; the panel opens with Shift Watch's own three-line summary.
  - The dark Shift Watch panel looked out of place; it now uses the page's
    own surface in both themes.
- Threw away: building order references from the order id
  (`CD-42` + four digits). It matched all 100 orders, but it was a guess; the
  panel now reads them from the queue.
- Not done, the team's call: a driver-side page (after the 09:30 feature
  freeze); a path without Docker (it needs a change to `lib/db.ts`, a backend
  file).
- Evidence: commits a1e8b0a and dbe20a3.

### 2026-10-25 · team + Claude · languages and waiting drivers on the screens

- Asked: everything passed to the frontend in the two judging entries above.
- Checked: the backend moved twice while this was being built, so each time
  we merged it first, ran its own checks (14 of 14) and our 72 stress checks,
  and only then the screens. No card needs another language at demo start, so
  we tested the display with a German and a Finnish message written into the
  local database, then cleared them.
- Changed:
  - Cards and cases show the language, the country team that reads it, why,
    and what the message leaves unclear ("Not clear: how late is not said").
    A cross-border order lists who reads what.
  - A "Team view" in the inbox (Finland, Denmark, Germany).
  - "Driver waiting" counts `driver_waiting_until`. Before, the screen sorted
    rows by matching Shift Watch's sentences; the count now comes from a field.
  - Times from other days carry the date; one time per timeline line; no
    generic "operator" roles; our own messages say "Sent in Finnish".
- Didn't take the first answer: a "Finnish driver writes in" demo button
  looks simple, but without a key every message reads as English, and the
  fix would be in a backend file. The button works in live mode only and says
  so; the Demo menu now shows which mode is on.
- Evidence: commit 4ea52a3.

### 2026-10-25 · team + Claude · taking the AI look out of the design

- Asked: research the common tells of AI-made interfaces and audit our
  screens for them.
- Checked: practitioner write-ups and Anthropic's own frontend-design
  guidance, then the stylesheets: 43 pill shapes, 24px card corners, nine
  uppercase text styles, four pulsing "live" dots, coloured left-edge
  stripes on every timeline chip, "Ask me anything on the board" in giant
  type. Also what we avoided: no Inter, no purple gradients, no hero with
  three feature cards, no marketing words.
- Changed: headings in normal case; no left-edge stripes; pills only on main
  buttons, with 6-10px corners elsewhere and 14px cards; Shift Watch opens on
  its summary and first three calls; one live dot, by the clock. The shift
  timeline moved to the top of the overview.
- Kept: the cream background and pill buttons, which are Bahn's brand even
  though one source lists cream as a new tell. The motion stayed, our call.
- These tells are heuristics from blogs and community lists, not research,
  and several warn that swapping one default for another is new slop.
- Evidence: commits e9d5684 and 74866bb.

### 2026-10-25 · team + Claude · testing the demo by hand

- What we did: played the demo ourselves in the browser, in replay and in
  live mode, instead of only through the API.
- Found and changed:
  - "Wake three more agents" worked but left you on the same page, so
    nothing seemed to happen. It now opens the Inbox.
  - The three new plans looked scattered: each sorted by its own deadline
    among 20-odd older loose ends, and CD-420299's (23 Oct) landed under
    "Today". Plans an agent has ready now come right after safety and
    always sit under "Now". The list is in three labelled parts: Safety,
    Agent plans ready, To chase.
  - The Team view only reordered cards with a non-English message. At demo
    start there are none, so switching team visibly did nothing. We tried
    matching orders by country too, then removed the selector instead: the
    card's language tag already says which team reads it, and
    `?team=` stays in the API.
  - The timeline's info panel stayed open after the mouse left the chip.
- A reload loop in the browser turned out to be a tab still open from the
  old Bahn app on the same port. We moved the demo to port 3010 and checked
  in a clean browser: one page load in 20 seconds.
- Evidence: `starter/lib/shift-watch/queue.ts`, `starter/lib/ui/queue.ts`,
  `starter/components/workspace/workspace.tsx`, `starter/components/demo-menu.tsx`.

### 2026-10-25 · team + Claude · catch the no-show before the driver says it

- Why (team): a real case we know of. A driver accepted a job, went quiet,
  and wrote "can't do it" days after he should have been on his way. A
  better reading of that message is too late: nothing was checking on him.
- Checked against the data: CD-420702's second driver missed a 09:00–11:00
  yard slot. The records showed the slot open with the job not started from
  06:00 UTC. The first anyone said was the driver's message at 07:47 and the
  yard's at 08:11. At demo time, six orders have a booked driver for
  tomorrow who hasn't confirmed. Bahn's own CD-420449 already has a work
  item for exactly that.
- Built, with no model so it runs in replay too:
  - The day before a pickup, Shift Watch asks the booked driver to confirm,
    in local time, with "Yes, I'll be there" and "No, I can't do this job".
  - No answer within 3 hours puts a card on the dispatch desk: re-offer the
    job while there's a day left.
  - A slot that has opened with the job not started, and the driver not
    talking to us, puts a card on the dispatch desk at once.
  - "Yes" closes the question. "No" goes through the normal path to the
    agent and the paging.
- Checked: at 09:00, six asks went out (CD-420154, 399, 442, 449, 719, 992).
  The "Yes" got "you're confirmed" with no agent run. An ask backdated four
  hours produced the no-reply card on CD-420449. The drop-out message on
  CD-420442 woke the agent. Moving CD-420992's slot to 08:30 in the local
  database produced "Driver hasn't started", and we moved it back.
  CD-420593, whose driver is at the site and talking to us, stays out.
- Evidence: `starter/lib/shift-watch/confirm.ts`, `starter/lib/shift-watch/queue.ts`.

## Evidence in this repo

- `starter/recordings/`: every recorded live agent run, also used by replay mode.
- `starter/evals/proposals.txt`: Bahn's 14 recorded proposals through Shift Watch, next to what Bahn's
  people decided (`npm run eval:proposals`).
- `starter/evals/reworded-claude.txt`: the held-out mistakes and driver messages, rules alone and with
  Claude, one run (`npm run eval:reworded -- --claude`).
- `starter/fixtures/`: the expected results and held-out sets those evals read.
- `SHIFT-WATCH-RECAP.md`: the system before and after, and each of Bahn's recorded mistakes replayed.

Not in the repo: screenshots and a load test. Everything has been tested on Bahn's 100 orders only.

## Rules we keep

- Every claim points to a record ID or a file; without one it's unverified.
- Claude says what it didn't check, and we read those lines.
- Ideas are tested against the data before they become features.
- Guesses are marked as guesses, in docs and in the product.
