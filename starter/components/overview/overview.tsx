"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock, ShieldAlert, UserRound } from "lucide-react";
import type { Desk, QueueItem, QueueResponse } from "@/lib/ui/contract";
import { DESK_LABEL } from "@/lib/ui/present";
import { groupOf, sortQueue } from "@/lib/ui/queue";
import { useClock, useDecisions } from "../providers";
import { timeLeft, tone } from "../workspace/time-left";
import { ShiftTimeline } from "./shift-timeline";
import styles from "./overview.module.css";

const DESKS: Desk[] = ["ops-dispatch", "ops-shift", "ops-travel", "ops-readiness"];

export function Overview({ queue }: { queue: QueueResponse }) {
  const { now, ready } = useClock();
  const { decisions } = useDecisions();

  const open = sortQueue(queue.items).filter((i) => !(i.proposal_id && decisions[i.proposal_id]));
  const active = open.filter((i) => i.kind !== "WAITING");
  const dueNow = active.filter((i) => groupOf(i, now) === "now");
  const safety = active.filter((i) => i.kind === "SAFETY");
  const waiting = active.filter((i) => i.kind === "DRIVER_WAITING");
  const held = active.filter((i) => i.kind === "HELD");

  const load = DESKS.map((d) => ({ desk: d, n: dueNow.filter((i) => i.owner_desk === d).length }));
  const max = Math.max(1, ...load.map((l) => l.n));

  const first = (list: QueueItem[]) => (list[0] ? `/cases/${list[0].order_id}` : "/inbox");

  return (
    <div className={styles.page}>
      <div className={styles.kpis}>
        <Link href="/inbox" className={styles.kpi}>
          <span className={styles.kLabel}>Need a call</span>
          <span className={styles.kValue}>{active.length}</span>
        </Link>
        <Link href={first(dueNow)} className={styles.kpi}>
          <span className={styles.kLabel}>
            <Clock size={15} strokeWidth={2} aria-hidden="true" /> Due this hour
          </span>
          <span className={styles.kValue}>{dueNow.length}</span>
        </Link>
        <Link href={first(safety)} className={styles.kpi} data-tone={safety.length ? "red" : undefined}>
          <span className={styles.kLabel}>
            <ShieldAlert size={15} strokeWidth={2} aria-hidden="true" /> Safety
          </span>
          <span className={styles.kValue}>{safety.length}</span>
        </Link>
        <Link href={first(waiting)} className={styles.kpi} data-tone={waiting.length ? "orange" : undefined}>
          <span className={styles.kLabel}>
            <UserRound size={15} strokeWidth={2} aria-hidden="true" /> Driver waiting
          </span>
          <span className={styles.kValue}>{waiting.length}</span>
        </Link>
      </div>

      <ShiftTimeline items={queue.items} />

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="next-title">
          <div className={styles.cardHead}>
            <h2 id="next-title">Next up</h2>
            <Link href="/inbox" className={styles.more}>
              All calls <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
          {active.length === 0 ? (
            <p className={styles.empty}>Nothing needs a call right now.</p>
          ) : (
            <ul className={styles.next}>
              {active.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <Link href={`/cases/${i.order_id}`} className={styles.row}>
                    <span className={styles.chip} data-tone={tone(i, now)} suppressHydrationWarning>
                      {i.kind === "SAFETY" && <ShieldAlert size={12} strokeWidth={2.4} aria-label="Safety" />}
                      {timeLeft(i, now, ready)}
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.ref}>
                        {i.reference} · {DESK_LABEL[i.owner_desk]}
                      </span>
                      <span className={styles.title}>{i.title}</span>
                    </span>
                    <ArrowRight size={16} strokeWidth={2} className={styles.go} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card} aria-labelledby="load-title">
          <div className={styles.cardHead}>
            <h2 id="load-title">Due this hour, by desk</h2>
          </div>
          {/* One series, one hue; the count is written beside each bar so colour never carries it. */}
          <ul className={styles.bars}>
            {load.map(({ desk, n }) => (
              <li key={desk} title={`${DESK_LABEL[desk]}: ${n} due this hour`}>
                <span className={styles.barLabel}>{DESK_LABEL[desk]}</span>
                <span className={styles.barTrack} aria-hidden="true">
                  <span className={styles.bar} style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className={styles.barValue}>{n}</span>
              </li>
            ))}
          </ul>
          <div className={styles.foot}>
            {held.length > 0 && (
              <Link href={first(held)} className={styles.held}>
                <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
                {held.length} {held.length === 1 ? "plan" : "plans"} held back by Shift Watch
              </Link>
            )}
            <p className={styles.quiet}>
              <span className={styles.liveDot} aria-hidden="true" />
              {queue.quiet_count} quiet of {queue.orders_checked} checked
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
