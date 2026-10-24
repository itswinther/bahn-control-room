import type { DriverMessage } from "@/lib/contract"

type Intent = NonNullable<DriverMessage["intent"]>
export type Reading = { language: string; intent: Exclude<Intent, "WHICH_CAR">; limit_minutes: number | null; english: string | null }

/** Without a model (replay mode, no key): English only, keyword intents, "N more minutes" limits. */
export function readByRules(text: string): Reading {
  const t = text.toLowerCase()
  const intent: Reading["intent"] =
    // Leans to safety: a false alarm costs a person a minute, a missed one leaves a driver on the hard shoulder.
    /warning (light|lamp)|breakdown|broke(n)? down|\baccident\b|crash|collision|smoke|\bfire\b|burning|injur|hurt|unsafe|not safe|engine (light|fault)|flat (tyre|tire)|puncture|(won'?t|doesn'?t|not) start|brakes?\b|hard shoulder|overheat|unwell|\bsick\b|dizzy|\bhit (a|an)\b|varoitusvalo|moottorivika|onnettomuus|(warn|kontroll)leuchte|unfall|panne|advarselslampe|ulykke/.test(t) ? "SAFETY"
    : /\b(booked|booking|reference|ferry ref|ticket)\b/.test(t) ? "BOOKING_QUESTION"
    : /\b(paid|payout|expense|claim|receipt|reimburse)\b/.test(t) ? "EXPENSE_QUESTION"
    : /\bkeys?\b/.test(t) ? "KEYS_QUESTION"
    : "ORDER"
  // A waiting limit ("30 more minutes", "can wait 20 minutes"), not a delay ("20 minutes late").
  const limit = t.match(/(\d+)\s*more\s*min(ute)?s?\b|\b(?:wait|another|up to)\s*(\d+)\s*min(ute)?s?\b/)
  return { language: "en", intent, limit_minutes: limit ? Number(limit[1] ?? limit[3]) : null, english: null }
}
