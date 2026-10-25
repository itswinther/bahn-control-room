# Shift Watch: our entry for the Car Delivery Control Room

One order agent per order does the legwork. Shift Watch checks everything the agents propose, answers drivers at
once, catches the drivers who go quiet before a pickup, and keeps one decision queue for the people on shift. At
09:00 on Bahn's 100 orders, a person sees 26; the other 74 stay quiet.

**Two minutes with it** (from `starter/`, then http://localhost:3000; no API key needed):
1. **Demo → Driver writes in.** CD-420603's driver is stuck in a ferry queue. Shift Watch answers him at once in
   Hamburg time; the agent proposes the 22:00 crossing; pick who pays, approve, and watch what happens next.
2. **Demo → A driver goes quiet.** Bahn's real case: a driver took a job and went silent. Shift Watch asked the day
   before; three hours of silence put the job back on the dispatch desk, a day before the pickup.
3. **Demo → Wake three more agents.** A timed-out booking, a warning light, a driver stranded at a site: each lands
   in the Inbox with why it needs a person and what happens if nobody decides.

| Bahn judges on | Read |
|---|---|
| The control room (40%) | [`SHIFT-WATCH-RECAP.md`](SHIFT-WATCH-RECAP.md): what it does, Bahn's mistakes replayed, the demo end to end |
| How we worked with AI (30%) | [`PROCESS.md`](PROCESS.md): what we asked, checked, threw away, and two scored judging rounds |
| Taste (30%) | The screens, and the "Taste" part of the recap |

- **Run it, every screen, and the checks:** [`starter/README.md`](starter/README.md).
- **Measured, not claimed:** held-out tests in `starter/fixtures/`, their outputs in `starter/evals/`.

Everything below this line is Bahn's challenge packet, unchanged.

---

# The Car Delivery Control Room

This is Bahn's challenge for the Prompt Operations Hackathon, 24 to 25 October
2026.

Bahn delivers used cars. A dealer sells a car, a driver from our network picks
it up and drives it to the buyer. Our agents already do a lot of the routine
work. The challenge is to build the place where people and agents work
together to get every car delivered, and one real agent for one part of the
job.

**Read `PARTICIPANT-BRIEF.md` first.** It says what to build, what to hand in,
and how we judge.

Everything in this repo is made up. No real people, cars, companies or
messages.

## What is in here

- `PARTICIPANT-BRIEF.md`: the challenge. Start here.
- `OPERATIONS-CONTEXT.md`: how car delivery work goes at Bahn, in plain
  words. Good reading for you and for your coding agent.
- `dataset/`: 100 made-up orders and everything around them: dealers,
  drivers, cars, bookings, messages, alerts, documents and events.
  `dataset/README.md` explains the files. `dataset/SCHEMA.md` explains every
  field.
- `attachments/`: made-up documents, receipts and photos that belong to those
  orders.
- `starter/`: a small web app that loads the data and shows it: a board of
  orders, an order page, a support inbox, and pages for customers, drivers and
  places. Use it, change it, or throw it away.
- `mockups/`: screenshots of the starter, so you can see it without running
  it.
- `check_packet.py`: a script that checks the data is complete. You do not
  need it, but you can run it with `python3 check_packet.py`.

## Run the starter

You need Node.js 24 or newer and Docker.

```sh
cd starter
cp .env.example .env
npm ci
docker compose up -d --wait
npm run db:push
npm run db:seed
npm run attachments:seed
npm run dev
```

Then open http://localhost:3000.

If port 5438 or 9009 is already in use on your computer, change it in
`starter/compose.yaml` and in the matching line of `starter/.env`.
`starter/README.md` has the details.

## Tips

- Point your coding agent at `PARTICIPANT-BRIEF.md`, `OPERATIONS-CONTEXT.md`
  and `dataset/SCHEMA.md` before you start. They explain the world better than
  the code does.
- The data is a snapshot. Nothing in it changes by itself. Your agent can
  pretend to send messages, make calls and book things. Nothing real is
  connected.
- Some of the data is messy on purpose. A message can disagree with an
  address. An alert is a reason to look, not a diagnosis. A quote for a ferry
  is not a booked ferry.
- The starter's board of lanes is how people have worked so far. It is not the
  answer.
- Questions: our channel on the event Discord, or our booth.
