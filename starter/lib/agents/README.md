# Order agent (Backend 1)

One Claude run per wake-up, on one order. It does the cheap work first, then either finishes or
hands Shift Watch one proposal. Everything here is built against `lib/contract.ts`.

## Run it

- **Replay (default, no key):** `AGENT_MODE=replay`. A wake-up plays the recorded model answers in
  `recordings/<order>.<reason>.json` back through the real loop, so tools and database writes run
  for real. Recorded so far, live on Sonnet 5.5: `ord-00603.DRIVER_MESSAGE`, `ord-00299.LOOSE_END`,
  `ord-00322.DRIVER_MESSAGE`, `ord-00593.LOOSE_END`. A replay is only valid from the state it was
  recorded in (the snapshot), so each recording plays once per demo reset; a second wake-up for the
  same order and reason stops with "already played". There is no `SENT_BACK` recording, so a
  send-back during a replay fails the next run.
- **Live:** `AGENT_MODE=live` plus `ANTHROPIC_API_KEY` in `.env`. Add `RECORD=1` to save the run
  as a recording.
- **Wake an agent:** `POST /api/agents/run` with `{ order_id, reason, reason_detail }` returns
  `202 { run_id }`; `409` if that order already has a run going. Follow it with
  `GET /api/runs/:runId` (poll while `status` is `RUNNING`).
- **Agents wake themselves (live only):** once a minute the server wakes each order's agent whose
  `next_check_at` has come due, with reason `NEXT_CHECK`, once per check (`wakeDue` in
  `order-agent.ts`, started from `instrumentation.ts`). Replay has no recordings for it, so it stays off.
- **Demo clock and reset:** `GET /api/clock` gives the demo time. `POST /api/clock` restarts the
  demo: it clears our six tables and the mock bookings and sets the clock back to 09:00.
- **Scripted driver:** `npm run demo:driver -- ord-00603` sends the driver's line through Shift
  Watch's intake. `--direct` skips intake and wakes the agent itself.
- **Checks:** `npm run check:agent` (asserts on the code-enforced rules and mocks).

## Rules enforced in code, not only in the prompt

- The approval level and owning desk come from the command (`rules.ts: route`), never from the agent.
- A proposal may only cite records the agent read in that run. Evidence tables come from the id's
  prefix (`rules.ts: tableFor`), and evidence times and mock flags come from the tool that
  returned the record, not from the agent.
- One proposal per run, one open proposal per order, one running run per order (database index).
- At most 12 tool calls; every run ends with `finish`, which writes `order_status`.
- `ask_driver` takes questions and acknowledgements only. An acknowledgement that repeats an
  instruction must cite the person's message (`repeats_message_id`). Agent messages are stored
  with status `PENDING_CHECK`; they don't reach the driver until Shift Watch checks them.
- `ask_site` refuses sites owned by the paying customer.
- The agent isn't told the 30-minute freshness rule. Shift Watch enforces it.

## For Backend 2 (Shift Watch)

Contract changes since the first hour:

- `DriverMessage.status` (`PENDING_CHECK` | `SENT` | `HELD`) and `DriverMessage.repeats_message_id`.
- `TravelLeg`, `Review`, `Execution` (with `next_steps` for "what happens next"), `Cost.note`.

What Shift Watch needs to do with the agent's output:

1. **Proposals with status `PENDING_CHECK`:** run the checks; set `check` and move the status to
   `SENT_BACK`, `HELD` or `PENDING_REVIEW`. On a send-back, wake the agent with
   `POST /api/agents/run { reason: "SENT_BACK", reason_detail: "<why>" }`.
   Expected outcomes for Bahn's 14 recorded proposals: `fixtures/proposal-replay-expected.json`.
2. **Driver messages with status `PENDING_CHECK`:** check for driving advice. If
   `repeats_message_id` is set, check that it is an operator's message to this driver. Then set
   `SENT` or `HELD`.
3. **Driver intake:** store the incoming message with `created_at` on the demo clock, then wake the
   order agent with reason `DRIVER_MESSAGE` (see `scripts/demo-driver.ts --direct`).
4. **Times:** use `lib/clock.ts` (`nowIso()`), never the computer's clock. Our tables return ISO
   8601 UTC strings.
5. **Evidence:** `table` is always a dataset table name (`travel_options`, `messages`, ...), and
   `mock: true` marks our fixtures. `fresh_data` applies only to commands that book or buy.

## For the frontend

- Sample data: `fixtures/order-agent.ts` (runs, steps, notes, proposals, status for CD-420603).
- In a run's steps, `TEXT` steps are the agent's own words or short progress notes: show them as
  "why".
- Label anything with `mock: true` as made up, and a recording with `source: "hand-written"` as a
  simulation.

## Demo change

On CD-420603 the live agent refreshed ferry capacity on its own, so beat 2 shows the agent doing it
right. The "caught" moment uses Bahn's own recorded mistake instead: the CD-420194 rebooking from an
unrefreshed list, from the proposal replay.

## Known limits

- Progress notes are sparse (about one per run).
- Mock data covers CD-420603, 420299 and 420593. Other orders get "no data" from the ferry and site
  tools.
- Not built yet: `npm run record` (use `RECORD=1` with live mode for now) and customer update
  drafts.
