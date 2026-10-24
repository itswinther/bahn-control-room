import type { DriverMessage } from "@/lib/contract"

type Intent = NonNullable<DriverMessage["intent"]>
export type Reading = { language: string; intent: Exclude<Intent, "WHICH_CAR">; limit_minutes: number | null; english: string | null }

/** Without a model (replay mode, no key): English only, keyword intents, "N more minutes" limits. */
export function readByRules(text: string): Reading {
  const t = text.toLowerCase()
  const intent: Reading["intent"] =
    /warning light|breakdown|broke down|accident|crash|smoke|injur|unsafe|not safe|engine (light|fault)/.test(t) ? "SAFETY"
    : /\b(booked|booking|reference|ferry ref|ticket)\b/.test(t) ? "BOOKING_QUESTION"
    : /\b(paid|payout|expense|claim|receipt|reimburse)\b/.test(t) ? "EXPENSE_QUESTION"
    : /\bkeys?\b/.test(t) ? "KEYS_QUESTION"
    : "ORDER"
  const limit = t.match(/(\d+)\s*(more\s*)?(min|minutes)\b/)
  return { language: "en", intent, limit_minutes: limit ? Number(limit[1]) : null, english: null }
}
