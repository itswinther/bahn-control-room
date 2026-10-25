// Shift Watch's pager: sends each page, moves it up the ladder when nobody answers, and holds the mock Slack.
// shortcut: pages and presence live in memory (like the demo clock), so a server restart forgets them; a table when it's real.
import type { Page, PageChannel, PageHop, Person, Presence, SlackFeed } from "@/lib/contract"
import { nowIso } from "@/lib/clock"
import { buildQueue } from "./queue"
import { ACK_WINDOW_MS, PEOPLE, ROOM_BY_DESK, pageNeeds, roomFor, rungTarget, type PageNeed } from "./paging"

type Store = { pages: Map<string, Page>; presence: Map<string, Presence> }
const g = globalThis as { __paging?: Store }
const store = () => (g.__paging ??= { pages: new Map(), presence: new Map() })

export const roster = (): Person[] => PEOPLE.map((p) => ({ ...p, presence: store().presence.get(p.id) ?? p.presence }))

export function setPresence(id: string, presence: Presence): boolean {
  if (!PEOPLE.some((p) => p.id === id)) return false
  store().presence.set(id, presence)
  return true
}

/** Restart the demo: no old page escalates or shows, and everyone is back at their default presence. */
export function resetPaging() {
  g.__paging = undefined
}

const hop = (rung: number, to: { person: Person; channel: PageChannel }, at: string, result: PageHop["result"]): PageHop =>
  ({ rung, person_id: to.person.id, person_name: to.person.name, channel: to.channel, at, result })

/** Page someone about this order now. One page per order, ever, except that safety always gets through. */
export function page(need: PageNeed): Page | null {
  const pages = [...store().pages.values()].filter((p) => p.order_id === need.order_id)
  if (pages.some((p) => p.trigger === need.trigger) || (pages.length && need.trigger !== "SAFETY")) return null
  const to = rungTarget(need.desk, 0, need.trigger, roster())!
  const at = nowIso()
  const p: Page = {
    id: `pg_${crypto.randomUUID().slice(0, 8)}`, ...need, room: roomFor(need.desk), rung: 0, person_id: to.person.id, channel: to.channel,
    sent_at: at, acked_at: null, acked_by: null, ended: null, history: [hop(0, to, at, "SENT")],
  }
  store().pages.set(p.id, p)
  return p
}

function moveOn(p: Page, to: { person: Person; channel: PageChannel }, result: "NO_ANSWER" | "PASSED", at: string) {
  p.history.at(-1)!.result = result
  p.rung += 1
  Object.assign(p, { person_id: to.person.id, channel: to.channel, sent_at: at })
  p.history.push(hop(p.rung, to, at, "SENT"))
}

/** One tick: page the cards that need a person, and move unanswered pages up. Safe to run as often as you like. */
export async function runPager(): Promise<void> {
  const { items } = await buildQueue()
  const now = nowIso()
  for (const need of pageNeeds(now, items)) page(need)
  for (const p of store().pages.values()) {
    if (p.acked_at || p.ended) continue
    // The work got done on the case (decided, answered): nobody else needs waking for it.
    if (!items.some((i) => i.order_id === p.order_id && !i.outcome)) { p.ended = "CARD_CLOSED"; continue }
    if (Date.parse(now) - Date.parse(p.sent_at) < ACK_WINDOW_MS) continue
    const to = rungTarget(p.desk, p.rung + 1, p.trigger, roster())
    if (to) moveOn(p, to, "NO_ANSWER", now)
    else { p.history.at(-1)!.result = "NO_ANSWER"; p.ended = "NO_ONE_LEFT" } // stays on screen as unanswered
  }
}

type Fail = { ok: false; status: number; error: string }
type Result = { ok: true; page: Page } | Fail

function find(id: string, personId: string): Fail | { ok: true; page: Page; person: Person } {
  const page = store().pages.get(id)
  const person = roster().find((p) => p.id === personId)
  if (!page) return { ok: false, status: 404, error: "No such page. It may be from before the demo restarted." }
  if (!person) return { ok: false, status: 400, error: `Nobody called ${personId} is on the roster.` }
  if (page.acked_at) return { ok: false, status: 409, error: `${roster().find((p) => p.id === page.acked_by)?.name} is already on it.` }
  return { ok: true, page, person }
}

/** "I'm on it": the person owns it now. The card stays open until the work is done. */
export function ackPage(id: string, personId: string): Result {
  const found = find(id, personId)
  if (!found.ok) return found
  const { page: p, person } = found
  const at = nowIso()
  Object.assign(p, { acked_at: at, acked_by: person.id })
  p.history.push(hop(p.rung, { person, channel: p.channel }, at, "ACKED"))
  return { ok: true, page: p }
}

/** "Pass it on": the next person on the ladder, now. */
export function passPage(id: string, personId: string): Result {
  const found = find(id, personId)
  if (!found.ok) return found
  const to = rungTarget(found.page.desk, found.page.rung + 1, found.page.trigger, roster())
  if (!to) return { ok: false, status: 409, error: "Nobody left to pass it to: the shift lead has it." }
  moveOn(found.page, to, "PASSED", nowIso())
  return { ok: true, page: found.page }
}

export async function slackFeed(): Promise<SlackFeed> {
  await runPager()
  const pages = [...store().pages.values()].sort((a, b) => a.history[0].at.localeCompare(b.history[0].at))
  return { now: nowIso(), people: roster(), rooms: [...new Set(Object.values(ROOM_BY_DESK))], pages: structuredClone(pages) }
}
