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
