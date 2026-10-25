import { NextRequest, NextResponse } from "next/server"
import { settleDue } from "@/lib/shift-watch/decide"
import { isTeam } from "@/lib/shift-watch/language"
import { buildQueue } from "@/lib/shift-watch/queue"

export const runtime = "nodejs"

/** The decision queue on the demo clock: safety first, then earliest deadline; quiet orders counted.
 *  `?team=FI|DK|DE` puts the cards in that team's language first, after safety. */
export async function GET(request: NextRequest) {
  await settleDue()
  const team = request.nextUrl.searchParams.get("team")
  return NextResponse.json(await buildQueue(isTeam(team) ? team : undefined))
}
