"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CircleCheck, CircleX, Loader2, Pencil, ShieldCheck, Undo2, X } from "lucide-react";
import type { Proposal, QueueItem, WhoPays } from "@/lib/ui/contract";
import { decideProposal, undoDecision } from "@/lib/ui/api";
import { APPROVAL_LABEL, DESK_LABEL, WHO_PAYS_LABEL, money, when } from "@/lib/ui/present";
import { useClock, useDesk } from "../providers";
import styles from "./decision.module.css";

type Mode = "idle" | "edit" | "reject" | "override";

const WHO_PAYS: WhoPays[] = ["BAHN", "CUSTOMER", "DRIVER"];

const TABLE_LABEL: Record<string, string> = {
  travel_reservations: "Booking",
  travel_options: "Ferry quote",
  driver_messages: "Driver chat",
  messages: "Message",
  alerts: "Alert",
  work_items: "Work item",
  incidents: "Incident",
  proofs: "Proof",
  documents: "Document",
  agent_proposals: "Earlier plan",
};

/** Mirrors the backend's rule (lib/shift-watch/checks.ts mayDecide), so the card can say who decides before anyone clicks. */
function mayDecide(p: Proposal, desk: string) {
  if (p.approval === "SHIFT_LEAD") return desk === "ops-shift";
  if (p.approval === "DESK") return desk === p.owner_desk || desk === "ops-shift";
  return true;
}

export function DecisionCard({ proposal, title, item }: { proposal: Proposal; title: string; item?: QueueItem }) {
  if (proposal.review) return <Outcome proposal={proposal} />;
  return <Pending proposal={proposal} title={title} item={item} />;
}

/* ---------- After a decision: the undo window, then what actually happened ---------- */

