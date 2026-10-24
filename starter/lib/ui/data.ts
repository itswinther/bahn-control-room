/**
 * Where the screens get their data. "sample" reads fixtures/; "api" calls the
 * team's routes (GET /api/queue, GET /api/cases/:orderId) once Backend 2 ships them.
 */
import "server-only";
import type { CaseView, QueueResponse } from "./contract";
import queue from "@/fixtures/queue.json";
import c055 from "@/fixtures/cases/ord-00055.json";
import c299 from "@/fixtures/cases/ord-00299.json";
import c322 from "@/fixtures/cases/ord-00322.json";
import c347 from "@/fixtures/cases/ord-00347.json";
import c399 from "@/fixtures/cases/ord-00399.json";
import c458 from "@/fixtures/cases/ord-00458.json";
import c593 from "@/fixtures/cases/ord-00593.json";
import c603 from "@/fixtures/cases/ord-00603.json";

const SOURCE = process.env.NEXT_PUBLIC_DATA_SOURCE === "api" ? "api" : "sample";
const API = process.env.CONTROL_ROOM_API_URL ?? "http://localhost:3000";

const CASES: Record<string, unknown> = {
  "ord-00055": c055,
  "ord-00299": c299,
  "ord-00322": c322,
  "ord-00347": c347,
  "ord-00399": c399,
  "ord-00458": c458,
  "ord-00593": c593,
  "ord-00603": c603,
};

export async function getQueue(): Promise<QueueResponse> {
  if (SOURCE === "api") {
    const res = await fetch(`${API}/api/queue`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Queue failed: ${res.status}`);
    return res.json();
  }
  return queue as unknown as QueueResponse;
}

export async function getCase(orderId: string): Promise<CaseView | null> {
  if (SOURCE === "api") {
    const res = await fetch(`${API}/api/cases/${orderId}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Case failed: ${res.status}`);
    return res.json();
  }
  return (CASES[orderId] as CaseView | undefined) ?? null;
}
