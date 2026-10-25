"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, MessageSquare, Play, RotateCcw } from "lucide-react";
import type { Desk, RunRequest } from "@/lib/contract";
import { driverWrites, runAgent } from "@/lib/ui/api";
import { DESK_LABEL } from "@/lib/ui/present";
import { useClock, useDesk } from "./providers";
import styles from "./header.module.css";

// The same wake-ups the team recorded (scripts/record.ts), so replay mode plays them back. CD-420322's driver
// writes in through Shift Watch, so the message is on the timeline and the agent answers what was said.
const OTHER_RUNS: RunRequest[] = [
  { order_id: "ord-00299", reason: "LOOSE_END", reason_detail: "The 07:10 ferry booking attempt for the driver timed out with no reference, and the crossing shows sold out. Nobody has checked what happened to that attempt." },
  { order_id: "ord-00593", reason: "LOOSE_END", reason_detail: "The driver at the pickup site said at 07:57 they could wait 30 more minutes; that ran out at 08:27 and the car still isn't released." },
];

const DESKS: Desk[] = ["ops-shift", "ops-travel", "ops-dispatch", "ops-readiness", "ops-support", "ops-evidence", "ops-expenses"];

/** Who is deciding: the backend checks it on every decision. */
export function DeskPicker() {
  const { desk, setDesk } = useDesk();
  return (
    <label className={styles.desk}>
      <span className="visually-hidden">Deciding as</span>
      <select value={desk} onChange={(e) => setDesk(e.target.value as Desk)} title="Deciding as">
        {DESKS.map((d) => (
          <option key={d} value={d}>
            {DESK_LABEL[d]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Drives the demo from the screen: the scripted driver, the recorded agent runs, and a restart. */
export function DemoMenu() {
  const router = useRouter();
  const { reset } = useClock();
  const menu = useRef<HTMLDetailsElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (what: () => Promise<string>) => {
    setBusy(true);
    setStatus(await what());
    setBusy(false);
    router.refresh();
  };

  return (
    <details className={styles.demo} ref={menu}>
      <summary className={styles.demoButton}>
        Demo <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
      </summary>
      <div className={styles.demoMenu}>
        <p className={styles.demoNote}>Agents replay recorded live runs. Ferry prices and site replies are made up.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const res = await driverWrites("drv-121", "Still in the queue. Navigation now says 14:20 at check-in.");
              return res.ok ? "CD-420603's driver wrote in. Shift Watch answered; the agent is on it." : res.error;
            })
          }
        >
          <MessageSquare size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>
            <strong>Driver writes in</strong>
            CD-420603, stuck in the ferry queue
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const results = await Promise.all([...OTHER_RUNS.map(runAgent), driverWrites("drv-319", "The warning light is still on. I'm parked and waiting.")]);
              const started = results.filter((r) => r.ok).length;
              return started ? `${started} agents started. Their plans show up in a few seconds.` : results.map((r) => (r.ok ? "" : r.error)).join(" ");
            })
          }
        >
          <Play size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>
            <strong>Wake three more agents</strong>
            CD-420299, CD-420322, CD-420593
          </span>
        </button>
        <button type="button" disabled={busy} onClick={() => run(async () => (await reset(), "Restarted at 09:00."))}>
          <RotateCcw size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>
            <strong>Restart the demo</strong>
            Back to 09:00, agents' work cleared
          </span>
        </button>
        {status && (
          <p className={styles.demoStatus} role="status">
            {status}
          </p>
        )}
      </div>
    </details>
  );
}
