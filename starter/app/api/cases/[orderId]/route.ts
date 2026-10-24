import { NextResponse } from "next/server"
import { buildCase } from "@/lib/shift-watch/case"

export const runtime = "nodejs"

/** One order for the case view: the starter's record plus our proposals, runs, notes and driver chat. */
export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params
  const body = await buildCase(orderId)
  if (!body) return NextResponse.json({ error: "Order not found" }, { status: 404 })
  return NextResponse.json(body)
}
