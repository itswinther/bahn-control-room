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
  change_fee_minor: number
  currency: string
}

type FerryFixture = { cached_checked_at: string; options: FerryOption[] }

// CD-420603 has no ferry quotes in the dataset. The cached list is dated 07:10, when the operator
// wrote that they were checking the next sailing. The 22:00 crossing keeps the 23 Oct promise; the
// next-morning one arrives too late and is there as the priced fallback.
const FERRY: Record<string, FerryFixture> = {
  "ord-00603": {
    cached_checked_at: "2026-10-21T07:10:00Z",
    options: [
      { id: "opt_mock_603_2200", provider: "Vela Coast Lines", departs_at: "2026-10-21T22:00:00Z", check_in_cutoff_at: "2026-10-21T20:00:00Z", arrives_at: "2026-10-23T04:00:00Z", vehicle_space: true, change_fee_minor: 4500, currency: "EUR" },
      { id: "opt_mock_603_0800", provider: "Vela Coast Lines", departs_at: "2026-10-22T08:00:00Z", check_in_cutoff_at: "2026-10-22T06:00:00Z", arrives_at: "2026-10-23T14:00:00Z", vehicle_space: true, change_fee_minor: 4500, currency: "EUR" },
    ],
  },
}

export function ferryCapacity(orderId: string, refresh: boolean, nowIso: string) {
  const fixture = FERRY[orderId]
  if (!fixture) return { mock: true, checked_at: nowIso, options: [] as FerryOption[], note: "No ferry data for this order in the demo fixtures." }
  return {
    mock: true,
    source: refresh ? "fresh check with the carrier" : "cached list",
    checked_at: refresh ? nowIso : fixture.cached_checked_at,
    options: fixture.options,
  }
}

/** Hours the driver can rest before a check-in cutoff. Six hours or more counts as enough for the demo. */
export function driverRest(driverId: string, checkInCutoffAt: string, nowIso: string) {
  const hours = (Date.parse(checkInCutoffAt) - Date.parse(nowIso)) / 3_600_000
  const restHours = Math.max(0, Math.round((hours - 1) * 10) / 10) // keep an hour for the drive to the gate
  return {
    mock: true,
    driver_id: driverId,
    rest_hours_before_check_in: restHours,
    fits: restHours >= 6,
    note: restHours >= 6 ? "Enough time to rest before check-in." : "Too little rest before check-in.",
  }
}
