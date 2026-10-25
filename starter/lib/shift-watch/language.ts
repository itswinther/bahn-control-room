// Who speaks what. Bahn's people work in Finland, Denmark and Germany; drivers and dealers write in their own
// language, and a cross-border order can have three. A machine reading is good at words and bad at gaps (it
// filled in "quarter to" as 14:45), so a message in another language goes to the team that reads it, with the
// original beside the English. No database calls here, so the checks can test it.
import type { OrderLoad } from "@/lib/present/load"

export const LANGUAGE_NAME: Record<string, string> = {
  en: "English", fi: "Finnish", sv: "Swedish", da: "Danish", de: "German", fr: "French", nl: "Dutch",
}
export const languageName = (code: string) => LANGUAGE_NAME[code] ?? code

// shortcut: one language per country (Belgium as French, Finland as Finnish); a driver's own messages override it.
const BY_COUNTRY: Record<string, string> = { FI: "fi", SE: "sv", DK: "da", NO: "no", DE: "de", AT: "de", CH: "de", FR: "fr", BE: "fr", NL: "nl" }
export const countryLanguage = (country: string | null | undefined) => (country && BY_COUNTRY[country]) || null

/** Bahn's operations teams, in the order a language is offered to them, and what each reads well besides English. */
export const TEAMS = {
  FI: { name: "Finland team", reads: ["fi", "sv"] },
  DK: { name: "Denmark team", reads: ["da", "sv", "no"] },
  DE: { name: "Germany team", reads: ["de"] },
} as const
export type Team = keyof typeof TEAMS
export const isTeam = (v: unknown): v is Team => typeof v === "string" && v in TEAMS
export const teamFor = (language: string): Team | null =>
  (Object.keys(TEAMS) as Team[]).find((t) => (TEAMS[t].reads as readonly string[]).includes(language)) ?? null

/** A card that needs someone who reads the language: whose words, what's unclear, and which team reads it. */
export type LanguageNeed = { language: string; name: string; team: Team | null; why: string }

export function languageNeed(who: string, language: string, unclear: string[] = []): LanguageNeed | null {
  if (!language || language === "en") return null
  const team = teamFor(language)
  const gaps = unclear.length ? ` Not clear in the message: ${unclear.join("; ")}.` : ""
  const reader = team ? `${TEAMS[team].name} reads it.` : `No team reads ${languageName(language)}: keep replies short and send the English too.`
  return { language, name: languageName(language), team, why: `${who} wrote in ${languageName(language)}; the English is a machine reading.${gaps} ${reader}` }
}

/** The people on an order and the language each most likely reads, with where that comes from. */
export type Party = { role: "driver" | "pickup" | "delivery" | "customer"; name: string; language: string | null; source: string }

export function parties(input: {
  driver?: { name: string; homeCountry: string | null; wrote: string | null } | null
  pickup?: { name: string; country: string | null } | null
  delivery?: { name: string; country: string | null } | null
  customer?: { name: string; country: string | null } | null
}): { parties: Party[]; mixed: boolean } {
  const list: Party[] = []
  const { driver, pickup, delivery, customer } = input
  if (driver) list.push(driver.wrote
    ? { role: "driver", name: driver.name, language: driver.wrote, source: `writes in ${languageName(driver.wrote)}` }
    : { role: "driver", name: driver.name, language: countryLanguage(driver.homeCountry), source: `lives in ${driver.homeCountry ?? "unknown"}; no message yet` })
  for (const [role, p] of [["pickup", pickup], ["delivery", delivery], ["customer", customer]] as const)
    if (p) list.push({ role, name: p.name, language: countryLanguage(p.country), source: `${p.country ?? "unknown"} ${role === "customer" ? "customer" : "address"}` })
  // Mixed: the parties read different languages besides English, as on a German pickup for a Finnish dealer.
  const known = new Set(list.map((p) => p.language).filter((l): l is string => !!l && l !== "en"))
  return { parties: list, mixed: known.size > 1 }
}

/** The parties on a loaded order. `chat`: our driver chat for the order, oldest first; the driver's latest
 *  message there (or in Bahn's threads) says what they write in. */
export function orderParties(loaded: OrderLoad, chat: { direction: string; language: string }[] = []) {
  const active = (loaded.related.work_assignments ?? []).map((r) => r.details)
    .find((d) => ["ASSIGNED", "IN_PROGRESS"].includes(String(d.status)))
  const driver = loaded.drivers.find((d) => d.id === active?.driver_id)
  const wrote = chat.findLast((m) => m.direction === "IN")?.language
    ?? (loaded.messages.findLast((m) => m.authorType === "driver" && m.details.author_id === driver?.id)?.details.language as string | undefined)
  return parties({
    driver: driver ? { name: driver.displayName, homeCountry: driver.homeCountry, wrote: wrote ?? null } : null,
    pickup: loaded.pickupSite ? { name: loaded.pickupSite.name, country: loaded.pickupSite.country } : loaded.pickup ? { name: loaded.pickup.city, country: loaded.pickup.country } : null,
    delivery: loaded.deliverySite ? { name: loaded.deliverySite.name, country: loaded.deliverySite.country } : loaded.delivery ? { name: loaded.delivery.city, country: loaded.delivery.country } : null,
    customer: loaded.customer ? { name: loaded.customer.name, country: loaded.customer.country } : null,
  })
}
