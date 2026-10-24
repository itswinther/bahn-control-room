import type { AgentStep, Proposal } from "@/lib/ui/contract";
import { clock } from "@/lib/ui/present";

const STATUS_LABEL: Record<Proposal["status"], string> = {
  PENDING_CHECK: "Waiting for Shift Watch",
  SENT_BACK: "Sent back by Shift Watch",
  HELD: "Held by Shift Watch",
  PENDING_REVIEW: "Waiting for a person",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXECUTED: "Done",
  FAILED: "Failed when it ran",
};
import styles from "./case.module.css";

const KIND_LABEL: Record<AgentStep["kind"], string> = {
  WAKE: "Woke up",
  TOOL_CALL: "Looked up",
  TEXT: "Thought",
  FINISH: "Finished",
  ERROR: "Error",
};

/** The agent's own tools, in the words the step list uses. */
const TOOL_LABEL: Record<string, string> = {
  read_notes: "Read notes",
  get_order: "Read order",
  read_messages: "Read messages",
  check_ferry_capacity: "Ferry check",
  check_driver_rest: "Rest check",
  check_booking_outcome: "Asked carrier",
  ask_driver: "Asked driver",
  ask_site: "Asked site",
  write_notes: "Wrote notes",
  propose: "Proposed",
};

const label = (s: AgentStep) =>
  s.agent === "shift-watch" ? "Checked" : s.kind === "TOOL_CALL" && s.tool ? (TOOL_LABEL[s.tool] ?? KIND_LABEL[s.kind]) : KIND_LABEL[s.kind];

export function AgentSteps({
  steps,
  stopReason,
  earlier,
}: {
  steps: AgentStep[];
  stopReason: string | null;
  earlier: Proposal[];
}) {
  return (
    <details className={styles.panel} open>
      <summary className={styles.stepsSummary}>
        <span className={`heading ${styles.panelTitle}`}>Agent steps</span>
        <span className={styles.panelHint}>
          {steps.length} steps · newest last
        </span>
      </summary>
      <ol className={styles.steps}>
        {steps.map((s) => (
          <li key={`${s.run_id}-${s.seq}`} className={styles.stepRow} data-agent={s.agent} data-kind={s.kind}>
            <span className={styles.stepKind}>{label(s)}</span>
            <span className={styles.stepText}>
              {s.result_summary}
              <span className={styles.stepWho}>
                {s.agent === "shift-watch" ? "Shift Watch" : "Order agent"} · {clock(s.at)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {stopReason && (
        <p className={styles.stopReason}>
          <strong>Stopped because:</strong> {stopReason}
        </p>
      )}
      {earlier.length > 0 && (
        <div className={styles.earlier}>
          <h3>Earlier plans</h3>
          <ul>
            {earlier.map((p) => (
              <li key={p.id}>
                <span className={styles.earlierStatus}>
                  {STATUS_LABEL[p.status]}
                </span>
                {p.summary}
                {p.check?.reasons[0] && <span className={styles.earlierWhy}>{p.check.reasons[0].message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
