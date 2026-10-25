# Shift Watch Backend Report: Backend 1 and Backend 2

> **Superseded.** This is a snapshot from 24 Oct (at commit d5c5001), kept as a record of the review. Some of it has changed
> since: the operator chat is built, and an old ferry booking is now kept as a fallback until its check-in closes rather
> than released at once. For the current state, see `SHIFT-WATCH-RECAP.md` and `PROCESS.md`.

What Mike and Claude built for **Backend 1** (the order agent) and **Backend 2** (Shift Watch), the decisions made along the way, what testing turned up, and what is still open. Written for a review before the hand-in on Sun 25 Oct 15:00.

- **Date:** 24 Oct 2026
- **Repo:** itswinther/bahn-control-room
- **State:** main @ `d5c5001`
- **Model:** `claude-sonnet-5-5`

## How to review this

- **Most useful to push back on:** the decisions table and the questions at the end.
- **Every claim can be checked:** each one names a file or command. The longer story is in `PROCESS.md` at the repo root.
- **Scope:** frontend screens are not covered. They belong to another teammate.
- **Mode:** everything was tested in replay mode, and the four agent runs were also run live once on Sonnet 5.5.

## What exists now

One message from a driver now goes through the whole chain:

1. **Driver writes** (Backend 2): Shift Watch matches it to the job and answers at once with a hear-back time.
2. **Agent wakes** (Backend 1): one Claude run on that order. It reads records, checks ferry capacity and driver rest, and asks the driver or a site.
3. **One proposal** (Backend 1): it cites only records the agent read this run, and its approval level is set in code.
4. **Seven checks** (Backend 2): each proposal is passed to a person, sent back to the agent, or held.
5. **Queue** (Backend 2): safety first, then the earliest decide-by time. Quiet orders are only counted.
6. **Person decides** (Backend 2): approve, edit or reject. Only the right desk may decide.
7. **Carried out** (Backend 2): mock booking, the old booking is released, and the driver is told the new crossing.

| Piece | Where | Status |
|---|---|---|
| Shared contract and our 6 tables | `lib/contract.ts`, `lib/schema-ours.ts` | merged |
| Order agent loop and tools | `lib/agents/` | merged |
| Replay mode and 4 live recordings | `lib/agents/model.ts`, `recordings/` | merged |
| Demo clock and scripted demo driver | `lib/clock.ts`, `scripts/demo-driver.ts` | merged |
| Agent handover note | `lib/agents/README.md` | merged |
| Shift Watch's seven checks and the replay of Bahn's 14 proposals | `lib/shift-watch/checks.ts`, `scripts/eval-proposals.ts` | merged |
| Review after every run (proposals and driver messages) | `lib/shift-watch/review.ts` | merged |
| Decision queue and case view data | `lib/shift-watch/queue.ts`, `case.ts` | merged |
| Approve, edit, reject and carry out | `lib/shift-watch/decide.ts` | merged |
| Driver intake | `lib/shift-watch/intake.ts`, `read.ts` | merged |
| Operator chat | planned: `POST /api/shift-watch/chat` | **not built** |
| `npm run record` and fresh-clone steps in the README | | **not built** |
| Claude-written shift summary, site lessons, customer update drafts | | optional |

## Backend 1: the order agent

One Claude run per wake-up, on one order. It does the cheap work first (read records, check ferry capacity and driver rest, ask the driver or a site), then either finishes or hands Shift Watch exactly one proposal. Wake-up reasons are a driver message, a loose end or a send-back.

### Rules enforced in code, not only in the prompt

- **Approval level and owning desk** come from the command (`rules.ts: route`), never from the agent.
- **Evidence must be real.** A proposal may cite only records the agent read in that run. The evidence table comes from the record id's prefix, and the time comes from the tool that returned it.
- **Limits:** one proposal per run, one open proposal per order, and one running run per order (a database index). At most 12 tool calls, and every run ends with `finish`.
- **Messages to drivers** may be questions or acknowledgements only. They wait as `PENDING_CHECK` until Shift Watch releases them. An acknowledgement that repeats a person's instruction must cite that person's message.
- **`ask_site`** refuses sites owned by the order's paying customer.
- **Default mode is replay.** Recorded model answers go back through the real loop, so tools and database writes run for real, and no API key is needed for the demo.

