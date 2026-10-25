import { NextResponse } from "next/server"
import type { Presence } from "@/lib/contract"
import { setPresence } from "@/lib/shift-watch/pager"

export const runtime = "nodejs"

const PRESENCE: Presence[] = ["ACTIVE", "AWAY", "ON_CALL"]

/** Demo control: set someone on the made-up roster active, away or on a call. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { person_id?: unknown; presence?: unknown } | null
  if (typeof body?.person_id !== "string" || !PRESENCE.includes(body.presence as Presence)) {
    return NextResponse.json({ error: `Send person_id and presence (${PRESENCE.join(", ")}).` }, { status: 400 })
  }
  if (!setPresence(body.person_id, body.presence as Presence)) return NextResponse.json({ error: `Nobody called ${body.person_id} is on the roster.` }, { status: 404 })
  return NextResponse.json({ ok: true })
}
