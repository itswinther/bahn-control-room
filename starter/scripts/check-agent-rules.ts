// Self-check for the order agent's code-enforced rules. Run: npx tsx scripts/check-agent-rules.ts
import assert from "node:assert/strict"
import { route } from "../lib/agents/rules"
import { driverRest, ferryCapacity } from "../lib/mocks"
import { bookingOutcome, siteReply } from "../lib/mocks/replies"

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

console.log("agent rules: ok")
