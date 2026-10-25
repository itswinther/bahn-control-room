"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Eye, X } from "lucide-react";
import type { CaseResponse, ChatAction, ChatEvent, QueueResponse } from "@/lib/contract";
import { decideProposal, runAgent } from "@/lib/ui/api";
import { DESK_LABEL, WHO_PAYS_LABEL } from "@/lib/ui/present";
import { useDesk, useFocus, usePanel } from "./providers";
import styles from "./shift-watch.module.css";

type Lookup = { summary: string; order_ids: string[] };
type Watch = { id: number; role: "watch"; text: string; lookups: Lookup[]; actions: ChatAction[]; error: string | null; done: boolean; offline?: boolean };
type Msg = { id: number; role: "user"; text: string } | Watch | { id: number; role: "context"; text: string };

let nextId = 1;

const suggestions = (orderId: string | null) =>
  orderId
    ? ["What's going on here?", "What did the agent already check?", "What happens if I approve?"]
    : ["What needs me now?", "Anything on safety?", "Which desk is busiest?"];

const DESK_NAMES: Record<string, string> = DESK_LABEL;

/** Without an API key the chat can't run; answer from the records instead, by what was asked, and say so. */
async function offlineAnswer(question: string, orderId: string | null, queue: QueueResponse | null): Promise<string> {
  const q = question.toLowerCase();
  if (orderId) {
    const res = await fetch(`/api/cases/${orderId}`, { cache: "no-store" });
    if (res.ok) {
      const c = (await res.json()) as CaseResponse;
      const open = c.proposals.find((p) => p.status === "PENDING_REVIEW" || p.status === "HELD");
      if (/check|look|did/.test(q)) {
        const run = c.runs[0];
        const looked = run ? c.steps.filter((s) => s.run_id === run.id && s.kind === "TOOL_CALL") : [];
        return looked.length
          ? [`The agent's last run on ${c.view.header.reference}:`, ...looked.map((s) => `• ${s.result_summary}`)].join("\n")
          : `The agent hasn't worked on ${c.view.header.reference} yet.`;
      }
      if (/approve|happen|yes/.test(q)) {
        if (!open) return "Nothing is waiting for a decision on this order.";
        return [
          `If you approve: ${open.summary}`,
          ...open.before_after.map((r) => `• ${r.label}: ${r.before} → ${r.after}`),
          open.cost ? `It costs ${(open.cost.amount_minor / 100).toFixed(0)} ${open.cost.currency}; you choose who pays.` : "",
          "You can undo for 10 seconds before anything is booked or sent.",
        ].filter(Boolean).join("\n");
      }
      return [
        `${c.view.header.reference}: ${c.view.story.headline}`,
        c.status ? `Agent: ${c.status.summary}` : "The agent hasn't worked on this order yet.",
        open ? `Waiting for a person: ${open.summary}` : "Nothing waiting for a decision.",
      ].join("\n");
    }
  }
  const board = queue ?? ((await (await fetch("/api/queue", { cache: "no-store" })).json()) as QueueResponse);
  const line = (i: QueueResponse["items"][number]) => `• ${i.reference}: ${i.decision}`;
  if (/safe/.test(q)) {
    const safety = board.items.filter((i) => i.safety);
    return safety.length ? [`${safety.length} safety ${safety.length === 1 ? "call" : "calls"}, shift lead decides:`, ...safety.map(line)].join("\n") : "No safety calls right now.";
  }
  if (/desk|busiest|busy/.test(q)) {
    const soon = board.items.filter((i) => i.deadline && Date.parse(i.deadline) < Date.parse(board.at) + 3_600_000);
    const byDesk = [...new Set(soon.map((i) => i.owner_desk))].map((d) => [d, soon.filter((i) => i.owner_desk === d).length] as const).sort((a, b) => b[1] - a[1]);
    return [board.summary[1], ...byDesk.map(([d, n]) => `• ${DESK_NAMES[d] ?? d}: ${n} due within the hour`)].join("\n");
  }
  return [...board.summary, "", ...board.items.slice(0, 3).map(line)].join("\n");
}

