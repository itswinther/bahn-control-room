import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import type { ChatEvent, ChatRequest } from "@/lib/contract"
import { chat } from "@/lib/shift-watch/chat"

export const runtime = "nodejs"

/** Operator chat. Streams newline-delimited JSON events (ChatEvent), ending with { type: "done" }. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<ChatRequest> | null
  const history = body?.history ?? []
  if (typeof body?.message !== "string" || !body.message.trim() || body.message.length > 4000
    || !(body.open_order_id === null || body.open_order_id === undefined || typeof body.open_order_id === "string")
    || !Array.isArray(history) || history.some((h) => !h || !["operator", "shift-watch"].includes(h.role) || typeof h.text !== "string")) {
    return NextResponse.json({ error: "Send message (text), open_order_id (an order id or null) and optional history [{ role, text }]" }, { status: 400 })
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Operator chat needs ANTHROPIC_API_KEY in .env. The queue and case view work without it." }, { status: 503 })

  const encoder = new TextEncoder()
  const send = (c: ReadableStreamDefaultController, e: ChatEvent) => c.enqueue(encoder.encode(`${JSON.stringify(e)}\n`))
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of chat({ message: body.message!, open_order_id: body.open_order_id ?? null, history }, request.signal)) send(controller, event)
        send(controller, { type: "done" })
      } catch (error) {
        if (!request.signal.aborted) send(controller, { type: "error", message: error instanceof Anthropic.APIError ? `Claude is unavailable (${error.status ?? "no status"}). Try again.` : "Something went wrong answering that." })
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } })
}
