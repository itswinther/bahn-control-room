/**
 * Where the screens get their data: Shift Watch's own queue and case builders, called in-process
 * (the same code behind GET /api/queue and GET /api/cases/:orderId), then read out by adapt.ts.
 */
import "server-only";
import { agentMode } from "@/lib/agents/order-agent";
import { buildCase } from "@/lib/shift-watch/case";
import { settleDue } from "@/lib/shift-watch/decide";
import { isTeam } from "@/lib/shift-watch/language";
import { buildQueue } from "@/lib/shift-watch/queue";
import type { CaseView, QueueResponse } from "./contract";
import { adaptCase, adaptQueue } from "./adapt";

const ORDER_ID = /^ord-\d{5}$/;

/** `team`: a country team's view (FI, DK, DE) puts the cards in the language it reads first, after safety. */
export async function getQueue(team?: string | null): Promise<QueueResponse> {
  // Decisions whose undo window has passed take effect before anyone reads the queue.
  await settleDue();
  return adaptQueue(await buildQueue(isTeam(team) ? team : undefined), agentMode());
}

export async function getCase(orderId: string): Promise<CaseView | null> {
  if (!ORDER_ID.test(orderId)) return null;
  await settleDue();
  const raw = await buildCase(orderId);
  return raw ? adaptCase(raw) : null;
}