The four recorded live runs:

- CD-420603: driver in the ferry queue
- CD-420299: a timed-out booking
- CD-420322: a warning light
- CD-420593: a driver waiting past their limit

## Backend 2: Shift Watch

Shift Watch reviews what the agent produces, decides what reaches a person and in what order, carries out decisions, and is the driver's front door. Each check comes from a correction Bahn's own people made to their agents.

| Check | Comes from | On failure |
|---|---|---|
| `fresh_data` | CD-420194: rebooked from an unrefreshed ferry list. Applies only to booking or buying; missing capacity evidence counts as stale; 30 minutes. | send back |
| `quote_not_booking` | CD-420020: "keep boarding unconfirmed". Booked or boarded needs a reservation or gate record. | send back |
| `no_blame` | CD-420055: photos show a condition, not who caused it. | hold |
| `no_driving_advice` | CD-420322: "remove restart advice". | send back |
| `no_blind_retry` | CD-420299: a booking timed out with no reference. No retry until its outcome is checked. | hold |
| `contact_rules` | The brief: the agent never contacts a customer. | hold, or send back if bundled |
| `one_step_per_approval` | Lookups bundled with a customer step wait for nothing. Split them. | send back |

- **Review after each run.** A pass goes to the queue for a person. A send-back wakes the agent again. After 2 send-backs on one order, the next failure is held for a person.
- **Queue.** Safety comes first, then the earliest decide-by time. An order's loose ends join its proposal card, so there is one card per order. A promise made to a driver becomes the card's deadline. The shift summary is rule-based, so it works without the model.
- **Case view.** This is the order's record view plus proposals, runs, steps, the driver thread and travel legs (booked, quoted, requested, not booked).
- **Decisions.** A `SHIFT_LEAD` proposal can only be decided by the shift lead. A `DESK` proposal can be decided by the owning desk or the shift lead. Anything with a cost needs "who pays" before it can be approved. A double click can't decide twice.
- **Carrying out a booking.** It books against a fresh capacity check, keyed by the proposal, so a retry can't book twice. The old booking is released only after the new one is confirmed. The driver gets the crossing, the check-in cutoff and the reference, and the agent's next check moves to the cutoff.
- **Driver intake.** The message is matched to the driver's open job, or the driver is asked "which car?". Booking, expense and keys questions are answered straight from the records. Safety messages get "keep the car stopped, a person is taking over". Anything else gets "you'll hear from us by HH:MM" and wakes the agent.

## Decisions

What the "By" column means:

- **Mike:** Claude laid out options with a recommendation and Mike chose.
- **Claude:** a design call made while building, reported in `PROCESS.md`.

