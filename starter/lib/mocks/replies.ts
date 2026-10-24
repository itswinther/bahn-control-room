// Scripted answers from pickup sites and ferry carriers for the demo orders. All made up,
// all marked mock. Anything not listed here gets "no answer yet", like a phone nobody picks up.

const SITE_REPLIES: Record<string, string> = {
  // CD-420593: the driver is at Velantora Helsinki and the BMW M4 isn't in its release queue.
  "ord-00593:site-001": "Stock team checked the VIN on CD-420593: it isn't on this branch's stock list. They think it was moved to another branch, but can't say which without the customer's stock record.",
  // CD-420299: Tavellor Leipzig needs a signed workshop completion sheet before it releases the keys.
  "ord-00299:site-046": "The workshop completion sheet for the BMW M4 on CD-420299 is signed. The keys will be at the service desk for the Friday 11:00-13:00 slot.",
}

const BOOKING_OUTCOMES: Record<string, { found: boolean; detail: string }> = {
  // CD-420299: the 07:10 booking attempt for the 24 Oct 12:00 sailing timed out with no reference.
  "ord-00299": { found: false, detail: "No booking or hold exists for the 07:10 request. The 24 Oct 12:00 sailing still shows vehicle space at EUR 387." },
}

export function siteReply(orderId: string, siteId: string) {
  const answer = SITE_REPLIES[`${orderId}:${siteId}`]
  return answer ? { mock: true, answered: true, answer } : { mock: true, answered: false, answer: "No answer yet. Try again later." }
}

export function bookingOutcome(orderId: string, reference: string) {
  const outcome = BOOKING_OUTCOMES[orderId]
  return outcome ? { mock: true, reference, ...outcome } : { mock: true, reference, found: false, detail: "The carrier has no record matching this reference." }
}
