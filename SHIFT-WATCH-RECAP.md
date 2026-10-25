# Shift Watch: before and after

This recap covers what the control room was when we started on 24 October and
what it is now. It compares working with and without Shift Watch, and goes
through the mistakes in Bahn's own records one by one. Every claim points to a
record id, a file or a command you can run.

---

## 1. Where we started

### The starter Bahn gave us

- A read-only Next.js app over 100 made-up orders: a board of seven lanes
  (intake, ready, market, booked, moving, delivered, cancelled), an order page
  and a support mailbox.
- **43 of the 100 orders** were marked "needs a person", spread across the
  lanes. The one critical case is CD-420322: a red warning light, with the
  driver stopped on the road. In the 1440 px mockup it sat in the fifth
  column, beyond the right edge of the screen.
- No agent, no write actions, no approvals and no way to talk to a driver.
  The starter says so itself: "Before any agent acts, a team should decide
  which facts are current, what evidence supports them, and who can approve
  the action."

### How Bahn works today

From the brief and our talk with the challenge partner:

- About 50 people run 25,000 deliveries a year with 1,500 freelance drivers.
- One simple agent per order. It sends an email, sleeps, wakes itself, and
  keeps notes in a markdown file.
- **Driver chat is handled only by people**, and support sits in a separate
  tool (Intercom).
- People already respond fast. Bahn's reviews of agent proposals took 2–14
  minutes. Replies to drivers took a median of 12 minutes, the longest 152,
  across the 20 replies addressed to a driver. Speed wasn't the problem;
  what reaches a person was.

### What went wrong in the records

Bahn's agents made **14 proposals on 11 orders**. People edited 3, rejected 1,
and 1 failed when it ran. At the snapshot (21 Oct, 09:00 UTC) the records also
show work that nobody was holding:

| What | Where |
|---|---|
| A rebooking picked from a ferry list nobody had refreshed | CD-420194, `travel.rebook`, edited |
| An alert closed in a way that would have marked the car as boarded | CD-420020, `alert.resolve`, edited |
| The driver blamed for damage from photos alone | CD-420055, `condition.record_attribution`, rejected |
| "Try restarting the vehicle" sent to a driver stopped by a warning light | CD-420322, edited |
| A ferry booking that timed out with no reference, with no check of what happened | CD-420299, `travel.book_ferry`, failed |
| Lookups bundled with contacting the customer, so the lookups waited for approval | CD-420593, CD-420299, CD-420399, pending |
| Lookups approved, then never carried out | CD-420603 (07:59), CD-420194 (08:33), CD-420154 (08:42) |
| An alert acknowledged by its owner and left there, still high severity | CD-420593, CD-420299, CD-420702 |
| A driver's own wait limit running out at a pickup site, with no reply | CD-420593: "I can wait another 30 minutes" at 07:57 |

---

## 2. What it is now

```text
 Driver ──writes──▶ Shift Watch intake ──answers at once, with a time──▶ Driver
                          │
                          ▼ wakes
                    Order agent (one per order, Claude with tools)
                    reads first: notes, order, messages, ferry list, rest check,
                    asks the driver or the pickup site
                          │
                          ▼ one proposal
                    Shift Watch checks ──send back──▶ agent tries again (up to 2×)
                          │            ──hold──▶ a person, with the reason
                          ▼ pass
                    Decision queue ──▶ the right person decides
                          │
                          ▼ 10-second undo, then it runs
                    Booking (mock), driver told in local time,
                    "what happens next" on the card, agent's next check set
                          │
                          ▼ when that check comes due (live)
                    the agent wakes itself again
```

