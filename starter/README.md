# Shift Watch

Our entry builds on Bahn's starter below. It adds:

- **An order agent per order:** Claude with tools, which proposes one step at a time.
- **Shift Watch:** it checks every proposal, answers drivers, and keeps one decision queue for the people on shift.

Everything runs without an API key: by default, agent runs are replayed from recordings of live Sonnet 5.5 runs.

## Run it from a fresh clone

You need Node.js 24 or later and Docker. From `starter/`:

```sh
cp .env.example .env
npm ci
docker compose up -d --wait
npm run db:push           # Bahn's tables plus our six
npm run db:seed
npm run attachments:seed
npm run dev               # http://localhost:3000, replay mode
```

Then play the demo case, CD-420603, from the screen. Its driver is stuck in the ferry queue:

1. Open **Demo → Driver writes in**. Shift Watch answers the driver at once, and the order agent starts.
2. The agent's recorded run proposes the 22:00 crossing. It appears in **Inbox** with why it reached a person and what happens if nobody decides.
3. Pick who pays and press **Approve**. You can undo for 10 seconds; then the mock booking runs, the driver gets the new crossing in their local time, and the card shows what happens next.

**Demo → Wake three more agents** plays the other recordings (a timed-out booking, a warning light, a driver past her wait limit). **Demo → Restart the demo** clears our tables and goes back to 09:00. Each recording plays once per reset. The same steps work without the screen: `curl -X POST http://localhost:3000/api/clock`, then `npm run demo:driver -- ord-00603`.

## The screens

- `/`: **Overview.** Calls waiting, due this hour, safety, drivers waiting, a shift timeline per desk, and what's next.
- `/inbox` and `/cases/:orderId`: **Inbox.** The decision queue on the left; on the right, the agent's plan with approve, edit or reject, any message Shift Watch held back from a driver, and the order's timeline, travel (booked, quoted or requested), the agent's notes and steps.
- **Shift Watch panel** on every screen: ask about any order. It needs `ANTHROPIC_API_KEY`; without one it answers from the records and says so.
- **Deciding as** (top right) is the desk your decisions go out as. The backend checks it: only the shift lead decides safety calls.
- Bahn's starter screens are still here: the lane board at `/orders`, the support mailbox at `/mail`, and the full record at `/orders/:id` (linked from each case as "Full record").

The screens live in `app/(control-room)/`, `components/` and `lib/ui/`. They read Shift Watch's queue and case builders directly (`lib/ui/data.ts`, `lib/ui/adapt.ts`) and write through the API routes (`lib/ui/api.ts`). Bahn's starter screens keep their own layout in `app/(starter)/`.

## Check it

```sh
npm run typecheck
npm run check:agent        # the rules enforced in code
npm run eval:proposals     # Bahn's 14 recorded proposals through Shift Watch: 14 of 14
npm run eval:reworded      # held-out reworded mistakes: rules alone (add -- --claude with a key)
```

## Live mode

Set these in `.env`:

- `AGENT_MODE=live`
- `ANTHROPIC_API_KEY=...`
- `AGENT_MODEL`, the order agent (default `claude-sonnet-5-5`)
- `SHIFT_WATCH_MODEL`, Shift Watch's reading and the chat (default `claude-sonnet-5-5`)

In live mode:

- Agents run live.
- Shift Watch also has Claude read each proposal's text and each driver's message, in any language.
- The operator chat (`POST /api/shift-watch/chat`) works. It needs a key even in replay mode.

To re-record the demo runs:

1. Add `RECORD=1` to `.env` and start `npm run dev`.
2. Run `npm run record`. It overwrites `recordings/`, so read each run before committing it.

How the agent and Shift Watch work, and what they may and may not do, is in `lib/agents/README.md` and `../PROCESS.md`.

---

# Optional Control Room starter

This is a small read-only starting point for the Car Delivery Control Room challenge. It uses Next.js with TypeScript, Postgres, Drizzle and Next.js API routes. The database comes from the fictional dataset in `../dataset/data`. No live Bahn system is connected.

