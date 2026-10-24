"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Eye, X } from "lucide-react";
import type { CaseResponse, ChatAction, ChatEvent, QueueResponse } from "@/lib/contract";
import { decideProposal, runAgent } from "@/lib/ui/api";
import { useDesk, usePanel } from "./providers";
import styles from "./shift-watch.module.css";

type Lookup = { summary: string; order_ids: string[] };
type Watch = { id: number; role: "watch"; text: string; lookups: Lookup[]; actions: ChatAction[]; error: string | null; done: boolean; offline?: boolean };
type Msg = { id: number; role: "user"; text: string } | Watch | { id: number; role: "context"; text: string };

let nextId = 1;

const refOf = (orderId: string) => `CD-42${orderId.slice(-4)}`;

const suggestions = (orderId: string | null) =>
  orderId
    ? ["What's going on here?", "What did the agent already check?", "What happens if I approve?"]
    : ["What needs me now?", "Anything on safety?", "Which desk is busiest?"];

/** Without an API key the chat can't run; answer from the records instead, and say so. */
async function offlineAnswer(orderId: string | null): Promise<string> {
  if (orderId) {
    const res = await fetch(`/api/cases/${orderId}`, { cache: "no-store" });
    if (res.ok) {
      const c = (await res.json()) as CaseResponse;
      const open = c.proposals.find((p) => p.status === "PENDING_REVIEW" || p.status === "HELD");
      return [
        `${c.view.header.reference}: ${c.view.story.headline}`,
        c.status ? `Agent: ${c.status.summary}` : "The agent hasn't worked on this order yet.",
        open ? `Waiting for a person: ${open.summary}` : "Nothing waiting for a decision.",
      ].join("\n");
    }
  }
  const q = (await (await fetch("/api/queue", { cache: "no-store" })).json()) as QueueResponse;
  return [...q.summary, "", ...q.items.slice(0, 3).map((i) => `• ${i.reference}: ${i.decision}`)].join("\n");
}

export function ShiftWatchPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const orderId = pathname.startsWith("/cases/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : null;
  const { open, attr, setOpen, pending, consume } = usePanel();
  const { desk } = useDesk();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [acted, setActed] = useState<Record<string, string>>({});
  const scroller = useRef<HTMLDivElement>(null);
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
        const answer = await offlineAnswer(orderId);
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
            <span className={styles.subDot} aria-hidden="true" />
            On all 100 orders
          </p>
        </div>
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close Shift Watch">
          <X size={20} strokeWidth={1.6} />
        </button>
      </div>

      <p className={styles.context}>
        <span className={styles.contextDot} aria-hidden="true" />
        Open: <strong>{contextLabel}</strong>
      </p>

      {/* Announce each answer once it's complete, not every streamed chunk. */}
      <p className="visually-hidden" aria-live="polite">
        {lastComplete}
      </p>

      <div className={styles.messages} ref={scroller}>
        {msgs.length === 0 && (
          <div className={styles.intro}>
            <p className={styles.introBig}>Ask me anything on the board</p>
            <p>
              Any order, driver or desk. Agents&apos; plans pass through me before you see them, and only you approve.
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