| Part | What it does | Where |
|---|---|---|
| Order agent | One Claude run per wake-up on one order, up to 12 tool calls. Reads first, then finishes or hands over one proposal. Keeps notes between runs. | `starter/lib/agents/` |
| Shift Watch checks | Every proposal is checked before a person sees it: rules from Bahn's own corrections, plus Claude reading the text in live mode. | `starter/lib/shift-watch/checks.ts`, `review.ts` |
| Driver intake | Matches the message to the driver's job and answers at once with a time they'll hear back by, in their local time and language. Safety goes straight to the shift lead. | `starter/lib/shift-watch/intake.ts` |
| Decision queue | One list for the people on shift: safety first, then the earliest deadline. Each card says why it reached a person and what happens if nobody decides. | `starter/lib/shift-watch/queue.ts` |
| Decisions | Only the right desk can decide, who pays must be chosen, there's a 10-second undo, and a double click can't book twice. | `starter/lib/shift-watch/decide.ts` |
| Operator chat | Shift Watch answers questions from the records. It can only draft buttons; a person presses them. | `starter/lib/shift-watch/chat.ts` |
| Screens | Inbox (the queue), the case view, the Shift Watch side panel, and a Demo menu. Bahn's lane board is still at `/orders`. | `starter/app/(control-room)/`, `starter/components/` |

It runs without an API key: replay mode plays recordings of live Sonnet 5.5
runs through the real loop. Live mode runs Claude for the agent, the checks,
the reading of driver messages and the chat.

---

## 3. Without and with Shift Watch

| | Without (starter and Bahn today) | With Shift Watch |
|---|---|---|
| **What a person sees first** | 100 cards in 7 lanes, 43 flagged, in lane order | 26 of 100 at 09:00, safety first, then deadline. The other 74 stay quiet. |
| **Why it needs a person** | A list of record types ("Open conversation", "Owned alert") | One line per card: the decision, why the agent stopped, and what happens if nobody decides |
| **A driver writes in** | Waits for a person: median 12 min, longest 152 | Answered at once, with "you'll hear from us by 11:15 Hamburg time". A broken promise becomes a card and moves to the shift lead. |
| **Safety** | The critical case can sit off-screen | Always the top card. Only the shift lead decides, and "a person will contact you" counts as kept only when a person writes. |
| **An agent's mistake** | A person has to spot it while reviewing | Checked before a person sees it. Fixable mistakes go back to the agent with the reason; the rest are held for a person with the reason. |
| **Who may approve** | Whoever is reviewing | Set in code from the command, never by the agent: the owning desk, the shift lead for recovery, blame or promises, a person for anything sent to a customer |
| **Contacting the customer** | A rule people follow | Enforced in code: the agent has no customer tool, and `ask_site` refuses sites the paying customer owns |
| **After "approve"** | "Approved" can sit for an hour without anything happening | Runs after a 10-second undo window. The card shows the result and what happens next, and a failure stays on the card. |
| **Double booking** | Possible on a retry or a double click | Booking key per order and sailing, a conditional update on the decision, and the old booking kept as a fallback until its check-in closes |
| **Times** | UTC, and drivers write local time | Drivers get their local time; operators and records stay in UTC; the agent converts before comparing |
| **Agent follow-ups** | Bahn's agent wakes itself; the starter has none | The agent sets its next check and wakes itself when it comes due (live). If not, the queue shows "next check overdue". |

---

## 4. Bahn's mistakes, replayed through Shift Watch

`npm run eval:proposals` runs Bahn's 14 recorded proposals through the checks:
**14 of 14** match the outcome written down before the checks existed. The rules
were written from these same proposals, so we also test on mistakes in new
words: `npm run eval:reworded -- --claude`.