The lanes are one familiar view, not a proposed answer. Each card opens a separate order record. Teams can keep, change or replace the interface and data model.
Every vehicle model in this dataset has a generated illustration on its record page. Orders with the same model share an image. An illustration is not evidence about the specific vehicle. Single-colour make marks are in `public/car-logos/` for teams that want them.

## Start

You need Node.js 24 or later and Docker.

```sh
cp .env.example .env
npm ci
docker compose up -d --wait
npm run db:push
npm run db:seed
npm run attachments:seed
npm run dev
```

Open http://localhost:3000.

The Compose file uses three ports on this computer: 5438 for Postgres, 9009 and 9010 for the attachment store. If one of them is already in use, change it in `compose.yaml` and update `DATABASE_URL` or `S3_ENDPOINT` in `.env` to match.

The seed command **replaces** data in the local challenge database after checking every manifest count. It makes the replacement in one transaction. Run it again after updating the JSONL files.
If you add your own tables with foreign keys to the starter data, reseeding stops instead of deleting those tables. Keep participant work in separate tables or migrate it deliberately before replacing the snapshot.

The same Compose file starts a local S3-compatible attachment store. `attachments:seed` checks each file against `../attachments/manifest.json` before uploading it. It can be rerun safely. The store is only available on this computer: API at http://127.0.0.1:9009 and browser console at http://127.0.0.1:9010/rustfs/console/. The console credentials are in `.env.example` and are only for this fictional local setup.

## What is here

- `lib/schema.ts`: typed tables for orders, customers, managed sites, one-off addresses, vehicles, drivers, items, conversations, messages, alerts and operational events. Other dataset collections, including internal room activity, keep their complete fields in `related_records` JSONB.
- `lib/present/`: the reading layer. It turns records into labelled view models: `labels.ts` (codes to words), `actors.ts` (identifiers to names and roles), `attention.ts` (what needs a person and which date decides the next step), `board.ts` (one card per order), `record.ts` (the order page, section by section) and `events.ts` (one sentence per event). Nothing here is a source of truth; every value points back to a record in the API.
- `scripts/seed.ts`: loads every collection named in the dataset manifest. It checks basic field types while loading.
- `GET /api/overview?q=...`: lane totals, per-lane attention counts and all matching order cards. Each card carries its derived attention items, the date that decides its next step and short work lines.
- `GET /api/orders/:id`: one order with its linked addresses, managed site profiles when present, vehicle, assigned drivers, alerts, messages, event history and other records, plus `view`, the same information read out for the interface: a plain-language headline, four tiles, the route, threads, evidence, proposals and history.
- `GET /api/entities/:kind` and `GET /api/entities/:kind/:id` for `driver`, `customer` and `site`: a list with order counts, and one record with its facts and the orders it is involved in. These serve the Customers, Drivers and Places pages.
- `GET /api/inbox`: support threads that arrived without a safe order link, plus their messages, and a `view` with names and order references. Candidate orders are hypotheses; `linked_order_ids` holds confirmed links. These records stay in `related_records` so the order detail route does not silently file an unresolved thread under a car. The Inbox page shows them as a mailbox.
- `GET /api/reference-data`: shared fictional terminals, road estimate ranges and operations actors that are not tied to a single order.
- `GET /api/orders/:id/attachments`: metadata for the order's fictional PDFs and photos, with short-lived read-only URLs from the local attachment store.