export function ShiftWatchPanel() {
  const router = useRouter();
  const { orderId } = useFocus();
  const { open, attr, setOpen, pending, consume } = usePanel();
  const { desk } = useDesk();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [acted, setActed] = useState<Record<string, string>>({});
  const scroller = useRef<HTMLDivElement>(null);
  // The board as Shift Watch sees it: its own three-line summary and the order references.
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/queue", { cache: "no-store" }).then((r) => r.json()).then((q: QueueResponse) => alive && setQueue(q)).catch(() => {});
    load();
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const refOf = (id: string) => queue?.items.find((i) => i.order_id === id)?.reference ?? id;
  const total = queue ? queue.quiet_count + new Set(queue.items.map((i) => i.order_id)).size : null;
  const lastContext = useRef<string | null>(null);
  const contextLabel = orderId ? refOf(orderId) : "the whole board";

  // Note when the open case changes, so earlier answers keep their context.
  useEffect(() => {
    if (lastContext.current !== null && lastContext.current !== contextLabel && msgs.length > 0) {
      setMsgs((m) => [...m, { id: nextId++, role: "context", text: `Now looking at ${contextLabel}` }]);
    }
    lastContext.current = contextLabel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextLabel]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  // Escape closes the panel where it covers the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && window.matchMedia("(max-width: 1179px)").matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const streaming = msgs.some((m) => m.role === "watch" && !m.done);
  const last = [...msgs].reverse().find((m): m is Watch => m.role === "watch");
  const lastComplete = last?.done ? `Shift Watch: ${last.text}` : "";

  const update = (id: number, f: (w: Watch) => Watch) =>
    setMsgs((all) => all.map((m) => (m.id === id && m.role === "watch" ? f(m) : m)));

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    const history = msgs
      .filter((m): m is Exclude<Msg, { role: "context" }> => m.role !== "context")
      .map((m) => (m.role === "user" ? { role: "operator" as const, text: m.text } : { role: "shift-watch" as const, text: m.text }))
      .filter((h) => h.text);
    const id = nextId++;
    setMsgs((m) => [
      ...m,
      { id: nextId++, role: "user", text: t },
      { id, role: "watch", text: "", lookups: [], actions: [], error: null, done: false },
    ]);
    setInput("");

    try {
      const res = await fetch("/api/shift-watch/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: t, open_order_id: orderId, history }),
      });
      if (res.status === 503) {
        const answer = await offlineAnswer(t, orderId, queue);
        return update(id, (w) => ({ ...w, text: answer, done: true, offline: true }));
      }
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ChatEvent;
          if (e.type === "text") update(id, (w) => ({ ...w, text: w.text + e.text }));
          else if (e.type === "looked_up") update(id, (w) => ({ ...w, lookups: [...w.lookups, { summary: e.summary, order_ids: e.order_ids }] }));
          else if (e.type === "action") update(id, (w) => ({ ...w, actions: [...w.actions, e.action] }));
          else if (e.type === "error") update(id, (w) => ({ ...w, error: e.message }));
        }
      }
      update(id, (w) => ({ ...w, done: true }));
    } catch {
      update(id, (w) => ({ ...w, error: "Shift Watch didn't answer. Try again.", done: true }));
    }
  };

  useEffect(() => {
    if (pending) {
      send(pending);
      consume();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const press = async (key: string, a: ChatAction) => {
    const res =
      a.kind === "DECISION"
        ? await decideProposal(a.proposal_id, { ...a.request, reviewer: desk })
        : await runAgent(a.request);
    setConfirming(null);
    setActed({ ...acted, [key]: res.ok ? (a.kind === "DECISION" ? "Done. You can undo it on the case for a few seconds." : "The agent is on it.") : res.error });
    router.refresh();
  };

  return (
    <aside id="shift-watch" className={styles.panel} data-open={attr} aria-label="Shift Watch" inert={!open}>
      <div className={styles.head}>
        <span className={styles.mark} aria-hidden="true">
          <Eye size={18} strokeWidth={1.8} />
        </span>
        <div className={styles.headText}>
          <h2 className={styles.title}>Shift Watch</h2>
          <p className={styles.sub}>
            {total ? `On all ${total} orders` : "On every order"}
          </p>
        </div>
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close Shift Watch">
          <X size={20} strokeWidth={1.6} />
        </button>
      </div>

      <p className={styles.context}>
        Open: <strong>{contextLabel}</strong>
      </p>

      {/* Announce each answer once it's complete, not every streamed chunk. */}
      <p className="visually-hidden" aria-live="polite">
        {lastComplete}
      </p>

      <div className={styles.messages} ref={scroller}>
        {msgs.length === 0 && (
          <div className={styles.intro}>
            <div className={styles.summary}>
              <p className={styles.summaryLabel}>Right now</p>
              {queue ? queue.summary.map((l) => <p key={l}>{l}</p>) : <p>Reading the board…</p>}
            </div>
            {queue && queue.items.length > 0 && (
              <div className={styles.firstUp}>
                <p className={styles.summaryLabel}>First up</p>
                <ul>
                  {queue.items.slice(0, 3).map((i) => (
                    <li key={i.id}>
                      <Link href={`/cases/${i.order_id}`}>
                        <span>
                          <strong>{i.reference}</strong> {i.decision.replace(/^Held for a person: /, "")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className={styles.introNote}>
              Ask about any order, driver or desk. Agents&apos; plans reach you only after my checks, and only you approve.
            </p>
          </div>
        )}

        {msgs.map((m) => {
          if (m.role === "context") {
            return (
              <p key={m.id} className={styles.divider}>
                {m.text}
              </p>
            );
          }
          if (m.role === "user") {
            return (
              <p key={m.id} className={styles.user}>
                {m.text}
              </p>
            );
          }
          const sources = m.lookups.flatMap((l) => l.order_ids.slice(0, 4)).filter((v, i, all) => all.indexOf(v) === i);
          return (
            <div key={m.id} className={styles.watch}>
              {m.offline && <p className={styles.offline}>Live chat needs an API key. From the records:</p>}
              {!m.text && !m.done && (
                <p className={styles.thinking}>{m.lookups.length ? m.lookups[m.lookups.length - 1].summary : "Looking…"}</p>
              )}
              <Rich text={m.text} />
              {m.error && <p className={styles.offline}>{m.error}</p>}
              {m.done && sources.length > 0 && (
                <div className={styles.sources}>
                  <span className={styles.sourcesLabel}>Sources</span>
                  {sources.map((id) => (
                    <Link key={id} href={`/cases/${id}`} className={styles.source}>
                      {refOf(id)}
                    </Link>
                  ))}
                </div>
              )}
              {m.done && m.actions.length > 0 && (
                <div className={styles.actions}>
                  {m.actions.map((a) => {
                    const key = `${m.id}-${a.label}`;
                    if (acted[key]) {
                      return (
                        <p key={key} className={styles.done}>
                          <Check size={16} strokeWidth={2} aria-hidden="true" />
                          {acted[key]}
                        </p>
                      );
                    }
                    if (confirming === key) {
                      return (
                        <div key={key} className={styles.confirm}>
                          <p>{a.label}?</p>
                          {a.kind === "DECISION" && (
                            <ul className={styles.confirmFacts}>
                              {a.request.who_pays && <li>{WHO_PAYS_LABEL[a.request.who_pays]} pays</li>}
                              {a.request.note && <li>Note: {a.request.note}</li>}
                              <li>You decide as {DESK_LABEL[desk]}. You can undo for 10 seconds.</li>
                            </ul>
                          )}
                          <div>
                            <button type="button" className={styles.action} onClick={() => press(key, a)}>
                              Yes, do it
                            </button>
                            <button type="button" className={styles.actionGhost} onClick={() => setConfirming(null)}>
                              Not now
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button key={key} type="button" className={styles.action} onClick={() => setConfirming(key)}>
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.bottom}>
        {!streaming && (
          <div className={styles.suggestions}>
            {suggestions(orderId).map((s) => (
              <button key={s} type="button" className={styles.suggestion} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="sw-input" className="visually-hidden">
            Ask Shift Watch
          </label>
          <input
            id="sw-input"
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={orderId ? "Ask about this order…" : "Ask about any order…"}
            autoComplete="off"
          />
          <button type="submit" className={styles.send} aria-label="Send" disabled={!input.trim() || streaming}>
            <ArrowUp size={20} strokeWidth={2} />
          </button>
        </form>
        <p className={styles.note}>Shift Watch reads the records. It can&apos;t approve anything; you press the button.</p>
      </div>
    </aside>
  );
}

/** Plain text with line breaks and "• " or "- " bullets; **bold** markers are dropped. */
function Rich({ text }: { text: string }) {
  if (!text) return null;
  const blocks = text.replace(/\*\*/g, "").split("\n");
  return (
    <div className={styles.rich}>
      {blocks.map((line, i) =>
        /^\s*([•\-*]|\d+\.)\s/.test(line) ? (
          <p key={i} className={styles.bullet}>
            {line.replace(/^\s*([•\-*]|\d+\.)\s/, "")}
          </p>
        ) : line.trim() === "" ? (
          <span key={i} className={styles.gap} />
        ) : (
          <p key={i}>{line}</p>
        ),
      )}
    </div>
  );
}