function Outcome({ proposal: p }: { proposal: Proposal }) {
  const router = useRouter();
  const { now, ready } = useClock();
  const { desk } = useDesk();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = p.review!;
  const effect = Date.parse(r.takes_effect_at);
  const open = !r.settled_at && (!ready || now < effect);
  const rejected = r.decision === "REJECTED";

  // Once the undo window closes, read the result back from the backend.
  useEffect(() => {
    if (r.settled_at) return;
    const wait = Math.max(0, effect - now) + 1200;
    const id = setTimeout(() => router.refresh(), wait);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.settled_at, effect, router]);

  const undo = async () => {
    setBusy(true);
    const res = await undoDecision(p.id, desk);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };

  const failed = p.status === "FAILED";
  const state = failed ? "rejected" : rejected ? "rejected" : "approved";
  const heading = open ? (rejected ? "Rejected" : "Approved") : failed ? "Didn't go through" : rejected ? "Back with a person" : p.execution ? "Done" : "On it";
  const who = DESK_LABEL[r.reviewer as keyof typeof DESK_LABEL] ?? r.reviewer;
  const refs = p.execution?.references.filter((x) => x.kind === "ferry_booking") ?? [];

  return (
    <section className={styles.card} data-state={state} aria-live="polite">
      <div className={styles.outcome}>
        <span className={styles.outcomeIcon}>
          {failed ? <CircleX size={22} strokeWidth={1.8} /> : rejected ? <Undo2 size={22} strokeWidth={1.8} /> : <CircleCheck size={22} strokeWidth={1.8} />}
        </span>
        <div>
          <h2 className={styles.outcomeTitle}>{heading}</h2>
          <p className={styles.outcomeMeta}>
            {who} · {when(r.at, now)}
            {r.who_pays ? ` · ${WHO_PAYS_LABEL[r.who_pays]} pays` : ""}
            {r.decision === "EDITED" ? " · with changes" : ""}
          </p>
        </div>
        {open && (
          <button type="button" className={styles.undo} onClick={undo} disabled={busy}>
            <Undo2 size={16} strokeWidth={1.8} aria-hidden="true" />
            Undo{ready ? ` · ${Math.max(0, Math.ceil((effect - now) / 1000))}s` : ""}
          </button>
        )}
      </div>

      <p className={styles.summaryText}>{p.summary}</p>

      {open ? (
        <p className={styles.nextText}>
          {rejected
            ? "Nothing was booked or sent. You can take it back until the timer runs out."
            : "Nothing is booked or sent until the timer runs out. Undo if you change your mind."}
        </p>
      ) : p.execution ? (
        <>
          <p className={styles.nextText}>{p.execution.result_summary}</p>
          {refs.map((x) => (
            <p key={x.value} className={styles.reference}>
              Booked · {x.value}
            </p>
          ))}
          {p.execution.next_steps.length > 0 && (
            <>
              <h3 className={styles.nextTitle}>What happens next</h3>
              <ol className={styles.steps}>
                {p.execution.next_steps.map((s, i) => (
                  <li key={s} className={styles.step} data-state="next">
                    <span className={styles.stepIcon} aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      ) : rejected ? (
        <p className={styles.nextText}>
          {r.note ? `Your reason: ${r.note}. ` : ""}Nothing was booked or sent. The order stays with a person.
        </p>
      ) : (
        <p className={styles.nextText}>
          <Loader2 size={15} strokeWidth={2.4} className={styles.spin} aria-hidden="true" /> Carrying it out…
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/* ---------- Waiting for a decision ---------- */

function Pending({ proposal, title, item }: { proposal: Proposal; title: string; item?: QueueItem }) {
  const router = useRouter();
  const { now } = useClock();
  const { desk } = useDesk();
  const [mode, setMode] = useState<Mode>("idle");
  const [whoPays, setWhoPays] = useState<WhoPays | null>(proposal.cost?.who_pays ?? null);
  const [note, setNote] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paysRef = useRef<HTMLFieldSetElement>(null);

  const held = proposal.status === "HELD";
  const hasCost = !!proposal.cost && proposal.cost.amount_minor > 0;
  const allowed = mayDecide(proposal, desk);
  const reasons = proposal.check?.reasons ?? [];

  const send = async (decision: "APPROVED" | "EDITED" | "REJECTED", extraNote?: string) => {
    if (decision !== "REJECTED" && hasCost && !whoPays) {
      setHint("Pick who pays first.");
      paysRef.current?.querySelector("input")?.focus();
      return;
    }
    if (decision === "REJECTED" && !note.trim() && !extraNote) {
      setHint("Say why, so the next person knows.");
      return;
    }
    setBusy(true);
    setError(null);
    const changed = proposal.before_after.map((row) => ({ ...row, after: edits[row.label] ?? row.after }));
    const res = await decideProposal(proposal.id, {
      decision,
      reviewer: desk,
      note: [extraNote, note.trim()].filter(Boolean).join(". ") || undefined,
      ...(decision !== "REJECTED" && whoPays ? { who_pays: whoPays } : {}),
      ...(decision === "EDITED" ? { final_payload: { before_after: changed } } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMode("idle");
    router.refresh();
  };

  return (
    <section className={styles.card} data-state={held ? "held" : "pending"} aria-labelledby="decision-title">
      <div className={styles.top}>
        <span className={styles.kicker}>{held ? "Held back" : "Agent's plan"}</span>
        <span className={styles.approval}>
          {APPROVAL_LABEL[proposal.approval]} · {DESK_LABEL[proposal.owner_desk]}
        </span>
      </div>

      <h2 id="decision-title" className={styles.summaryBig} data-long={title.length > 90 || undefined}>
        {title}
      </h2>

      {(item?.stopped_because || item?.if_no_decision) && (
        <dl className={styles.context}>
          {item.stopped_because && (
            <div>
              <dt>Why you</dt>
              <dd>{item.stopped_because}</dd>
            </div>
          )}
          {item.if_no_decision && (
            <div>
              <dt>If nobody decides</dt>
              <dd>{item.if_no_decision}</dd>
            </div>
          )}
        </dl>
      )}

      <details className={styles.check} data-outcome={proposal.check?.outcome ?? "PASS"}>
        <summary className={styles.checkHead}>
          {held ? <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" /> : <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />}
          {held ? reasons[0]?.message ?? "Shift Watch held this for a person." : "Passed Shift Watch's checks"}
        </summary>
        <div className={styles.why}>
          <p>{proposal.rationale}</p>
          {reasons.length > 0 && (
            <ul>
              {reasons.map((r) => (
                <li key={r.check + r.message}>{r.message}</li>
              ))}
            </ul>
          )}
          {proposal.evidence_refs.length > 0 && (
            <p className={styles.evidence}>
              <span className={styles.evidenceLabel}>Based on</span>
              {proposal.evidence_refs.map((e) => (
                <span key={e.id} className={styles.evidenceChip} title={`${e.table} · ${e.id}`}>
                  {TABLE_LABEL[e.table] ?? e.table}
                  {e.observed_at ? ` · ${when(e.observed_at, now)}` : ""}
                  {e.mock && <span className={styles.mock}>made up</span>}
                </span>
              ))}
            </p>
          )}
        </div>
      </details>

      {proposal.before_after.length > 0 && (
        <dl className={styles.change}>
          {proposal.before_after.map((row) => (
            <div key={row.label} className={styles.changeRow}>
              <dt>{row.label}</dt>
              <dd className={styles.before}>
                <span className="visually-hidden">Now: </span>
                {row.before}
              </dd>
              <dd className={styles.changeArrow} aria-hidden="true">
                <ArrowRight size={15} strokeWidth={1.8} />
              </dd>
              <dd className={styles.after}>
                <span className="visually-hidden">After: </span>
                {mode === "edit" ? (
                  <input
                    className={styles.editInput}
                    value={edits[row.label] ?? row.after}
                    onChange={(e) => setEdits({ ...edits, [row.label]: e.target.value })}
                    aria-label={`${row.label}, after the change`}
                  />
                ) : (
                  (edits[row.label] ?? row.after)
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {hasCost && mode !== "reject" && (
        <fieldset className={styles.pays} ref={paysRef}>
          <legend className={styles.paysLegend}>
            Who pays {money(proposal.cost!.amount_minor, proposal.cost!.currency)}?
            {hint && (
              <span className={styles.paysHint} role="alert">
                {hint}
              </span>
            )}
          </legend>
          {proposal.cost!.note && <p className={styles.costNote}>{proposal.cost!.note}</p>}
          <div className={styles.paysOptions}>
            {WHO_PAYS.map((w) => (
              <label key={w} className={styles.paysOption}>
                <input
                  type="radio"
                  name={`pays-${proposal.id}`}
                  value={w}
                  checked={whoPays === w}
                  onChange={() => {
                    setWhoPays(w);
                    setHint(null);
                  }}
                />
                <span>{WHO_PAYS_LABEL[w]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {(mode === "reject" || mode === "edit") && (
        <label className={styles.noteField}>
          <span>
            {mode === "reject" ? "Why not?" : "Note (optional)"}
            {mode === "reject" && hint && (
              <span className={styles.paysHint} role="alert">
                {hint}
              </span>
            )}
          </span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </label>
      )}

      {mode === "override" && (
        <p className={styles.override} role="alert">
          <AlertTriangle size={18} strokeWidth={1.8} aria-hidden="true" />
          Approve anyway? Your name goes on it.
        </p>
      )}

      {!allowed ? (
        <p className={styles.notYours}>
          {proposal.approval === "SHIFT_LEAD" ? "Only the shift lead decides this." : `${DESK_LABEL[proposal.owner_desk]} or the shift lead decides this.`}{" "}
          You&apos;re signed in as {DESK_LABEL[desk]}.
        </p>
      ) : (
        <div className={styles.actions}>
          {held ? (
            mode === "override" ? (
              <>
                <button type="button" className={styles.danger} disabled={busy} onClick={() => send("APPROVED", "Approved despite Shift Watch's hold")}>
                  Yes, approve
                </button>
                <button type="button" className={styles.secondary} onClick={() => setMode("idle")}>
                  Cancel
                </button>
              </>
            ) : mode === "reject" ? (
              <>
                <button type="button" className={styles.primary} disabled={busy} onClick={() => send("REJECTED")}>
                  Reject
                </button>
                <button type="button" className={styles.secondary} onClick={() => setMode("idle")}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className={styles.primary} onClick={() => setMode("reject")}>
                  <X size={18} strokeWidth={1.8} aria-hidden="true" />
                  Reject
                </button>
                <button type="button" className={styles.ghost} onClick={() => setMode("override")}>
                  Approve anyway
                </button>
              </>
            )
          ) : mode === "reject" ? (
            <>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => send("REJECTED")}>
                Reject
              </button>
              <button type="button" className={styles.secondary} onClick={() => setMode("idle")}>
                Cancel
              </button>
            </>
          ) : mode === "edit" ? (
            <>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => send("EDITED")}>
                Approve changes
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setEdits({});
                  setMode("idle");
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => send("APPROVED")}>
                {busy ? <Loader2 size={20} strokeWidth={2} className={styles.spin} aria-hidden="true" /> : <Check size={20} strokeWidth={2} aria-hidden="true" />}
                Approve
              </button>
              {proposal.before_after.length > 0 && (
                <button type="button" className={styles.secondary} onClick={() => setMode("edit")}>
                  <Pencil size={18} strokeWidth={1.8} aria-hidden="true" />
                  Edit
                </button>
              )}
              <button type="button" className={styles.ghost} onClick={() => setMode("reject")}>
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
                Reject
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
