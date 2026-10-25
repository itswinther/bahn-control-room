"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, Languages, MessageSquare, Play, RotateCcw, UserX } from "lucide-react";
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
export function DemoMenu({ live }: { live: boolean }) {
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
        <p className={styles.demoNote}>
          {live ? "Live: agents and Shift Watch run on Claude." : "Replay: agents replay recorded live runs."} Ferry prices and site replies are made up.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const res = await driverWrites("drv-121", "Still in the queue. Navigation now says 14:20 at check-in.");
              if (!res.ok) return res.error;
              // Show the case the story is about.
              menu.current?.removeAttribute("open");
              router.push("/cases/ord-00603");
              return "CD-420603's driver wrote in. Shift Watch answered; the agent is on it.";
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
              // Bahn's real case: a driver took the job, went quiet, and wrote "won't deliver" days later, after the
              // customer had cancelled. Here the driver never writes: Shift Watch asked at 09:00 for tomorrow's pickup,
              // and three hours of silence put the job back on the dispatch desk with a day to re-offer it.
              const res = await fetch("/api/demo/advance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minutes: 180, quiet_order_id: "ord-00442" }) });
              if (!res.ok) return "Couldn't move the clock.";
              window.location.assign("/cases/ord-00442");
              return "Three hours on: CD-420442's driver never answered.";
            })
          }
        >
          <UserX size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>
            <strong>A driver goes quiet</strong>
            CD-420442: took the job, then nothing. Skip 3 hours
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const results = await Promise.all([...OTHER_RUNS.map(runAgent), driverWrites("drv-319", "The warning light is still on. I'm parked and waiting.")]);
              const started = results.filter((r) => r.ok).length;
              // Open the Inbox, where their cards land: the warning light on top, the other two as their plans arrive.
              if (started) router.push("/inbox");
              return started ? `${started} agents started. Their cards appear in the Inbox in a few seconds.` : results.map((r) => (r.ok ? "" : r.error)).join(" ");
            })
          }
        >
          <Play size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>
            <strong>Wake three more agents</strong>
            CD-420299, CD-420322, CD-420593
          </span>
        </button>
        <button
          type="button"
          disabled={busy || !live}
          title={live ? undefined : "Needs live mode: without an API key Shift Watch reads every message as English"}
          onClick={() =>
            run(async () => {
              // Colloquial Finnish that leaves the delay open, so the card shows the language, the team and the gap.
              const res = await driverWrites("drv-034", "Moi, oon jumissa ruuhkassa Lahden kohdalla, myöhästyn varmaan vähän. Onko ok?");
              if (!res.ok) return res.error;
              menu.current?.removeAttribute("open");
              router.push("/cases/ord-00366?team=FI");
              return "CD-420366's driver wrote in Finnish. The card names the language and the Finland team.";
            })
          }
        >
          <Languages size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>
            <strong>A Finnish driver writes in</strong>
            {live ? "CD-420366, stuck in traffic near Lahti" : "Needs live mode (an API key) to read the language"}
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
