// Mocked outside services for the demo orders: ferry capacity and driver rest.
// Everything here is made up and marked `mock: true` so the screens can label it.
// Deterministic on purpose, so a live run and its replay produce the same results.

export type FerryOption = {
  id: string
  provider: string
  departs_at: string
  check_in_cutoff_at: string
  arrives_at: string
  vehicle_space: boolean
  price_minor: number
  currency: string
}

/** cached_is_real: the cached list comes from the dataset's own travel_options, so only a refresh is mock. */
type FerryFixture = { cached_checked_at: string; cached_is_real?: boolean; options: FerryOption[] }

// CD-420603 has no ferry quotes in the dataset. The cached list is dated 07:10, when the operator
// wrote that they were checking the next sailing. The 22:00 crossing keeps the 23 Oct promise; the
// next-morning one arrives too late and is there as the priced fallback.
const FERRY: Record<string, FerryFixture> = {
  "ord-00603": {
    cached_checked_at: "2026-10-21T07:10:00Z",
    options: [
      { id: "opt_mock_603_2200", provider: "Vela Coast Lines", departs_at: "2026-10-21T22:00:00Z", check_in_cutoff_at: "2026-10-21T20:00:00Z", arrives_at: "2026-10-23T04:00:00Z", vehicle_space: true, price_minor: 39000, currency: "EUR" },
      { id: "opt_mock_603_0800", provider: "Vela Coast Lines", departs_at: "2026-10-22T08:00:00Z", check_in_cutoff_at: "2026-10-22T06:00:00Z", arrives_at: "2026-10-23T14:00:00Z", vehicle_space: true, price_minor: 39000, currency: "EUR" },
    ],
  },
  // CD-420299: the cached list is the dataset's own two quotes from 07:00 (travel_options); the
  // overnight sailing is sold out. Only the fresh check is mock.
  "ord-00299": {
    cached_checked_at: "2026-10-21T07:00:00Z",
    cached_is_real: true,
    options: [
      { id: "travel-xc1d8163d5443a606", provider: "Vela Coast Lines", departs_at: "2026-10-23T22:00:00Z", check_in_cutoff_at: "2026-10-23T20:00:00Z", arrives_at: "2026-10-25T02:00:00Z", vehicle_space: false, price_minor: 0, currency: "EUR" },
      { id: "travel-xf29ed1732d895f37", provider: "Vela Coast Lines", departs_at: "2026-10-24T12:00:00Z", check_in_cutoff_at: "2026-10-24T10:00:00Z", arrives_at: "2026-10-25T16:00:00Z", vehicle_space: true, price_minor: 38700, currency: "EUR" },
    ],
  },
}

export function ferryCapacity(orderId: string, refresh: boolean, nowIso: string) {
  const fixture = FERRY[orderId]
  if (!fixture) return { mock: true, checked_at: nowIso, options: [] as FerryOption[], note: "No ferry data for this order in the demo fixtures." }
  return {
    mock: refresh || !fixture.cached_is_real,
    source: refresh ? "fresh check with the carrier" : "cached list",
    checked_at: refresh ? nowIso : fixture.cached_checked_at,
    options: fixture.options,
  }
}

/** Hours the driver can rest between reaching the terminal and the cutoff. Six or more counts as enough for the demo. */
export function driverRest(driverId: string, checkInCutoffAt: string, availableFrom: string) {
  const hours = (Date.parse(checkInCutoffAt) - Date.parse(availableFrom)) / 3_600_000
  const restHours = Math.max(0, Math.round((hours - 1) * 10) / 10) // keep an hour for the drive to the gate
  return {
    mock: true,
    driver_id: driverId,
    rest_hours_before_check_in: restHours,
    fits: restHours >= 6,
    note: restHours >= 6 ? "Enough time to rest before check-in." : "Too little rest before check-in.",
  }
}

/**
 * Book a ferry option (mock). The key makes it idempotent: the same key always returns the same
 * booking, so a retry after a timeout can't book twice.
 */
// shortcut: kept in memory, so a server restart forgets keys; a real carrier API keeps them server-side.
// On globalThis so every route sees the same store, as with the demo clock.
const store = globalThis as { __mockBookings?: Map<string, { reference: string; option: FerryOption }> }
const bookings = (store.__mockBookings ??= new Map())
export const clearBookings = () => bookings.clear()
export function bookFerry(orderId: string, optionId: string, key: string, nowIso: string) {
  const done = bookings.get(key)
  if (done) return { mock: true, ok: true as const, ...done, repeated: true }
  const option = ferryCapacity(orderId, true, nowIso).options.find((o) => o.id === optionId)
  if (!option) return { mock: true, ok: false as const, error: `No ferry option ${optionId} for this order.` }
  if (!option.vehicle_space) return { mock: true, ok: false as const, error: `No vehicle space left on the ${option.departs_at.slice(11, 16)} sailing.` }
  const result = { reference: `MOCK-${option.provider.split(" ").map((w) => w[0]).join("")}-${option.departs_at.slice(5, 10).replace("-", "")}${option.departs_at.slice(11, 13)}-${key.slice(-4).toUpperCase()}`, option }
  bookings.set(key, result)
  return { mock: true, ok: true as const, ...result, repeated: false }
}
