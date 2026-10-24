"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Eye, X } from "lucide-react";
import { answer, contextLabel, suggestions, type Answer } from "@/lib/ui/shift-watch-sample";
import { useClock, usePanel } from "./providers";
import styles from "./shift-watch.module.css";

type Msg =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "watch"; answer: Answer; shown: number }
  | { id: number; role: "context"; text: string };

let nextId = 1;

export function ShiftWatchPanel() {
  const pathname = usePathname();
  const orderId = pathname.startsWith("/cases/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : null;
  const { open, attr, setOpen, pending, consume } = usePanel();
  const { now } = useClock();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const lastContext = useRef<string | null>(null);

  // Note when the open case changes, so earlier answers keep their context.
  useEffect(() => {
    const label = contextLabel(orderId);
    if (lastContext.current !== null && lastContext.current !== label && msgs.length > 0) {
      setMsgs((m) => [...m, { id: nextId++, role: "context", text: `Now looking at ${label}` }]);
    }
    lastContext.current = label;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Reveal answers a few words at a time, like a streamed reply.
  const streaming = msgs.find((m) => m.role === "watch" && m.shown < m.answer.text.length);
  useEffect(() => {
    if (!streaming || streaming.role !== "watch") return;
    const id = setTimeout(() => {
      setMsgs((all) =>
        all.map((m) =>
          m.id === streaming.id && m.role === "watch"
            ? { ...m, shown: Math.min(m.answer.text.length, nextBreak(m.answer.text, m.shown + 14)) }
            : m,
        ),
      );
    }, 28);
    return () => clearTimeout(id);
  }, [streaming]);

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

  const last = [...msgs].reverse().find((m) => m.role === "watch");
  const lastComplete =
    last && last.role === "watch" && last.shown >= last.answer.text.length ? `Shift Watch: ${last.answer.text}` : "";

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const reply = answer(t, orderId, now);
    setMsgs((m) => [
      ...m,
      { id: nextId++, role: "user", text: t },
      { id: nextId++, role: "watch", answer: reply, shown: 0 },
    ]);
    setInput("");
  };

  useEffect(() => {
    if (pending) {
      send(pending);
      consume();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

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
        Open: <strong>{contextLabel(orderId)}</strong>
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
          const complete = m.shown >= m.answer.text.length;
          return (
            <div key={m.id} className={styles.watch}>
              <Rich text={m.answer.text.slice(0, m.shown)} />
              {complete && m.answer.sources.length > 0 && (
                <div className={styles.sources}>
                  <span className={styles.sourcesLabel}>Sources</span>
                  {m.answer.sources.map((s) => (
                    <Link key={s.href + s.label} href={s.href} className={styles.source}>
                      {s.label}
                    </Link>
                  ))}
                </div>
              )}
              {complete && m.answer.actions.length > 0 && (
                <div className={styles.actions}>
                  {m.answer.actions.map((a) => {
                    const key = `${m.id}-${a.label}`;
                    if (done[key]) {
                      return (
                        <p key={key} className={styles.done}>
                          <Check size={16} strokeWidth={2} aria-hidden="true" />
                          {done[key]}
                        </p>
                      );
                    }
                    if (a.href) {
                      return (
                        <Link key={key} href={a.href} className={styles.action}>
                          {a.label}
                        </Link>
                      );
                    }
                    if (confirming === key) {
                      return (
                        <div key={key} className={styles.confirm}>
                          <p>{a.confirm}</p>
                          <div>
                            <button
                              type="button"
                              className={styles.action}
                              onClick={() => {
                                setDone({ ...done, [key]: a.done ?? "Done." });
                                setConfirming(null);
                              }}
                            >
                              Yes, {a.label.toLowerCase()}
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
          <button type="submit" className={styles.send} aria-label="Send" disabled={!input.trim()}>
            <ArrowUp size={20} strokeWidth={2} />
          </button>
        </form>
        <p className={styles.note}>Demo answers. The live Shift Watch plugs in here.</p>
      </div>
    </aside>
  );
}

function nextBreak(text: string, from: number) {
  if (from >= text.length) return text.length;
  const space = text.indexOf(" ", from);
  return space === -1 ? text.length : space;
}

/** Plain text with line breaks and "• " bullets. */
function Rich({ text }: { text: string }) {
  const blocks = text.split("\n");
  return (
    <div className={styles.rich}>
      {blocks.map((line, i) =>
        line.startsWith("• ") ? (
          <p key={i} className={styles.bullet}>
            {line.slice(2)}
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
