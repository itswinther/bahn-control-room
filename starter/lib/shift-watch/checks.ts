// Shift Watch's proposal checks. Each comes from a correction Bahn's own people made to their
// agents. Pure functions: they run the same on our agent's proposals and on Bahn's 14 recorded ones.
import type { Approval, Check, CheckName, CheckOutcome, Desk, Proposal } from "@/lib/contract"
import { DRIVING_ADVICE, route } from "@/lib/agents/rules"
import { nowIso } from "@/lib/clock"

export type CheckEvidence = { table: string; id: string; observed_at: string | null }

export type CheckInput = {
  command: string
  summary: string
  payload: Record<string, unknown>
  evidence: CheckEvidence[]
  created_at: string
  /** Earlier actions on this order that failed or timed out, with when they failed. */
  failures?: { at: string; command: string }[]
  /** True if someone checked the outcome of a failed action after it failed. */
  outcomeCheckedSince?: (iso: string) => boolean
}

export type CheckResult = Check & { approval: Approval }

const FRESH_MINUTES = 30

const action = (command: string) => command.split(".")[1] ?? ""
const words = (payload: Record<string, unknown>) => JSON.stringify(payload)

/** Books, buys or rebooks something. Refresh, verify and check commands exist to refresh data, so they don't count. */
export function booksOrBuys(command: string): boolean {
  const a = action(command)
  return /(^|_)(book|rebook|buy|purchase|reserve)(_|$)/.test(a) && !/^(refresh|verify|check)/.test(a)
}

const LOOKUP_KEY = /^(verify|refresh|check|look_for|review|compare)_|^look_for/
const isLookupCommand = (command: string) => /^(refresh|verify|check|compare|review)/.test(action(command)) || command.startsWith("billing.check")

function contactsCustomer(p: CheckInput): boolean {
  if (p.command.startsWith("customer.")) return false // a customer message proposal is fine: a person sends it
  const contact = p.payload.contact
  if (Array.isArray(contact) && contact.includes("customer")) return true
  if (Object.entries(p.payload).some(([k, v]) => /request_customer|notify_customer|tell_customer|ask_customer/.test(k) && v === true)) return true
  return /\b(with|to|tell|ask|contact|notify) the customer\b|\bcustomer approval\b/i.test(p.summary)
}

function hasLookup(p: CheckInput): boolean {
  if (isLookupCommand(p.command)) return true
  const contact = p.payload.contact
  if (Array.isArray(contact) && contact.includes("site")) return true
  return Object.entries(p.payload).some(([k, v]) => LOOKUP_KEY.test(k) && v === true)
}

export function checkProposal(p: CheckInput): CheckResult {
  const reasons: { check: CheckName; message: string; outcome: CheckOutcome }[] = []
  const add = (check: CheckName, outcome: CheckOutcome, message: string) => reasons.push({ check, outcome, message })
  const text = `${p.summary} ${words(p.payload)}`

  // CD-420194: "Do not select a crossing from an unrefreshed list." Missing capacity evidence counts as stale.
  if (booksOrBuys(p.command)) {
    const capacity = p.evidence.filter((e) => e.table === "travel_options")
    const created = Date.parse(p.created_at)
    const fresh = capacity.some((e) => e.observed_at && created - Date.parse(e.observed_at) <= FRESH_MINUTES * 60_000)
    if (!fresh) {
      const ages = capacity.filter((e) => e.observed_at).map((e) => Math.round((created - Date.parse(e.observed_at!)) / 60_000))
      add("fresh_data", "SEND_BACK", ages.length
        ? `A booking needs capacity checked in the last ${FRESH_MINUTES} minutes; the newest check is ${Math.min(...ages)} minutes old.`
        : `A booking needs capacity checked in the last ${FRESH_MINUTES} minutes; none is cited.`)
    }
  }

  // CD-420020: "Keep boarding unconfirmed." Booked or boarded needs a reservation or gate record.
  const claimsBoarded = Object.entries(p.payload).some(([k, v]) => /boarding_confirmed|mark_boarded/.test(k) && v === true) || /\b(has boarded|boarding (is )?confirmed)\b/i.test(p.summary)
  const claimsBooked = Object.entries(p.payload).some(([k, v]) => /booking_confirmed|mark_booked/.test(k) && v === true) || /\b(is|was) (already )?booked\b/i.test(p.summary)
  if (claimsBoarded && !p.evidence.some((e) => e.table === "ferry_terminal_events")) add("quote_not_booking", "SEND_BACK", "Boarding is only confirmed by a gate record, and none is cited.")
  if (claimsBooked && !p.evidence.some((e) => e.table === "travel_reservations")) add("quote_not_booking", "SEND_BACK", "Something is called booked without a reservation record.")

  // CD-420055: photos show a condition, "not when or by whom".
  const blames = Object.entries(p.payload).some(([k, v]) => /attribution|fault|liab/.test(k) && typeof v === "string") || /\bdriver (caused|damaged|is (at fault|responsible))\b/i.test(p.summary)
  if (blames) add("no_blame", "HOLD", "Only a person decides who caused damage.")

  // CD-420322: "Remove restart advice."
  const advises = DRIVING_ADVICE.test(text) || Object.entries(p.payload).some(([k, v]) => /authori[sz]e_(restart|driving|drive)/.test(k) && v === true)
  if (advises) add("no_driving_advice", "SEND_BACK", "Don't tell the driver to drive, restart or diagnose the car.")

  // CD-420299: a booking timed out with no reference. Don't retry before its outcome is checked.
  if (booksOrBuys(p.command)) {
    const open = (p.failures ?? []).filter((f) => booksOrBuys(f.command) && Date.parse(f.at) < Date.parse(p.created_at) && !p.outcomeCheckedSince?.(f.at))
    if (open.length) add("no_blind_retry", "HOLD", `An earlier booking attempt (${open[0].at.slice(11, 16)}) failed or timed out, and nobody has checked its outcome.`)
  }

  // The brief: the agent never contacts a customer. And one approval per proposal, so lookups don't wait.
  const customer = contactsCustomer(p)
  if (customer && hasLookup(p)) {
    add("one_step_per_approval", "SEND_BACK", "Split it: run the lookups now, and put the customer step in its own proposal for a person to send.")
    add("contact_rules", "SEND_BACK", "The customer is contacted only by a person.")
  } else if (customer) {
    add("contact_rules", "HOLD", "The customer is contacted only by a person: hold this as a draft.")
  }

  const outcome: CheckOutcome = reasons.some((r) => r.outcome === "HOLD") ? "HOLD" : reasons.some((r) => r.outcome === "SEND_BACK") ? "SEND_BACK" : "PASS"
  const lookupOnly = isLookupCommand(p.command) && !customer
  return {
    outcome,
    reasons: reasons.map(({ check, message }) => ({ check, message })),
    checked_at: nowIso(),
    approval: lookupOnly ? "NONE" : route(p.command).approval,
  }
}

/** Who may decide each approval level. */
export function mayDecide(p: { approval: Proposal["approval"]; owner_desk: Desk }, reviewer: string): boolean {
  if (p.approval === "SHIFT_LEAD") return reviewer === "ops-shift"
  if (p.approval === "DESK") return reviewer === p.owner_desk || reviewer === "ops-shift"
  return reviewer.startsWith("ops-") // a customer message: any person sends it
}