The board shows every order in its lane. Within a lane, orders that need a person come first, then the date that decides the next step: the requested pickup for new orders, the selected pickup slot while a driver is found or booked, the delivery promise while the car moves, and the recorded delivery or cancellation after that. Each card shows the car, reference, customer, route, that date and up to three short work lines: open alerts, owned work, waiting conversations, agent proposals and the assigned driver or live offer. "Needs a person" filters the board to orders with any of those. Search by reference, plate, customer, vehicle or city. Click a card to open its full record at `/orders/:id`.
The attention signal is derived from open alerts, unresolved incidents, open work items, open conversations, pending or failed agent proposals, unresolved endpoint claims, custody follow-ups, support inbox threads that name the order, and a moving car whose driver has started the leg while the app has sent no position and the delivery promise is still open. A conversation filed on one order and related to another counts for both, on the board and on the record. A quiet card means those records are empty, not that the order is verified safe. `display_lane` and the derived signal are reading aids for this starter, not operational truth.
The order record is deliberately short. It opens with the model illustration, the car, a few facts as chips, one sentence of context and one headline about the situation ("Cole Mervalen collects it tomorrow.", "Running late to Hamburg.", "Still being prepared."). When the attention list holds a danger or warn item, the detail line ends with the first of them as "Open: ...". A danger item also gives the headline that tone. Then "Needs a person", four tiles (pickup, delivery, driver, fee or ETA), the route as stops with a leg between them, conversations with the last message, evidence as chips and a strip of sample files, prior agent work and the latest activity. When nothing is waiting, the panel says "Nothing in the records is waiting on a person." and names which records were checked and which were not. "Prior agent work" lists proposals already on the order with their recorded review. A team's own agent and the human decision on its proposals belong there. Everything else is folded under "Everything on this order": route details, alerts and work, drivers, the driver market, travel, costs, proofs and documents, prior agent work with room activity, and the full history. The page shows the shape of the data; the API and those folds hold the depth. Names of customers, drivers and sites link to their own pages, and order references link to the order. "Not supplied" is an unknown input, not a failed pickup. Labels come from `lib/present/labels.ts`; the raw codes stay in the API.
Open, acknowledged, resolved and dismissed alerts remain distinct in the order view. An acknowledged alert still appears on the board with its owner; it is not treated as resolved. A dismissed alert retains the stale or invalid source and the evidence for dismissing it.
The order detail also shows selected sample photos and PDF links when the order has bundled files. The signed links expire after 15 minutes; reload the page to refresh them. Booked travel is shown separately from options. For a moving car, the first-view ETA comes from the last direct driver-app observation; a later schedule inference is labelled separately. Tracking records in this packet have no map coordinates, so the starter does not draw a live position.
Slots, promises and ETAs show the window's local time with its zone name; everything else is UTC, and every time carries the full UTC value on hover. Relative phrases such as "in 2 d" are measured against the snapshot time, not the real clock. Messages show their channel and recipient, because a case workspace is not one shared public thread.

This starter does not include write actions, an agent, permissions or grading. Those choices are part of the challenge. Before any agent acts, a team should decide which facts are current, what evidence supports them, and who can approve the action.

## Check

```sh
npm run typecheck
npm run build
APP_URL=http://localhost:3000 npm run smoke
APP_URL=http://localhost:3000 npm run attachments:smoke
```

The first smoke check compares one order's plans, points and segments in the API with the JSONL source, then fetches every board card and its order record and fails if they disagree on whether the order needs a person. The attachment check downloads one file of each format and checks its hash against the manifest. Run the app before these checks. The seed and the checks read `../dataset/data` and `../attachments`; set `DATASET_DIR` or `ATTACHMENTS_DIR` to point them at another folder with the same files.

## Rerun on modified input

`DATASET_DIR` plus `npm run db:seed` is the supported way to see the starter on changed data. Copy `../dataset/data` to another folder, edit a JSONL row there, then run:

```sh
DATASET_DIR=/path/to/your/copy npm run db:seed
```

The seed replaces the database in one transaction after checking every collection's row count against the manifest in that folder, so change values rather than the number of rows, or update the manifest as well. The running app reads the new rows on the next request. A reviewer can use this to check that a changed alert, window or thread moves the board and the record together.

All names, messages and events in the bundled dataset are fictional. The starter uses Bahn's birch, asphalt and sand colours and loads Unbounded, Poppins and Reddit Mono from Google Fonts as the brand's published fallback faces, falling back to Arial without a network. It does not bundle licensed brand fonts or copy Portal screens.
