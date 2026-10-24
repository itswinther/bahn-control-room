"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CircleCheck, Loader2, Pencil, RotateCcw, ShieldCheck, Undo2, X } from "lucide-react";
import type { Proposal, WhoPays } from "@/lib/ui/contract";
import { APPROVAL_LABEL, DESK_LABEL, WHO_PAYS_LABEL, clock, money } from "@/lib/ui/present";
import { useClock, useDecisions } from "../providers";
import styles from "./decision.module.css";

type Mode = "idle" | "edit" | "reject" | "override";

const WHO_PAYS: WhoPays[] = ["BAHN", "CUSTOMER", "DRIVER_EXPENSE", "UNDECIDED"];

/** Sample booking references, so the demo shows what a real booking looks like. */
function referenceFor(command: string): string | undefined {
  if (command.includes("ferry")) return "FF-90417";
  if (command.includes("return")) return "DB-55120";
  return undefined;
}

export function DecisionCard({ proposal, title }: { proposal: Proposal; title: string }) {
  const { now } = useClock();
  const { decisions, decide, clear } = useDecisions();
  const decision = decisions[proposal.id];

  const [mode, setMode] = useState<Mode>("idle");
  const [whoPays, setWhoPays] = useState<WhoPays | null>(proposal.cost?.who_pays ?? null);
  const [note, setNote] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [sentBack, setSentBack] = useState(false);
  const steps = proposal.next_steps ?? [];
  const [done, setDone] = useState(decision ? steps.length : 0);
  const paysRef = useRef<HTMLFieldSetElement>(null);

  const held = proposal.status === "HELD";
  const hasCost = !!proposal.cost && proposal.cost.amount_minor > 0;

  // Walk through "what happens next" after an approval, one step at a time.
  useEffect(() => {
    if (!decision || decision.decision === "REJECTED" || done >= steps.length) return;
    const id = setTimeout(() => setDone((d) => d + 1), 900);
    return () => clearTimeout(id);
  }, [decision, done, steps.length]);

  const approve = (kind: "APPROVED" | "EDITED" = "APPROVED", extraNote?: string) => {
    if (hasCost && !whoPays) {
      setHint("Pick who pays first.");
      paysRef.current?.querySelector("input")?.focus();
      return;
    }
    setDone(0);
    decide(proposal.id, {
      decision: kind,
      at: now,
      whoPays,
      note: extraNote ?? (note || undefined),
      edits: kind === "EDITED" ? edits : undefined,
      reference: referenceFor(proposal.command),
    });
    setMode("idle");
  };

  const reject = () => {
    decide(proposal.id, { decision: "REJECTED", at: now, note: note || undefined });
    setMode("idle");
  };

  /* ---------- After a decision ---------- */

  if (decision) {
    const rejected = decision.decision === "REJECTED";
    const finished = !rejected && done >= steps.length;
    return (
      <section className={styles.card} data-state={rejected ? "rejected" : "approved"} aria-live="polite">
        <div className={styles.outcome}>
          <span className={styles.outcomeIcon}>
            {rejected ? <Undo2 size={22} strokeWidth={1.8} /> : <CircleCheck size={22} strokeWidth={1.8} />}
          </span>
          <div>
            <h2 className={styles.outcomeTitle}>{rejected ? "Back with the agent" : finished ? "Done" : "On it"}</h2>
            <p className={styles.outcomeMeta}>
              {clock(decision.at)}
              {decision.whoPays ? ` · ${WHO_PAYS_LABEL[decision.whoPays]} pays` : ""}
              {decision.decision === "EDITED" ? " · edited" : ""}
            </p>
          </div>
          <button type="button" className={styles.undo} onClick={clear} title="Clears the decisions made in this demo">
            <RotateCcw size={16} strokeWidth={1.8} aria-hidden="true" />
            Reset demo
          </button>
        </div>

        {rejected ? (
          <p className={styles.nextText}>The agent gets your note. Nothing changes until someone approves a new plan.</p>
        ) : (
          <ol className={styles.steps}>
            {steps.map((s, i) => {
              const state = i < done ? "done" : i === done ? "running" : "waiting";
              return (
                <li key={s} className={styles.step} data-state={state}>
                  <span className={styles.stepIcon} aria-hidden="true">
                    {state === "done" ? (
                      <Check size={14} strokeWidth={2.4} />
                    ) : state === "running" ? (
                      <Loader2 size={14} strokeWidth={2.4} className={styles.spin} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span>
                    {s}
                    {i === 0 && state === "done" && decision.reference && (
                      <span className={styles.reference}>Booked · {decision.reference}</span>
                    )}
                  </span>
                  <span className="visually-hidden">{state}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    );
  }

  /* ---------- Waiting for a decision ---------- */

  return (
    <section className={styles.card} data-state={held ? "held" : "pending"} aria-labelledby="decision-title">
      <div className={styles.top}>
        <span className={styles.kicker}>{held ? "Held back" : "Agent's plan"}</span>
        <span className={styles.approval}>
          {APPROVAL_LABEL[proposal.approval]} · {DESK_LABEL[proposal.owner_desk]}
        </span>
      </div>

      <h2 id="decision-title" className={styles.summaryBig}>
        {title}
      </h2>

      {proposal.check && (
        <details className={styles.check} data-outcome={proposal.check.outcome}>
          <summary className={styles.checkHead}>
            {proposal.check.outcome === "PASS" ? (
              <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
            ) : (
              <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
            )}
            {proposal.check.outcome === "PASS" ? `Checked · ${proposal.check.reasons.length}` : proposal.check.reasons[0]}
          </summary>
          <div className={styles.why}>
            <p>{proposal.summary}</p>
            <ul>
              {proposal.check.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {proposal.evidence_refs.length > 0 && (
              <p className={styles.evidence}>
                {proposal.evidence_refs.map((e) => (
                  <span key={e.id} className={styles.evidenceChip} title={`${e.table} · ${e.id}`}>
                    {e.label ?? e.table} · {clock(e.observed_at)}
                  </span>
                ))}
              </p>
            )}
          </div>
        </details>
      )}

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

      {hasCost && !held && (
        <fieldset className={styles.pays} ref={paysRef}>
          <legend className={styles.paysLegend}>
            Who pays {money(proposal.cost!.amount_minor, proposal.cost!.currency)}?
            {hint && (
              <span className={styles.paysHint} role="alert">
                {hint}
              </span>
            )}
          </legend>
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
          <span>{mode === "reject" ? "Why not?" : "Note (optional)"}</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </label>
      )}

      {mode === "override" && (
        <p className={styles.override} role="alert">
          <AlertTriangle size={18} strokeWidth={1.8} aria-hidden="true" />
          Approve anyway? Your name goes on it.
        </p>
      )}

      <div className={styles.actions}>
        {held ? (
          mode === "override" ? (
            <>
              <button type="button" className={styles.danger} onClick={() => approve("APPROVED", "Approved despite hold")}>
                Yes, approve
              </button>
              <button type="button" className={styles.secondary} onClick={() => setMode("idle")}>
                Cancel
              </button>
            </>
          ) : sentBack ? (
            <p className={styles.sentBack}>
              <Check size={18} strokeWidth={2} aria-hidden="true" />
              Sent back. Nothing gets booked meanwhile.
            </p>
          ) : (
            <>
              <button type="button" className={styles.primary} onClick={() => setSentBack(true)}>
                Check first
              </button>
              <button type="button" className={styles.ghost} onClick={() => setMode("override")}>
                Approve anyway
              </button>
            </>
          )
        ) : mode === "reject" ? (
          <>
            <button type="button" className={styles.primary} onClick={reject}>
              Send back
            </button>
            <button type="button" className={styles.secondary} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </>
        ) : mode === "edit" ? (
          <>
            <button type="button" className={styles.primary} onClick={() => approve("EDITED")}>
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
            <button type="button" className={styles.primary} onClick={() => approve()}>
              <Check size={20} strokeWidth={2} aria-hidden="true" />
              Approve
            </button>
            <button type="button" className={styles.secondary} onClick={() => setMode("edit")}>
              <Pencil size={18} strokeWidth={1.8} aria-hidden="true" />
              Edit
            </button>
            <button type="button" className={styles.ghost} onClick={() => setMode("reject")}>
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
              Reject
            </button>
          </>
        )}
      </div>

      {!held && steps.length > 0 && (
        <details className={styles.preview}>
          <summary className={styles.previewTitle}>On yes · {steps.length} steps</summary>
          <ol>
            {steps.map((s, i) => (
              <li key={s}>
                <span className={styles.previewNum}>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