| Mistake | Bahn's correction (from the record) | What Shift Watch does | Test |
|---|---|---|---|
| Rebooking from an old ferry list (CD-420194) | "Do not select a crossing from an unrefreshed list." | A booking needs capacity checked in the last 30 minutes, timed by the tool, not the agent. Missing evidence counts as stale. Sent back. Any command that books uses the same test. | eval 14/14; `travel.change_crossing` on a stale list is sent back |
| Boarding treated as confirmed (CD-420020) | "Keep boarding unconfirmed." | Booked needs a reservation record and boarded needs a gate record. Sent back. Travel legs always show booked or not, and boarding as unconfirmed. | eval 14/14; reworded 2/2 with Claude |
| Driver blamed from photos (CD-420055) | "Photos establish a reported condition, not when or by whom it happened." | Held for the shift lead. Only a person decides who caused damage. | eval 14/14; reworded 2/2 |
| Restart advice to a stopped driver (CD-420322) | "Remove restart advice." | Proposals with driving advice are sent back. The agent's own messages to drivers are checked too, by word list and, in live mode, by Claude, and held for a person if they advise driving. | proposals: reworded 3/3; driver messages: 15/15 with Claude (the word list alone holds none of the 8 bad ones) |
| Blind retry after a timeout (CD-420299) | Failed: "Outcome needs reconciliation; no reservation is recorded." | Held until someone checks the outcome. The agent has `check_booking_outcome`, and its recorded run calls it before proposing. | eval 14/14 |
| Lookups waiting on a customer contact (CD-420593, -0299, -0399) | still pending | Sent back to split: lookups run now, the customer step becomes its own proposal for a person to send | eval 14/14; reworded 3/3 |
| Approved, never carried out (CD-420603, -0194, -0154) | still waiting | A card after 15 minutes: "Approved at 07:59 but not carried out". For a ferry refresh, it closes once our agent has run the same check. | queue at 09:00 |
| Acknowledged and left (CD-420593, -0299, -0702) | still open | A high or critical alert stays in front of its owner until it is resolved | queue at 09:00 |
| Driver's wait ran out (CD-420593) | no reply after 07:57 | A card with that deadline: "Driver's wait ran out at 08:27" | queue at 09:00 |

### The brief's scenarios, end to end

- **Missed ferry, CD-420603** (the demo). The driver writes "Navigation now
  says 14:20 at check-in". Shift Watch answers at once in Hamburg time. The
  agent converts the time to 12:20 UTC, past the 12:00 cutoff. It refreshes
  the ferry list, checks the driver's rest, rules out the 08:00 sailing
  because it lands after the delivery promise, and proposes the 22:00
  crossing at €390, keeping the old booking. The checks pass, the travel desk
  picks who pays and approves, and after the undo window it books (mock). The
  driver gets the reference and check-in time in local time.
- **Warning light, CD-420322.** The driver writes "The warning light is still
  on. I'm parked and waiting." Shift Watch answers at once with a fixed
  safety line ("Please stay somewhere safe. A person is taking over now...")
  and the card goes to the top for the shift lead. The agent reads the order,
  sees the shift lead already owns the recovery decision (due 09:15), writes
  its notes and adds no proposal of its own. It gives no driving advice.
- **Car not at the site, CD-420593.** The card appears at 09:00 because the
  driver's wait ran out at 08:27, and that is its deadline, so it goes
  straight to the shift lead. The agent asks the driver whether she can
  keep waiting (yes or no) and proposes releasing her with a travel-back plan,
  for the dispatch desk to decide.
- **Timed-out booking, CD-420299.** The agent checks the outcome first (no
  booking exists), then proposes the 24 Oct sailing at €387. Shift Watch lets
  it through because the outcome was checked.

---

## 5. What it doesn't solve yet

- **Without a key, the checks are weaker.** Replay mode reads text with rules
  only, which catch 0 of 10 reworded mistakes against 10 of 10 with Claude. When
  the rules read a driver's message, it is never closed on their reading
  alone: the driver gets an answer and a time, and the agent wakes.
- **Replay plays what was recorded.** Any driver message on CD-420603 plays
  the demo's recording.
- **The outside world is mocked:** ferry capacity and fares, site replies,
  carrier outcomes, bookings and driver rest. Mock data is marked mock
  wherever it shows.
- **Scale is tested on 100 orders**, not 25,000. The queue is built by rules
  with no model call, and agents run one per order, so both should split
  cleanly, but that is not measured yet.
- **Bahn's other pending proposals** (CD-420055 `compare_evidence`) still show
  only through their order's other loose ends.

---

## 6. Check it yourself

From `starter/`:

```sh
npm run typecheck
npm run check:agent                  # the rules enforced in code
npm run eval:proposals               # Bahn's 14 proposals: 14 of 14
npm run eval:reworded -- --claude    # held-out mistakes and driver messages, needs a key
python3 ../check_packet.py           # Bahn's data checker
```

The full record of how we got here, including what we threw away and where we
didn't take Claude's first answer, is in `PROCESS.md`.
