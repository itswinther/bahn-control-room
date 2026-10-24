import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import type { QuickReply } from "@/lib/contract"
import { nowIso } from "@/lib/clock"
import { db } from "@/lib/db"
import { bookingOutcome, siteReply } from "@/lib/mocks/replies"
import { loadOrder } from "@/lib/present/load"
import { buildRecordView } from "@/lib/present/record"
import { driverMessages } from "@/lib/schema-ours"
import type { ToolContext, ToolOutput } from "./index"

const fail = (message: string): ToolOutput => ({ result: { error: message }, summary: message, error: true })

// A backstop only: Shift Watch's checks are the real guard. Questions and acknowledgements may go
// out without a person; anything that tells the driver what to do with the car needs a proposal.
export const DRIVING_ADVICE =/\b(restart|re-start|drive on|keep driving|continue driving|carry on|safe to drive|you can drive|turn (it|the engine) (off and on|back on)|reset)\b/i

export const askToolDefs: BetaTool[] = [
  {
    name: "ask_driver",
    description: "Send the order's driver a question or an acknowledgement. Shift Watch checks it before it goes out. Questions need no approval; instructions do (use propose). Offer quick replies so the driver can answer with one tap. The reply wakes you later as a new message.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["QUESTION", "ACK"] },
        text: { type: "string" },
        quick_replies: {
          type: "array",
          items: {
            type: "object",
            properties: { kind: { type: "string", enum: ["YES_NO", "CHOICE", "LOCATION", "PHOTO"] }, label: { type: "string" }, value: { type: "string" } },
            required: ["kind", "label", "value"], additionalProperties: false,
          },
        },
      },
      required: ["kind", "text"], additionalProperties: false,
    },
  },
  {
    name: "ask_site",
    description: "Ask this order's pickup or delivery site about hours, access, keys or a booking. Refused for sites owned by the paying customer. The site may not answer yet.",
    input_schema: {
      type: "object",
      properties: { site_id: { type: "string" }, question: { type: "string" } },
      required: ["site_id", "question"], additionalProperties: false,
    },
  },
  {
    name: "check_booking_outcome",
    description: "Ask the carrier what happened to an earlier booking attempt (for example one that timed out). Do this before any retry.",
    input_schema: {
      type: "object",
      properties: { reference: { type: "string", description: "Booking reference or travel option id of the attempt" } },
      required: ["reference"], additionalProperties: false,
    },
  },
]

type Input = Record<string, unknown>

export async function askDriver(input: Input, ctx: ToolContext): Promise<ToolOutput> {
  const kind = input.kind === "ACK" ? "ACK" : input.kind === "QUESTION" ? "QUESTION" : null
  const text = typeof input.text === "string" ? input.text.trim() : ""
  if (!kind || !text) return fail("kind (QUESTION or ACK) and text are required")
  if (kind === "QUESTION" && !text.includes("?")) return fail("A question needs a question mark. Instructions go in a proposal.")
  if (DRIVING_ADVICE.test(text)) return fail("That reads like an instruction about driving the car. Instructions need a person: put it in a proposal.")
  const loaded = await loadOrder(ctx.orderId)
  if (!loaded) return fail(`No order ${ctx.orderId}`)
  const active = buildRecordView(loaded.bundle).assignments.find((a) => a.status === "IN_PROGRESS" || a.status === "ASSIGNED")
  if (!active?.driver.id) return fail("This order has no active driver to ask.")
  const driverId = active.driver.id
  const id = `dm_${crypto.randomUUID().slice(0, 8)}`
  const quickReplies = Array.isArray(input.quick_replies) ? (input.quick_replies as QuickReply[]) : []
  await db.insert(driverMessages).values({
    id, driverId, orderId: ctx.orderId, direction: "OUT", author: "shift-watch", text,
    language: "en", translation: null, quickReplies, hearBackBy: null, simulated: false, status: "PENDING_CHECK", createdAt: nowIso(),
  })
  return {
    result: { queued: true, id, driver_id: driverId, note: "Shift Watch checks the message, then sends it. The driver's reply will wake you as a new message." },
    summary: `Asked the driver (after Shift Watch's check): ${text}`,
  }
}

export async function askSite(input: Input, ctx: ToolContext): Promise<ToolOutput> {
  const siteId = typeof input.site_id === "string" ? input.site_id : ""
  const loaded = await loadOrder(ctx.orderId)
  if (!loaded) return fail(`No order ${ctx.orderId}`)
  const site = [loaded.pickupSite, loaded.deliverySite].find((s) => s?.id === siteId)
  if (!site) return fail(`${siteId} isn't this order's pickup or delivery site.`)
  if (site.customerId === loaded.order.customerId) return fail(`${site.name} belongs to the paying customer. Only a person contacts it: put the question in a proposal.`)
  const reply = siteReply(ctx.orderId, siteId)
  return { result: { site: { id: site.id, name: site.name }, asked: input.question, ...reply, at: nowIso() }, summary: reply.answered ? `${site.name}: ${reply.answer}` : `${site.name}: no answer yet` }
}

export function checkBookingOutcome(input: Input, ctx: ToolContext): ToolOutput {
  const reference = typeof input.reference === "string" ? input.reference : ""
  if (!reference) return fail("reference is required")
  const r = bookingOutcome(ctx.orderId, reference)
  return { result: { ...r, checked_at: nowIso() }, summary: r.found ? `Carrier has a booking for ${reference}` : `Carrier: ${r.detail}` }
}
