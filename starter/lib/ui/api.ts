/**
 * The screens' writes, straight to the team's routes. Each returns the route's error message as
 * text, so the card can show it in the backend's own words.
 */
import type { DecisionRequest, HeldMessageReview, Page, Presence, Proposal, RunRequest } from "@/lib/contract";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function post<T>(path: string, body: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data: json } : { ok: false, error: json.error ?? `Something went wrong (${res.status}).` };
  } catch {
    return { ok: false, error: "Can't reach the server. Try again." };
  }
}

export const decideProposal = (id: string, req: DecisionRequest) => post<{ proposal: Proposal }>(`/api/proposals/${id}/decision`, req);
export const undoDecision = (id: string, reviewer: string) => post<{ proposal: Proposal }>(`/api/proposals/${id}/undo`, { reviewer });
export const reviewHeldMessage = (id: string, req: HeldMessageReview) => post<unknown>(`/api/driver/messages/${id}/review`, req);
export const undoHeldMessage = (id: string, reviewer: string) => post<unknown>(`/api/driver/messages/${id}/undo`, { reviewer });
export const runAgent = (req: RunRequest) => post<{ run_id: string }>("/api/agents/run", req);
export const driverWrites = (driver_id: string, text: string) =>
  post<{ run_id: string | null }>("/api/driver/messages", { driver_id, text, simulated: true });
export const ackPage = (id: string, person_id: string) => post<{ page: Page }>(`/api/pages/${id}/ack`, { person_id });
export const passPage = (id: string, person_id: string) => post<{ page: Page }>(`/api/pages/${id}/pass`, { person_id });
export const setPresence = (person_id: string, presence: Presence) => post<{ ok: true }>("/api/presence", { person_id, presence });
