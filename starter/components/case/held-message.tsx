"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Send, Trash2, Undo2 } from "lucide-react";
import type { DriverMessage } from "@/lib/ui/contract";
import { reviewHeldMessage, undoHeldMessage } from "@/lib/ui/api";
import { clock } from "@/lib/ui/present";
import { useClock, useDesk } from "../providers";
import styles from "./decision.module.css";

/** An agent message to the driver that Shift Watch stopped: a person sends it, edits it or drops it. */
export function HeldMessage({ message }: { message: DriverMessage }) {
  return message.status === "SENT" ? <Sending message={message} /> : <Held message={message} />;
}

function Held({ message }: { message: DriverMessage }) {
  const router = useRouter();
  const { desk } = useDesk();
  const [text, setText] = useState(message.text);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: "SEND" | "DISCARD") => {
    if (action === "SEND" && !text.trim()) return setError("The message is empty.");
    setBusy(true);
    const res = await reviewHeldMessage(message.id, { action, reviewer: desk, ...(action === "SEND" && text !== message.text ? { text } : {}) });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };

  return (
    <section className={styles.card} data-state="held" aria-labelledby={`held-${message.id}`}>
      <div className={styles.top}>
        <span className={styles.kicker}>Held back</span>
        <span className={styles.approval}>Message to the driver · {clock(message.created_at)}</span>
      </div>
      <h2 id={`held-${message.id}`} className={styles.summaryText}>
        <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" /> The driver hasn&apos;t seen this. It tells them what to do, so a person checks it first.
      </h2>
      {editing ? (
        <label className={styles.noteField}>
          <span>Message</span>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus />
        </label>
      ) : (
        <blockquote className={styles.quote}>{text}</blockquote>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => act("SEND")}>
          <Send size={18} strokeWidth={1.8} aria-hidden="true" />
          {text !== message.text ? "Send my version" : "Send"}
        </button>
        {!editing && (
          <button type="button" className={styles.secondary} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button type="button" className={styles.ghost} disabled={busy} onClick={() => act("DISCARD")}>
          <Trash2 size={17} strokeWidth={1.8} aria-hidden="true" />
          Don&apos;t send
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Released by a person: it reaches the driver at created_at, and can be taken back until then. */
function Sending({ message }: { message: DriverMessage }) {
  const router = useRouter();
  const { now, ready } = useClock();
  const { desk } = useDesk();
  const [error, setError] = useState<string | null>(null);
  const at = Date.parse(message.created_at);
  const left = ready ? Math.max(0, Math.ceil((at - now) / 1000)) : null;

  useEffect(() => {
    const id = setTimeout(() => router.refresh(), Math.max(0, at - now) + 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, router]);

  const undo = async () => {
    const res = await undoHeldMessage(message.id, desk);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };

  return (
    <section className={styles.card} data-state="approved" aria-live="polite">
      <div className={styles.outcome}>
        <span className={styles.outcomeIcon}>
          <Send size={20} strokeWidth={1.8} />
        </span>
        <div>
          <h2 className={styles.outcomeTitle}>Sending</h2>
          <p className={styles.outcomeMeta}>Reaches the driver {left != null ? `in ${left}s` : `at ${clock(message.created_at)}`}</p>
        </div>
        <button type="button" className={styles.undo} onClick={undo}>
          <Undo2 size={16} strokeWidth={1.8} aria-hidden="true" />
          Undo
        </button>
      </div>
      <blockquote className={styles.quote}>{message.text}</blockquote>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
