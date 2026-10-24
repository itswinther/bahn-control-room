import type { AgentStep, Proposal } from "@/lib/ui/contract";
import { clock } from "@/lib/ui/present";
import styles from "./case.module.css";

const KIND_LABEL: Record<AgentStep["kind"], string> = {
  READ: "Read",
  TOOL_CALL: "Looked up",
  ASK: "Asked",
  PROPOSE: "Proposed",
  CHECK: "Checked",
  FINISH: "Finished",
};

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
          {steps.length} steps · lookups first
        </span>
      </summary>
      <ol className={styles.steps}>
        {steps.map((s) => (
          <li key={`${s.run_id}-${s.seq}`} className={styles.stepRow} data-agent={s.agent} data-kind={s.kind}>
            <span className={styles.stepKind}>{KIND_LABEL[s.kind]}</span>
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
                  {p.status === "SENT_BACK" ? "Sent back by Shift Watch" : p.status.toLowerCase().replace("_", " ")}
                </span>
                {p.summary}
                {p.check?.reasons[0] && <span className={styles.earlierWhy}>{p.check.reasons[0]}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
