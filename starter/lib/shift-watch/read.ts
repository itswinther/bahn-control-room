import Anthropic from "@anthropic-ai/sdk"
import type { DriverMessage } from "@/lib/contract"

type Intent = NonNullable<DriverMessage["intent"]>
/** `unclear`: what the message leaves out or a reader can't be sure of ("no hour given"), never filled in. */
export type Reading = { language: string; intent: Exclude<Intent, "WHICH_CAR">; limit_minutes: number | null; english: string | null; unclear: string[] }

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
  return { language: "en", intent, limit_minutes: limit ? Number(limit[1] ?? limit[3]) : null, english: null, unclear: [] }
}

/** The first reply to a safety message, written by people, in the languages Bahn's drivers write in. `at` is the
 *  driver's local clock ("11:15"), or "11:15 UTC" when the place is unknown. Other languages fall back to a translation. */
export const SAFETY_LINE: Record<string, (at: string, place: string | null) => string> = {
  en: (at, place) => `Thanks for telling us. Please stay somewhere safe. A person is taking over now and will contact you by ${place ? `${at} ${place} time` : at}.`,
  fi: (at, place) => `Kiitos, että kerroit. Pysy turvallisessa paikassa. Ihminen ottaa asian nyt hoitaakseen ja on sinuun yhteydessä viimeistään klo ${at}${place ? ` (paikallista aikaa, ${place})` : ""}.`,
  sv: (at, place) => `Tack för att du hör av dig. Stanna på en säker plats. En person tar över nu och kontaktar dig senast kl. ${at}${place ? ` (lokal tid, ${place})` : ""}.`,
  da: (at, place) => `Tak, fordi du gav besked. Bliv et sikkert sted. En medarbejder tager over nu og kontakter dig senest kl. ${at}${place ? ` (lokal tid, ${place})` : ""}.`,
  de: (at, place) => `Danke für Ihre Nachricht. Bitte bleiben Sie an einem sicheren Ort. Ein Mitarbeiter übernimmt jetzt und meldet sich spätestens um ${at}${place ? ` Uhr (Ortszeit ${place})` : ""}.`,
  fr: (at, place) => `Merci de nous avoir prévenus. Restez dans un endroit sûr. Une personne prend le relais et vous contactera au plus tard à ${at}${place ? ` (heure locale, ${place})` : ""}.`,
}

let client: Anthropic | null = null

/** Live mode: Claude reads the message in any language and lists what it leaves out. */
export async function readByClaude(text: string): Promise<Reading> {
  const response = await (client ??= new Anthropic()).messages.create({
    model: process.env.SHIFT_WATCH_MODEL ?? "claude-sonnet-5-5", max_tokens: 1000, output_config: { effort: "low", format: { type: "json_schema", schema: {
      type: "object", additionalProperties: false, required: ["language", "intent", "limit_minutes", "english", "unclear"],
      properties: {
        language: { type: "string", description: "ISO 639-1 code of the message" },
        intent: {
          type: "string", enum: ["SAFETY", "BOOKING_QUESTION", "EXPENSE_QUESTION", "KEYS_QUESTION", "ORDER"],
          description: "SAFETY: the driver, the car or anyone may be unsafe (warning light, breakdown, accident). BOOKING_QUESTION: the driver asks what is booked or for a booking reference. EXPENSE_QUESTION: the driver asks about a claim or payment. KEYS_QUESTION: the driver asks what to do with the keys. ORDER: anything else, including updates on their progress, delays, a missed time or a problem on the job; these go to the order's agent. A report that mentions a ferry or check-in is ORDER unless it asks what is booked.",
        },
        limit_minutes: { type: ["integer", "null"], description: "Minutes the driver says they can still wait, if stated" },
        english: { type: ["string", "null"], description: "English translation, or null if already English. Translate only what is written: never add an hour, a place or an answer the driver didn't give" },
        unclear: { type: "array", items: { type: "string" }, description: "Anything a decision could hang on that the message leaves out or that you can't read with confidence (slang, dialect, a time with no hour, an unclear yes or no), in a few plain words each, like 'no hour given'. At most two, only gaps that would change what a person does next; not what the order records already say (which ferry, which site). Empty if nothing" },
      },
    } } },
    system: "You read one message from a freelance car-delivery driver to the operations team. Drivers may write casually or in dialect. Classify it; do not answer it, and never guess what it leaves out.",
    messages: [{ role: "user", content: text }],
  })
  const block = response.content.find((b) => b.type === "text")
  if (block?.type !== "text") throw new Error(`No reading (stop reason ${response.stop_reason})`)
  return JSON.parse(block.text) as Reading
}
