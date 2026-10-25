import { NextResponse } from "next/server"
import { slackFeed } from "@/lib/shift-watch/pager"

export const runtime = "nodejs"

/** The mock Slack: everyone on the roster, the desk rooms, and every page Shift Watch sent. Reading it also runs the pager. */
export async function GET() {
  return NextResponse.json(await slackFeed())
}
