// Self-check for who Shift Watch pages. Run: npm run check:paging
import assert from "node:assert/strict"
import type { Person, QueueItem } from "../lib/contract"
import { DROP_OUT, PEOPLE, pageNeeds, rungTarget } from "../lib/shift-watch/paging"
import { hasRecording } from "../lib/agents/model"

const now = "2026-10-21T09:00:00.000Z"
const item = (o: Partial<QueueItem>): QueueItem => ({ id: "q", kind: "LOOSE_END", order_id: "ord-00001", reference: "CD-420001", decision: "x", owner_desk: "ops-travel", deadline: null, deadline_reason: null, safety: false, checked: [], proposal_id: null, held_message_id: null, outcome: null, language: null, driver_waiting_until: null, stopped_because: null, if_no_decision: null, escalated_from: null, ...o })
const needs = (items: QueueItem[]) => pageNeeds(now, items)

// Safety goes to the shift lead; a decided card pages nobody
assert.deepEqual(needs([item({ safety: true })]).map((n) => [n.trigger, n.desk]), [["SAFETY", "ops-shift"]])
assert.equal(needs([item({ safety: true, outcome: {} as never })]).length, 0)
// Due soon: only agent plans or waiting drivers, only inside the next 10 minutes, never already overdue (no page storm at 09:00)
assert.equal(needs([item({ proposal_id: "p1", deadline: "2026-10-21T09:05:00.000Z" })])[0].trigger, "DUE_SOON")
assert.equal(needs([item({ proposal_id: "p1", deadline: "2026-10-21T09:15:00.000Z" })]).length, 0)
assert.equal(needs([item({ proposal_id: "p1", deadline: "2026-10-21T08:55:00.000Z" })]).length, 0)
assert.equal(needs([item({ deadline: "2026-10-21T09:05:00.000Z" })]).length, 0) // Bahn's own work item: no page
assert.equal(needs([item({ escalated_from: "ops-travel" })])[0].desk, "ops-shift")
// One page per order: safety wins over due soon
assert.deepEqual(needs([item({ proposal_id: "p1", deadline: "2026-10-21T09:05:00.000Z" }), item({ safety: true })]).map((n) => n.trigger), ["SAFETY"])

// A driver dropping the job, and the near misses that must not page
const drop = "Sorry, I can't do the Stockholm pickup tomorrow. I won't deliver this car."
for (const t of ["I won't be able to deliver the car.", "I'm dropping this job, sorry", "Please cancel my assignment", "I cannot do this job anymore", "I'm not able to make the pickup", "I will no longer deliver it", drop]) assert.ok(DROP_OUT.test(t), t)
for (const t of ["I can't find the keys", "The ferry won't leave until 14:00", "Can you deliver the papers to me?", "Still in the queue. Navigation now says 14:20 at check-in.", "I can wait another 30 minutes. After that I need a new plan for my travel back.", "Delivered the car, all good", "Who do I deliver the keys to?", "The warning light is still on. I'm parked and waiting."]) assert.ok(!DROP_OUT.test(t), t)

// The ladder: Sara (dispatch) is away by default, so rung 0 is a DM; then her backup, then the shift lead, then nobody
const at = (desk: Person["desk"], rung: number, trigger: Parameters<typeof rungTarget>[2] = "DRIVER_DROPPED") => rungTarget(desk, rung, trigger, PEOPLE)
assert.deepEqual([0, 1, 2].map((r) => [at("ops-dispatch", r)!.person.id, at("ops-dispatch", r)!.channel]), [["sara-lindqvist", "DM"], ["tomas-weber", "DM"], ["mira-aaltonen", "DM"]])
assert.equal(at("ops-dispatch", 3), null)
assert.equal(at("ops-travel", 0, "DUE_SOON")!.channel, "ROOM")
// Safety: straight to the shift lead's phone, then the backup, then the ladder ends (no calls)
assert.deepEqual([0, 1].map((r) => [at("ops-shift", r, "SAFETY")!.person.id, at("ops-shift", r, "SAFETY")!.channel]), [["mira-aaltonen", "DM"], ["jonas-brekke", "DM"]])
assert.equal(at("ops-shift", 2, "SAFETY"), null)
assert.equal(at("ops-intake", 0)!.person.id, "mira-aaltonen") // a desk with nobody on the roster goes to the shift lead

// Replay wakes an agent only when it has a recording
assert.equal(hasRecording("ord-00603", "DRIVER_MESSAGE"), true)
assert.equal(hasRecording("ord-00442", "DRIVER_MESSAGE"), false)
console.log("paging checks passed")
