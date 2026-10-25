# Shift Watch: before and after

Shift Watch is a control room where one order agent per order does the legwork, and Shift Watch checks everything
the agents propose, answers drivers at once, catches the drivers who go quiet, and keeps one decision queue for the
people on shift. This page shows what Bahn's starter was, what we built, and how it answers the brief's three judging
criteria. Every claim points to a record id, a file or a command you can run.

> **In one minute**
> - **A person sees 26 of 100 orders**, safety first, then the agents' ready plans, then what to chase. The other 74 stay quiet.
> - **Every proposal is checked before a person sees it**, against the five corrections Bahn's own people made to their agents.
> - **Drivers get an answer at once**, in their language and local time, with a time they'll hear back by.
> - **A driver who goes quiet is caught the day before the pickup**, not days later when they write "won't deliver".
> - **We measured ourselves on held-out cases** and say where the rules alone fail (0 of 10) and where Claude holds (10 of 10).

---

## 1. Before: what we started from

**Bahn's starter.** A read-only app over 100 made-up orders: a board of seven lanes, an order page and a mailbox.
43 orders were marked "needs a person", spread across the lanes. The one critical case, CD-420322 (a red warning
light, driver stopped on the road), sat in the fifth column, off the right edge of a 1440 px screen. No agent, no
approvals, and no way to talk to a driver.

**How Bahn works today** (the brief, and our conversations with Bahn):
- About 50 people run 25,000 deliveries a year with 1,500 freelance drivers.
- One simple agent per order: it emails, sleeps, wakes itself, and keeps a notes file.
- **Driver chat is handled only by people**, and support sits in a separate tool.
- People already respond fast: reviews took 2–14 minutes, replies to drivers a median of 12. Speed isn't the
  problem; what reaches a person is.
- A real case Bahn told us about: **a driver took a job, didn't deliver, and wrote "won't deliver" days later.
  Nobody caught it, and the customer cancelled.**

**What went wrong in the records.** Bahn's agents made 14 proposals on 11 orders; people edited 3, rejected 1, and 1
failed when it ran. At the snapshot (21 Oct, 09:00 UTC) the records also show work nobody was holding:

| What | Where |
|---|---|
| A rebooking picked from a ferry list nobody had refreshed | CD-420194, edited |
| An alert closed as if the car had boarded | CD-420020, edited |
| The driver blamed for damage from photos alone | CD-420055, rejected |
| "Try restarting the vehicle" sent to a driver stopped by a warning light | CD-420322, edited |
| A ferry booking that timed out, with no check of what happened | CD-420299, failed |
| Lookups approved, then never carried out | CD-420603, CD-420194, CD-420154 |
| High-severity alerts acknowledged and left | CD-420593, CD-420299, CD-420702 |
| A driver's own wait limit running out at a pickup site, unanswered | CD-420593 |
| A driver who never started a 09:00 yard pickup, found only through messages two hours in | CD-420702 |

---

## 2. After: what Shift Watch is

```text
 The day before a pickup ──▶ Shift Watch asks the booked driver to confirm ──no answer──▶ card: re-offer the job
 Driver ──writes──▶ Shift Watch ──answers at once, in their language and local time──▶ Driver
                        │  safety: fixed safety line, top card for the shift lead
                        ▼ wakes
                  Order agent (one per order, Claude with tools)
                  reads first: notes, order, messages, ferry list, rest; asks the driver or the site
                        │
                        ▼ one proposal
                  Shift Watch checks ──send back──▶ the agent tries again (up to 2×)
                        │            ──hold──▶ a person, with the reason
                        ▼ pass
                  Decision queue ──▶ the right person decides ──▶ paged if it's urgent and unanswered
                        │
                        ▼ 10-second undo, then it runs
                  Booking (mock), driver told in local time, "what happens next" on the card;
                  the agent sets its next check and wakes itself when it comes due
```

| Part | What it does | Where |
|---|---|---|
| Order agent | One short Claude run per wake-up on one order, at most 12 tool calls. Reads first, then finishes or hands over one proposal. Keeps notes, sees what people decided, wakes itself. | `starter/lib/agents/` |
| Checks | Every proposal and every agent message to a driver is checked before it goes anywhere: rules from Bahn's corrections, plus Claude reading the text in live mode. | `lib/shift-watch/checks.ts`, `review.ts` |
| Driver intake | Answers at once with a time they'll hear back by, in their language and local time. Lists what a message leaves unclear ("no hour given") instead of guessing. | `lib/shift-watch/intake.ts`, `read.ts` |
| Day-before check | Asks every booked driver to confirm the pickup; silence or a slot opening with the job not started becomes a card. | `lib/shift-watch/confirm.ts` |
| Decision queue | One list: safety, then the agents' ready plans, then what to chase. Each card says why it reached a person and what happens if nobody decides. | `lib/shift-watch/queue.ts` |
| Decisions | Only the right desk decides, who pays must be chosen, a 10-second undo, and a double click can't book twice. | `lib/shift-watch/decide.ts` |
| Paging | Urgent cards page the desk's person, then their backup, then the shift lead. A mock Slack screen shows it; nothing real is connected. | `lib/shift-watch/pager.ts`, `paging.ts` |
| Screens | Overview, Inbox with the case view, the Shift Watch side panel, Slack (mock), and a Demo menu. Bahn's lane board stays at `/orders`. | `starter/app/(control-room)/`, `starter/components/` |

