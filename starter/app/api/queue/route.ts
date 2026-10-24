import { NextResponse } from "next/server"
import { buildQueue } from "@/lib/shift-watch/queue"

export const runtime = "nodejs"

/** The decision queue on the demo clock: safety first, then earliest deadline; quiet orders counted. */
export async function GET() {
  return NextResponse.json(await buildQueue())
}