| # | Decision | Why | By |
|---|---|---|---|
| 01 | Use the plan's vocabulary: SPLIT becomes SEND_BACK with a split reason, and AUTO_RUN becomes PASS with approval NONE | One set of words across frontend, backend and pitch | Mike |
| 02 | Draft every contract shape up front, adding Review, Execution (with "what happens next"), TravelLeg and Cost.note, which the plan lacked | The frontend can build against fixtures from hour one | Mike |
| 03 | Run on Sonnet 5.5. The API key lives only in the git-ignored `starter/.env` and is never committed | The key expires in 24 h; the repo stays clean | Mike |
| 04 | Shift Watch owns the 30-minute freshness rule; the agent isn't told it | Reading the cached list first is then the agent's honest cheap move, not a staged one | Mike |
| 05 | `ask_site` may contact other customers' sites, but never the paying customer's own | Sites answer hours, keys and access; customer contact stays with people | Mike |
| 06 | Hand-written tool loop instead of the SDK's tool runner | Every call is saved as a step and the 12-call cap is enforced in code | Claude |
| 07 | Replay records the model's answers, not its steps, and is the default mode | The demo runs without a key, and replays still exercise the real tools and database | Claude |
| 08 | Evidence table comes from the id prefix; evidence time comes from the tool that returned the record | Live runs invented table names that the freshness check couldn't read | Claude |
| 09 | The agent's messages to drivers wait for Shift Watch's check | Two live messages carried instructions the agent may not give | Mike |
| 10 | An acknowledgement may repeat a person's instruction if it cites that message | CD-420322's "keep it stopped" repeats the support desk's 08:13 message | Mike |
| 11 | Progress notes on, so each step can show why | The case view can show the agent's reasoning | Mike |
| 12 | The demo's "caught" moment uses Bahn's real CD-420194 mistake, not a staged careless agent | The live CD-420603 agent refreshed capacity on its own | Mike |
| 13 | CD-420299's "verify booking outcome" is flagged for bundling a customer step, so the pitch says "3 more" | Consistent with CD-420593 and CD-420399, which bundle the same way | Mike |
| 14 | When the first eval run was 13 of 14, the expected file was corrected for CD-420299 (labelled `changed_after_first_run`), not the checks | The expected file contradicted itself; the checks were right | Claude, shown to Mike |
| 15 | One set of pure checks for both our proposals and Bahn's 14 recorded ones | The eval tests the same code the product runs | Claude |
| 16 | At most 2 send-backs per order, then hold for a person. This is not in the plan | Agent and Shift Watch can't bounce forever | Claude |
| 17 | One queue card per order. Sort by decide-by times only, and the agent must give a decision deadline or say why there is none | Sorting by an old loose end's time sank a waiting driver (CD-420593) | Claude |
| 18 | Rule-based shift summary; a Claude-written one is optional | Works without a key | Claude |
| 19 | When the payload doesn't clearly name the ferry option, the booking takes it from the proposal's cited evidence | Each live run named the option differently | Claude |
| 20 | A new crossing releases the order's current ferry booking, after the new one is confirmed | The first test still showed the old 14:00 booking as booked | Claude |
| 21 | Intake promises an answer within 15 minutes, or sooner if the driver states a shorter limit | The demo target; the data's median reply time is 12 minutes | Claude |
| 22 | Routine booking, expense and keys questions are answered from the records and don't wake the agent. "Approved" expenses are shown as "not paid yet" | Cheap, instant, and never claims a payment that isn't recorded | Claude |
| 23 | The rule-based reader is the default; Claude reads and translates driver messages only in live mode | The demo works with no key | Claude |
| 24 | Build order for Backend 2: queue and case, then approve, then driver intake. Merge to main after each piece | Each piece unblocks a frontend screen | Mike |
| 25 | Built the scripted demo driver (with `--direct`) and the handover note | The video can be reproduced; Backend 2 knew what to consume | Mike |

## What testing caught

Each of these was found by a test or a read of real output, and fixed before merge.

| Problem | Found by | Fix |
|---|---|---|
| Two parallel requests could both start a run on one order | Subagent test | Partial unique index; 4 parallel requests now give one 202 and three 409s |
| A numeric order id passed validation and reached a file path | Subagent test | Regex check plus an existence check, 404 otherwise |
| Timestamps weren't ISO as the contract says | Subagent test | Custom timestamp type on our tables |
| A second run could open a second proposal on the same order | Subagent test | `propose` refuses while one is open |
| The 12-call cap could loop forever; two runs could start at once | Claude reviewing its own loop | One warned round past the cap, then stop |
| The agent invented evidence table names | Live runs | Table taken from the id prefix |
| The rest mock counted from now: "72 h of rest" before the driver had even collected the car | Live runs | The tool takes when the driver reaches the terminal |
| Driver messages carried instructions | Live runs | Messages wait for Shift Watch; repeats must cite |
| The driving-advice backstop missed "restarting", Bahn's own recorded mistake | New assert | Pattern fixed in `rules.ts` |
| The demo driver stamped messages with the computer's clock (24 Oct), so the agent never saw them | Claude, before the first run | Clock route; demo clock everywhere |
| A driver past their limit sank in the queue; then "overdue since" got mixed up with "decide by" | Reading queue output | Decide-by only, and a required deadline |
| The case view missed CD-420603's 08:43 change request (the starter reads a different field) | Reading case output | Read the raw reservation record |
| The old 14:00 booking was still listed as booked after a rebooking | Decision test | Release the current ferry booking by default |
| The driver's "which car?" pick lost their earlier message | Review of intake | The pick files the earlier message under the chosen job |
| The expense answer listed a superseded claim next to its replacement (EUR 33.19 twice) | Intake test | Superseded claims hidden |

### Results at `d5c5001`