It runs without an API key: replay mode plays recordings of live Sonnet runs through the real loop.

---

## 3. How it answers the brief

### The control room (40%)

| The brief asks | Shift Watch |
|---|---|
| Only the orders that need a person? | 26 of 100 at 09:00. 74 stay quiet, and the footer says so ("100 checked · 74 quiet"). |
| Just enough to decide? | One card: the decision, "Why you", "If nobody decides", before → after, who pays, Approve / Edit / Reject. |
| Where did every fact come from? | Each fact carries its record and time; made-up data is labelled "made up"; a quote is never shown as a booking. |
| Cheap work first, knows when to stop? | The agent reads and asks before proposing, at most one proposal per run. Rules in code, not the prompt, decide who must approve. |
| Clear what happens next? | After Approve: a 10-second undo, then numbered "What happens next" steps on the card. A failure stays on the card. |

### How we worked with AI (30%)

The full record is in `PROCESS.md`. The moments that changed the product:

- **We didn't count our own 14 of 14.** The checks were written from Bahn's 14 proposals, so we wrote mistakes in new
  words before the first run. For the language set, git shows the order: fixtures `05fa07a` and `310fb20` before
  the code `dbeaa62`.
- **We tested our translation idea before building it, and it was wrong.** Claude read 12 of 12 tricky time phrases
  right; the real failure was filling in an hour the driver never gave. We built "list the gaps, never fill them".
- **We scored ourselves the way the judges will, twice.** Three reviewers per round who hadn't seen our own view.
  Round 1 found a driver quote on the safety card that the driver never wrote; round 2 found the agent offering a
  guessed hour as a one-tap button. Both were fixed and re-tested live.
- **Bahn's real no-show changed the design.** Our first version reacted to the driver's "won't deliver" message.
  We changed it to ask the day before, so the message never has to arrive.

| Held-out test (one run each) | Rules alone | With Claude reading |
|---|---|---|
| Bahn's mistakes in new words (10 mistakes, 5 clean) | 5 of 15 (0 of 10 mistakes) | 15 of 15 |
| The agent's messages to drivers (8 bad, 7 fine) | 7 of 15 (holds none of the 8 bad) | 15 of 15 |
| What a driver's message is about | 10 of 14 (fitted: we widened the words from these) | 13 of 14 |
| Casual messages in six languages: gaps flagged, no time invented | — | 15 of 15 |

Outputs: `starter/evals/`. Fixtures: `starter/fixtures/`.

### Taste (30%)

- **One queue in three labelled parts** (Safety, Agent plans ready, To chase) instead of seven lanes.
- **Plain words, local times for drivers, dates on anything not today**, and the agent's plan as a headline with
  the detail folded beneath it.
- **We removed what looked generated:** decorative dots, a shouting chat panel, suggested questions, and a team
  picker that did nothing visible.
- Judged from screenshots: 3 of 5. "Looks made with care", with the decision card and the undo window as the best
  parts. Still open: local time for staff (operators see UTC) and phone width.

---

## 4. Without and with Shift Watch

| | Without (starter and Bahn today) | With Shift Watch |
|---|---|---|
| **What a person sees first** | 100 cards in 7 lanes, 43 flagged | 26 cards: safety, the agents' ready plans, then what to chase |
| **A driver writes in** | Waits for a person (median 12 min, longest 152) | Answered at once with a time to hear back by; a broken promise moves to the shift lead |
| **A driver goes quiet** | Found when they finally write, or when the customer cancels | Asked the day before; no answer in 3 hours is a card to re-offer the job |
| **A driver doesn't show up** | Found through messages, hours into the slot (CD-420702) | A card the moment the slot opens with the job not started |
| **Safety** | The critical case can sit off-screen | The top card; a fixed safety line to the driver in their language; only the shift lead decides |
| **An agent's mistake** | A person has to spot it | Checked first: sent back with the reason, or held for a person |
| **Who may approve** | Whoever is reviewing | Set in code from the command, never by the agent |
| **Contacting the customer** | A rule people follow | Enforced in code: the agent has no way to reach a customer |
| **After "approve"** | "Approved" can sit for an hour unrun | Runs after a 10-second undo; the result and next steps stay on the card |
| **Other languages** | A message is read by whoever is on shift | The card says who wrote, in what, what's unclear, and which country team reads it |
| **Urgent and unanswered** | Someone notices, or doesn't | Paged: the desk's person, their backup, then the shift lead |

