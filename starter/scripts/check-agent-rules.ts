// Self-check for the order agent's code-enforced rules. Run: npx tsx scripts/check-agent-rules.ts
import assert from "node:assert/strict"
import { DRIVING_ADVICE, INSTRUCTION, route, tableFor } from "../lib/agents/rules"
import { driverRest, ferryCapacity } from "../lib/mocks"
import { bookingOutcome, siteReply } from "../lib/mocks/replies"
import { mayDecide } from "../lib/shift-watch/checks"
import { readByRules } from "../lib/shift-watch/read"
import { bookFerry } from "../lib/mocks"

assert.deepEqual(route("travel.rebook_ferry"), { approval: "DESK", owner_desk: "ops-travel" })
assert.deepEqual(route("customer.send_update"), { approval: "CUSTOMER_VIA_PERSON", owner_desk: "ops-support" })
assert.deepEqual(route("condition.record_attribution"), { approval: "SHIFT_LEAD", owner_desk: "ops-shift" })
assert.deepEqual(route("recovery.arrange_tow"), { approval: "SHIFT_LEAD", owner_desk: "ops-shift" })
assert.equal(route("unknown.thing").approval, "DESK") // never NONE: lookups aren't proposals

const now = "2026-10-21T09:02:00Z"
assert.equal(ferryCapacity("ord-00603", false, now).checked_at, "2026-10-21T07:10:00Z")
assert.equal(ferryCapacity("ord-00603", true, now).checked_at, now)
assert.equal(ferryCapacity("ord-00001", true, now).options.length, 0)
assert.equal(driverRest("drv-121", "2026-10-21T20:00:00Z", now).fits, true)
assert.equal(driverRest("drv-121", "2026-10-21T12:00:00Z", now).fits, false)

assert.equal(ferryCapacity("ord-00299", false, now).options.find((o) => !o.vehicle_space)?.id, "travel-xc1d8163d5443a606")
assert.equal(ferryCapacity("ord-00299", false, now).mock, false) // real dataset quotes
assert.equal(ferryCapacity("ord-00299", true, now).mock, true)
assert.equal(bookingOutcome("ord-00299", "travel-xf29ed1732d895f37").found, false)
assert.equal(siteReply("ord-00593", "site-001").answered, true)
assert.equal(siteReply("ord-00593", "site-999").answered, false)

assert.equal(tableFor("res-x1082202e8d139d61", "bookings"), "travel_reservations")
assert.equal(tableFor("opt_mock_603_2200", "ferry_capacity_check"), "travel_options")
assert.equal(tableFor("something-else", "notes"), "notes")

assert.ok(DRIVING_ADVICE.test("Try restarting the vehicle once"))
assert.ok(DRIVING_ADVICE.test("Reset the warning light and go"))
assert.ok(!DRIVING_ADVICE.test("We will reset the booking reference"))
assert.ok(INSTRUCTION.test("Please keep the car stopped."))
assert.ok(!INSTRUCTION.test("Are you still at the site?"))
assert.equal(mayDecide({ approval: "SHIFT_LEAD", owner_desk: "ops-shift" }, "ops-travel"), false)
assert.equal(mayDecide({ approval: "DESK", owner_desk: "ops-travel" }, "ops-travel"), true)
assert.equal(mayDecide({ approval: "DESK", owner_desk: "ops-travel" }, "ops-dispatch"), false)
assert.equal(mayDecide({ approval: "DESK", owner_desk: "ops-travel" }, "ops-shift"), true)
const b1 = bookFerry("ord-00603", "opt_mock_603_2200", "prop_test1", now), b2 = bookFerry("ord-00603", "opt_mock_603_2200", "prop_test1", now)
assert.ok(b1.ok && b2.ok && b1.reference === b2.reference && b2.repeated) // same key, same booking
assert.equal(bookFerry("ord-00299", "travel-xc1d8163d5443a606", "prop_test2", now).ok, false) // sold out
assert.equal(readByRules("A red warning light came on").intent, "SAFETY")
assert.equal(readByRules("Is the ferry booked? I have no reference").intent, "BOOKING_QUESTION")
assert.equal(readByRules("I can wait another 30 minutes").limit_minutes, 30)
assert.equal(readByRules("I can stay 30 more minutes").limit_minutes, 30)
assert.equal(readByRules("I will be 20 minutes late").limit_minutes, null)
assert.equal(readByRules("Still in the queue").intent, "ORDER")
for (const t of ["Flat tyre, I'm on the hard shoulder", "The car won't start", "Burning smell from the engine", "Brakes feel spongy",
  "I feel unwell", "Varoitusvalo palaa", "Die Motorkontrollleuchte ist an"]) assert.equal(readByRules(t).intent, "SAFETY", t)
assert.equal(readByRules("I accidentally sent the wrong photo").intent, "ORDER")
assert.equal(readByRules("Still in the queue. Navigation now says 14:20 at check-in.").intent, "ORDER") // the demo line

console.log("agent rules: ok")
