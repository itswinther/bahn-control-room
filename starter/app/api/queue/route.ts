import { NextResponse } from "next/server"
import { settleDue } from "@/lib/shift-watch/decide"
import { buildQueue } from "@/lib/shift-watch/queue"

export const runtime = "nodejs"

/** The decision queue on the demo clock: safety first, then earliest deadline; quiet orders counted. */
export async function GET() {
  await settleDue()
  return NextResponse.json(await buildQueue())
}
