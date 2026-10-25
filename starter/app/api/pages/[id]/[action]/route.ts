import { NextResponse } from "next/server"
import { ackPage, passPage } from "@/lib/shift-watch/pager"

export const runtime = "nodejs"

/** POST /api/pages/:id/ack ("I'm on it") or /api/pages/:id/pass ("Pass it on"), with { person_id }. */
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params
  const body = (await request.json().catch(() => null)) as { person_id?: unknown } | null
  if (action !== "ack" && action !== "pass") return NextResponse.json({ error: "Use /ack or /pass." }, { status: 404 })
  if (typeof body?.person_id !== "string") return NextResponse.json({ error: "Send person_id, such as sara-lindqvist." }, { status: 400 })
  const result = (action === "ack" ? ackPage : passPage)(id, body.person_id)
  return result.ok ? NextResponse.json({ page: result.page }) : NextResponse.json({ error: result.error }, { status: result.status })
}
