import type { AgentNote } from "@/lib/ui/contract";
import { Age } from "../time";
import styles from "./case.module.css";

export function AgentNotes({ notes, updatedAt }: { notes: AgentNote[]; updatedAt: string | null }) {
  return (
    <section className={styles.panel} aria-labelledby="notes-title">
      <div className={styles.panelHead}>
        <h2 id="notes-title" className={`heading ${styles.panelTitle}`}>
          Agent&apos;s notes
        </h2>
        {updatedAt && (
          <p className={styles.panelHint}>
            Updated <Age at={updatedAt} />
          </p>
        )}
      </div>
      <ul className={styles.notes}>
        {notes.map((n) => (
          <li key={n.text} className={styles.note}>
            <p>
              {n.text}
            </p>
            <p className={styles.source}>
              {n.source}
              {n.at && (
                <>
                  {" · "}
                  <Age at={n.at} />
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