---

## 5. Bahn's mistakes, replayed through Shift Watch

| Mistake | Bahn's correction | What Shift Watch does |
|---|---|---|
| Rebooking from an old ferry list (CD-420194) | "Do not select a crossing from an unrefreshed list." | A booking needs capacity checked in the last 30 minutes, timed by the tool, not the agent. Sent back. |
| Boarding treated as confirmed (CD-420020) | "Keep boarding unconfirmed." | Booked needs a reservation record, boarded a gate record. Sent back. |
| Driver blamed from photos (CD-420055) | "Photos establish a reported condition, not when or by whom it happened." | Held for the shift lead. |
| Restart advice to a stopped driver (CD-420322) | "Remove restart advice." | Sent back; the agent's own messages to drivers are checked the same way. |
| Blind retry after a timeout (CD-420299) | "Outcome needs reconciliation." | Held until the outcome is checked; the agent checks it first. |
| Approved, never carried out (CD-420603, -0194, -0154) | still waiting | A card after 15 minutes: "Approved at 07:59 but not carried out". |
| Acknowledged and left (CD-420593, -0299, -0702) | still open | A high alert stays in front of its owner until it's resolved. |
| A driver who never started (CD-420702) | found through messages | "Driver hasn't started" the moment the slot opens. |

`npm run eval:proposals` runs Bahn's 14 proposals through the checks: 14 of 14 match the outcome written down before
the checks existed (`starter/evals/proposals.txt`).

---

## 6. The demo, end to end

- **Missed ferry, CD-420603.** "Navigation now says 14:20 at check-in." Shift Watch answers at once in Hamburg time.
  The agent reads 14:20 as 12:20 UTC, past the 12:00 cutoff, refreshes the ferry list, checks the driver's rest, rules
  out the 08:00 sailing (it lands after the delivery promise) and proposes the 22:00 crossing at €390, keeping the old
  booking as a fallback. The travel desk picks who pays and approves; after the undo window it books (mock), and the
  driver gets the reference and check-in time in local time.
- **A driver goes quiet, CD-420442** (Bahn's real case). At 09:00 Shift Watch asks the booked driver to confirm
  tomorrow's Stockholm pickup. Three hours later the other drivers have said yes; this one hasn't. The dispatch desk
  gets "Driver has gone quiet … re-offer the job", a day before the pickup.
- **Warning light, CD-420322.** A fixed safety line goes to the driver; the card goes to the top for the shift lead.
  The agent sees the shift lead already owns the recovery decision and adds nothing of its own.
- **Car not at the site, CD-420593.** The driver's wait ran out at 08:27, which is the card's deadline, so it goes
  straight to the shift lead. The agent proposes releasing her with a travel-back plan.
- **A driver writes in Finnish** (live mode). "Ehdin kyl, oon checkinis varttii vaille": "I'll make it, at quarter
  to", with no hour. The card shows "unclear: no hour given" and the Finland team; the driver gets Finnish with the
  English beneath; the agent asks which hour instead of guessing.

---

## 7. What it doesn't solve yet

- **Without a key, the checks are weaker.** Replay reads text with rules only. A message the rules read is never
  closed on their reading alone: the driver gets an answer and a time, and a person sees it.
- **The outside world is mocked:** ferries, fares, site replies, carriers, bookings, driver rest, and Slack. Mock data
  is labelled wherever it shows.
- **Scale is tested on 100 orders**, not 25,000. The queue is rules with no model call and agents run per order, so
  both should split, but the queue still rebuilds in full on every read.
- **Who decides is a desk picked on screen**, not a signed-in person.
- **Operators see UTC**; drivers see local time.

---

## 8. Check it yourself

From `starter/`:

```sh
npm run typecheck
npm run check:agent                  # the rules enforced in code
npm run check:paging                 # who gets paged, and what counts as dropping a job
npm run eval:proposals               # Bahn's 14 proposals: 14 of 14
npm run eval:reworded -- --claude    # every held-out set above (needs a key)
python3 ../check_packet.py           # Bahn's data checker
```

How we got here, including what we threw away and where we didn't take Claude's first answer: `PROCESS.md`.