- **Bahn's 14 recorded proposals:** all 14 match the expected outcome (`npm run eval:proposals`).
  - 4 of Bahn's corrections are caught before running.
  - The failed booking can't be caught in advance.
  - 3 pending proposals get split.
- **Queue:** 25 orders, against 43 flagged on the starter's board. 75 orders are counted as quiet. It takes about 340 ms.
- **Driver intake:** all 6 paths behaved as intended end to end.
- **Decision route:** each error case tested.
  - 403 for the wrong desk
  - 400 for a cost with no payer
  - 409 for deciding twice
  - one 200 and one 409 for two clicks at once
- **Checks and typecheck:** `npm run check:agent` passes and the typecheck is clean.

## Known limits and open items

- **Replays** are valid only from the snapshot state. Truncate our six tables before a demo run.
- **Mock data** covers ferry and site answers for CD-420603, 420299 and 420593. Other orders get "no data". The mock booking store is in memory and resets when the server restarts (marked with a `shortcut:` comment).
- **Reject with a note** doesn't wake the agent yet. The planned operator chat would cover this.
- **Progress notes** are sparse, about one per run.
- **Not tested:** Claude reading and translating driver messages in live mode. The test ran in replay mode with the rule-based reader.
- **7 drivers have two or more open jobs** (for example drv-055 with three), so "which car?" will come up more often than the plan assumed.
- **Stale handover note:** `lib/agents/README.md` still says `--direct` stands in until the driver route exists. It exists now.
- **Database push:** `drizzle-kit push --force` was used once; it only added the run-lock index.

## Questions for the reviewer

1. After we book CD-420603's new crossing, Bahn's own recorded "Refresh vehicle-space" proposal stays in the queue as "approved at 07:59 but not carried out". Should our booking clear it, or is it right to keep showing it?
2. In the intake test, the CD-420603 card was 9th in the queue. Its deadline is the 09:15 promise, and the 8 cards above it have earlier decide-by times. Is that right for the demo, or should the frontend highlight the order being shown?
3. Is 15 minutes the right default hear-back promise to drivers?
4. Some checks match words in the proposal's summary (for example "tell the customer"). Is that too brittle, or fine for Bahn's data?
5. Do you agree that changing the CD-420299 entry in the expected file was a correction, not tuning to pass?
6. Is "2 send-backs, then hold" the right limit?

## For the frontend

| Route | Does |
|---|---|
| `GET /api/queue` | Three-line summary, cards (safety first), quiet count |
| `GET /api/cases/:orderId` | Record view, proposals, status, runs and steps, driver thread, travel legs |
| `POST /api/proposals/:id/decision` | `{ decision, reviewer, who_pays?, note?, final_payload? }` → proposal with review and execution |
| `POST /api/driver/messages` | `{ driver_id, text, quick_reply_value?, simulated? }` → stored message, instant reply, agent run id |
| `GET /api/driver/:driverId/messages` | The driver's thread; messages waiting for a check are hidden |
| `POST /api/agents/run`, `GET /api/runs/:runId` | Wake an agent (202, 404, 409); follow its run and steps |
| `GET /api/clock`, `POST /api/clock` | Demo time (starts 21 Oct 09:00 UTC); POST resets it |

Shapes are in `lib/contract.ts`. Show anything marked `mock: true` as made up.

## Check it yourself

After the starter's own setup (Docker Postgres on port 5438, seed), from `starter/`:

```sh
npm run check:agent        # code-enforced rules, mocks, the rule-based reader
npm run eval:proposals     # Bahn's 14 proposals through Shift Watch: expect 14 of 14
npm run typecheck
npm run dev                # AGENT_MODE=replay is the default; no key needed
npm run demo:driver -- ord-00603   # the scripted CD-420603 driver
```

Commits, oldest first:

| Commit | What |
|---|---|
| `7cb43ed` | contract |
| `2b2efe9` | agent loop |
| `8f8c437` | replay and ask tools |
| `2b4cd56` | live runs |
| `9610164` | cited reminders and re-records |
| `f9a07d3` | demo driver |
| `94bba18` | handover note |
| `99fd590` | checks and replay |
| `574318f` | review per run |
| `c89c570` | queue and case |
| `e046232` | decisions |
| `c8eeb39` | driver intake |

---

Written by Claude from the repo's `PROCESS.md`, the commit history and the test output. Times are UTC on the demo clock.
