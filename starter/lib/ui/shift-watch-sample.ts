/**
 * Sample answers for the Shift Watch panel, built only from the fixtures, until
 * POST /api/shift-watch/chat exists. Every answer cites the records it used.
 */
import type { CaseView, QueueItem, QueueResponse } from "./contract";
import { DESK_LABEL, clock, relative } from "./present";
import queueJson from "@/fixtures/queue.json";
import c055 from "@/fixtures/cases/ord-00055.json";
import c299 from "@/fixtures/cases/ord-00299.json";
import c322 from "@/fixtures/cases/ord-00322.json";
import c347 from "@/fixtures/cases/ord-00347.json";
import c399 from "@/fixtures/cases/ord-00399.json";
import c458 from "@/fixtures/cases/ord-00458.json";
import c593 from "@/fixtures/cases/ord-00593.json";
import c603 from "@/fixtures/cases/ord-00603.json";

const queue = queueJson as unknown as QueueResponse;
const cases = [c055, c299, c322, c347, c399, c458, c593, c603] as unknown as CaseView[];
const byId = Object.fromEntries(cases.map((c) => [c.order.id, c]));
const byRef = Object.fromEntries(cases.map((c) => [c.order.reference, c]));

export interface Answer {
  text: string;
  sources: { label: string; href: string }[];
  actions: {
    label: string;
    href?: string;
    confirm?: string;
    done?: string;
  }[];
}

const HOUR = 3_600_000;

export function suggestions(orderId: string | null): string[] {
  if (orderId && byId[orderId]) {
    const c = byId[orderId];
    const list = ["What's new on this one?", "Why is it stuck here?"];
    if (c.order.driver) list.push("Write the driver an update");
    else list.push("What are we waiting for?");
    return list;
  }
  return ["What's due before 10:00?", "Which desk is swamped?", "Any driver waiting on us?"];
}

export function answer(question: string, orderId: string | null, now: number): Answer {
  const q = question.toLowerCase();
  const refMatch = question.match(/CD-?\s?42\d{4}/i);
  const named = refMatch ? byRef[refMatch[0].toUpperCase().replace(/\s/, "").replace("CD42", "CD-42")] : undefined;
  const c = named ?? (orderId ? byId[orderId] : undefined);

  if (c) return caseAnswer(c, q, now);
  return queueAnswer(q, now);
}

function link(c: CaseView) {
  return { label: `${c.order.reference} · ${c.order.vehicle}`, href: `/cases/${c.order.id}` };
}

function caseAnswer(c: CaseView, q: string, now: number): Answer {
  const active = c.proposals.find((p) => p.status === "PENDING_REVIEW" || p.status === "HELD");
  const deadline = c.status.decision_deadline ? Date.parse(c.status.decision_deadline) : null;
  const due = deadline ? `${clock(deadline)} (${relative(deadline, now)})` : "no deadline";

  if (/driver|message|tell|update|draft/.test(q) && c.order.driver) {
    const draft =
      c.order.id === "ord-00603"
        ? "We're moving you to tomorrow's 02:30 crossing. You can leave the queue. The booking reference follows as soon as it's confirmed. Rest in Travemünde until then."
        : c.order.id === "ord-00593"
          ? "Danke für Ihre Geduld. Wenn das Auto bis 09:25 nicht da ist, buchen wir Ihre Rückfahrt und schicken Ihnen die Buchung."
          : "Thanks for waiting. We're on it and will update you within 15 minutes.";
    return {
      text: `Draft for ${c.order.driver.name.split(" ")[0]}. Booked and not booked are spelled out, and there's nothing to do behind the wheel. It's an instruction, so it needs your yes.\n\n“${draft}”`,
      sources: [link(c)],
      actions: [
        {
          label: "Send to driver",
          confirm: `Send to ${c.order.driver.name.split(" ")[0]} in the driver app?`,
          done: "Sent. Marked as from Shift Watch.",
        },
      ],
    };
  }

  if (/why|stop|held|sent back|stale|check/.test(q)) {
    const sentBack = c.proposals.find((p) => p.status === "SENT_BACK");
    const lines = [c.stop_reason ?? "It's waiting on a person."];
    if (active?.check) lines.push(...active.check.reasons.map((r) => `• ${r}`));
    if (sentBack?.check) lines.push(`Sent back earlier: ${sentBack.check.reasons[0]}`);
    return { text: lines.join("\n"), sources: [link(c)], actions: [] };
  }

  if (/wait|waiting/.test(q)) {
    return {
      text: `${c.status.summary}. ${c.status.next_check_at ? `Next check ${clock(c.status.next_check_at)}.` : ""} ${c.status.waiting_on === "CUSTOMER" ? "Only a person calls the customer. Want a draft of what to say?" : ""}`.trim(),
      sources: [link(c)],
      actions: [],
    };
  }

  if (/changed|happen|latest|hour|new/.test(q)) {
    const recent = c.timeline.slice(0, 3).map((e) => `• ${clock(e.at)}, ${e.who}: ${e.translation ?? e.text}`);
    return { text: `New on ${c.order.reference}:\n${recent.join("\n")}`, sources: [link(c)], actions: [] };
  }

  return {
    text: `${c.headline}\n${c.status.summary}. Call by ${due}. Owner: ${c.status.owner_desk ? DESK_LABEL[c.status.owner_desk] : "shift lead"}.${active ? `\nThe plan: ${active.summary}` : ""}`,
    sources: [link(c)],
    actions: active ? [{ label: "Open the decision", href: `/cases/${c.order.id}` }] : [],
  };
}

