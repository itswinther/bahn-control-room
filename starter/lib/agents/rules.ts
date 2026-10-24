import type { Approval, Desk } from "@/lib/contract"

const DESK_BY_DOMAIN: Record<string, Desk> = {
  travel: "ops-travel", assignment: "ops-dispatch", offer: "ops-dispatch", driver: "ops-dispatch",
  pickup: "ops-readiness", condition: "ops-evidence", expense: "ops-expenses",
  customer: "ops-support", billing: "ops-support", recovery: "ops-shift",
}

/** Approval comes from the command, never from the agent, so a prompt can't talk its way past it. */
export function route(command: string): { approval: Approval; owner_desk: Desk } {
  const [domain, action = ""] = command.split(".")
  if (domain === "customer") return { approval: "CUSTOMER_VIA_PERSON", owner_desk: "ops-support" }
  if (domain === "recovery" || action.includes("attribution") || action.includes("promise")) return { approval: "SHIFT_LEAD", owner_desk: "ops-shift" }
  return { approval: "DESK", owner_desk: DESK_BY_DOMAIN[domain] ?? "ops-shift" }
}

// The dataset's ids carry their table in the prefix, so the evidence table is set in code. The
// agent tends to name tables after get_order's sections ("bookings", "travel_quotes"), which
// Shift Watch's checks wouldn't recognise.
const TABLE_BY_PREFIX: [string, string][] = [
  ["res-", "travel_reservations"], ["travel-", "travel_options"], ["opt_mock_", "travel_options"],
  ["alert-", "alerts"], ["msg-", "messages"], ["conv-", "conversations"], ["agent-", "agent_proposals"],
  ["work-", "work_items"], ["incident-", "incidents"], ["doc-", "documents"], ["proof-", "proofs"],
  ["ep-", "order_endpoint_details"], ["asg-", "work_assignments"], ["evt-", "operational_events"],
  ["drv-", "drivers"], ["prop_", "proposals"], ["dm_", "driver_messages"],
]

export function tableFor(id: string, fallback: string): string {
  return TABLE_BY_PREFIX.find(([prefix]) => id.startsWith(prefix))?.[1] ?? fallback
}

// Backstops only: Shift Watch's checks are the real guard. Questions and acknowledgements may go
// out without a person; anything that tells the driver what to do with the car needs a proposal.

/** Advice about driving or fixing the car. No trailing \b, so "restarting" matches: Bahn's real mistake was "Try restarting the vehicle". */
export const DRIVING_ADVICE = /\b(restart|re-start|drive on|keep driving|continue driving|carry on|safe to drive|you can drive|turn (it|the engine) (off and on|back on)|reset (it|the (car|engine|ecu|warning|fault|light|system)))/i

/** Telling the driver what to do. Allowed only when repeating an instruction a person already gave. */
export const INSTRUCTION = /\b(please (keep|stay|wait|leave|go|don't|do not)|keep the car|stay (at|where|put)|don't|do not|wait (at|for|here))\b/i