function queueAnswer(q: string, now: number): Answer {
  const open = queue.items.filter((i) => i.kind !== "WAITING");
  const toSource = (i: QueueItem) => ({ label: `${i.reference} · ${i.vehicle ?? ""}`.trim(), href: `/cases/${i.order_id}` });

  if (/desk|busy|busiest|load|overload/.test(q)) {
    const counts = new Map<string, QueueItem[]>();
    for (const i of open) counts.set(i.owner_desk, [...(counts.get(i.owner_desk) ?? []), i]);
    const ranked = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
    const [top, items] = ranked[0];
    const soon = items.filter((i) => i.deadline && Date.parse(i.deadline) - now < HOUR).length;
    return {
      text: `${DESK_LABEL[top as keyof typeof DESK_LABEL]}: ${items.length} open, ${soon} due this hour. Worth lending them someone until 09:30.\n${ranked
        .map(([d, l]) => `• ${DESK_LABEL[d as keyof typeof DESK_LABEL]}: ${l.length}`)
        .join("\n")}`,
      sources: items.slice(0, 4).map(toSource),
      actions: [],
    };
  }

  if (/driver/.test(q)) {
    const waiting = queue.items.filter((i) => i.kind === "DRIVER_WAITING");
    return {
      text: waiting.length
        ? waiting.map((i) => `• ${i.reference}: ${i.title} Limit ${i.deadline ? clock(i.deadline) : "not stated"}.`).join("\n")
        : "No driver is waiting on us.",
      sources: waiting.map(toSource),
      actions: waiting[0] ? [{ label: `Open ${waiting[0].reference}`, href: `/cases/${waiting[0].order_id}` }] : [],
    };
  }

  if (/held|caught|stopped|blocked/.test(q)) {
    const held = queue.items.filter((i) => i.kind === "HELD");
    return {
      text: `Holding back ${held.length} plans:\n${held.map((i) => `• ${i.reference}: ${i.title}`).join("\n")}`,
      sources: held.map(toSource),
      actions: [],
    };
  }

  const soon = open
    .filter((i) => i.kind === "SAFETY" || (i.deadline && Date.parse(i.deadline) - now < HOUR))
    .sort((a, b) => (a.kind === "SAFETY" ? -1 : b.kind === "SAFETY" ? 1 : Date.parse(a.deadline!) - Date.parse(b.deadline!)));
  return {
    text: soon.length
      ? `${soon.length} calls this hour, safety first:\n${soon
          .map((i) => `• ${i.deadline ? clock(i.deadline) : ""} ${i.reference}: ${i.title}`)
          .join("\n")}`
      : "Nothing due this hour.",
    sources: soon.map(toSource),
    actions: soon[0] ? [{ label: `Start with ${soon[0].reference}`, href: `/cases/${soon[0].order_id}` }] : [],
  };
}

export function contextLabel(orderId: string | null): string {
  if (orderId && byId[orderId]) return `${byId[orderId].order.reference} · ${byId[orderId].order.vehicle}`;
  return "The queue";
}
