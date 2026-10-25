"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Car, Check, Clock3, Hand, MessageSquare, ShieldAlert } from "lucide-react";
import type { Desk, QueueItem, TimelineEvent } from "@/lib/ui/contract";
import { DESK_LABEL, clock } from "@/lib/ui/present";
import { useClock } from "../providers";
import styles from "./shift-timeline.module.css";

const HOUR = 3_600_000;
/** Lanes in this order first; any other desk with work follows. */
const DESK_ORDER: Desk[] = ["ops-shift", "ops-dispatch", "ops-travel", "ops-readiness", "ops-support"];
const MAX_ROWS = 3;
/** Room a label needs (icon, order number, topic), so labels in one row don't overlap. Layout only: every
 *  event is still drawn at its exact time. */
const LABEL_PX = 150;

const TYPE: Record<TimelineEvent["type"], { label: string; Icon: typeof Hand }> = {
  SAFETY: { label: "Safety", Icon: ShieldAlert },
  DECISION: { label: "Your call", Icon: Hand },
  DRIVER: { label: "Driver", Icon: MessageSquare },
  TRAVEL: { label: "Travel", Icon: Car },
  CHECK: { label: "Agent check", Icon: Clock3 },
  PARKED: { label: "Parked", Icon: Clock3 },
};

const RANGES = [3, 6, 12] as const;

type Placed = { item: QueueItem; ev: TimelineEvent; start: number; end: number; row: number };

/** Pack events into the fewest rows so nothing overlaps (greedy, by start time). */
function pack(list: Omit<Placed, "row">[], minGap: number): { placed: Placed[]; hidden: number } {
  const rowsEnd: number[] = [];
  const placed: Placed[] = [];
  let hidden = 0;
  for (const p of [...list].sort((a, b) => a.start - b.start)) {
    let row = rowsEnd.findIndex((end) => end + minGap <= p.start);
    if (row === -1) row = rowsEnd.length;
    if (row >= MAX_ROWS) {
      hidden++;
      continue;
    }
    rowsEnd[row] = p.end;
    placed.push({ ...p, row });
  }
  return { placed, hidden };
}

export function ShiftTimeline({ items }: { items: QueueItem[] }) {
  const { now, ready } = useClock();
  const [hours, setHours] = useState<(typeof RANGES)[number]>(6);
  const [tip, setTip] = useState<{ p: Placed; x: number; y: number } | null>(null);
  // Every chip is at least wide enough for its order number, so packing works in pixels, not minutes.
  const chart = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(640);
  useEffect(() => {
    const el = chart.current?.querySelector(`.${styles.track}`);
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setTrackW(Math.max(1, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The window starts a little before now, so what just slipped is still in view.
  const start = now - Math.min(1, hours / 6) * HOUR;
  const end = start + hours * HOUR;
  const span = end - start;
  const pct = (t: number) => ((t - start) / span) * 100;

  const ticks = useMemo(() => {
    const step = hours === 12 ? 2 * HOUR : HOUR;
    const first = Math.ceil(start / step) * step;
    const out: number[] = [];
    for (let t = first; t <= end; t += step) out.push(t);
    return out;
  }, [start, end, hours]);

  const present = new Set(items.map((i) => i.owner_desk));
  const desks = [...DESK_ORDER.filter((d) => present.has(d)), ...[...present].filter((d) => !DESK_ORDER.includes(d))];
  const lanes = desks.map((desk) => {
    const evs = items
      .filter((i) => i.owner_desk === desk)
      .flatMap((item) =>
        (item.events ?? []).map((ev) => {
          const s = Date.parse(ev.start);
          // A moment (agent check) gets a small footprint so it can be packed.
          const e = s + (span * LABEL_PX) / trackW;
          return { item, ev, start: s, end: e };
        }),
      )
      // Only what happens inside the window, so nothing is pinned to an edge at the wrong time.
      .filter((p) => p.start >= start && p.start < end);
    const { placed, hidden } = pack(evs, span * 0.004);
    const rows = Math.max(1, ...placed.map((p) => p.row + 1));
    return { desk, placed, hidden, rows, count: new Set(evs.map((p) => p.item.id)).size };
  });

  const show = (p: Placed, el: HTMLElement) => {
    const box = el.closest(`.${styles.chart}`)!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // Below the block, or above it when it sits near the chart's foot.
    const below = r.bottom - box.top + 8;
    const y = below + 130 > box.height ? r.top - box.top - 138 : below;
    setTip({ p, x: Math.max(0, Math.min(r.left - box.left, box.width - 280)), y });
  };

  return (
    <section className={styles.wrap} aria-labelledby="timeline-title">
      <div className={styles.head}>
        <h2 id="timeline-title">Shift timeline</h2>
        <div className={styles.range} role="group" aria-label="Time range">
          {RANGES.map((h) => (
            <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}>
              {h}h
            </button>
          ))}
        </div>
      </div>

      <ul className={styles.legend} aria-label="Legend">
        {(["SAFETY", "DECISION", "DRIVER", "TRAVEL", "CHECK", "PARKED"] as const).map((t) => (
          <li key={t} data-type={t}>
            <span className={styles.swatch} aria-hidden="true" />
            {TYPE[t].label}
          </li>
        ))}
      </ul>

      <div className={styles.chart} ref={chart} onMouseLeave={() => setTip(null)}>
        <div className={styles.axis} aria-hidden="true">
          <span className={styles.axisLane} />
          <div className={styles.axisTrack}>
            {ticks.map((t) => (
              <span key={t} className={styles.tick} style={{ left: `${pct(t)}%` }}>
                {clock(t).replace(" UTC", "")}
              </span>
            ))}
          </div>
        </div>

        {lanes.map(({ desk, placed, hidden, rows, count }) => (
          <div key={desk} className={styles.lane} style={{ ["--rows" as string]: rows }}>
            <div className={styles.laneLabel}>
              <span>{DESK_LABEL[desk]}</span>
              <span className={styles.laneCount}>{count}</span>
            </div>
            <div className={styles.track}>
              {ticks.map((t) => (
                <span key={t} className={styles.grid} style={{ left: `${pct(t)}%` }} aria-hidden="true" />
              ))}
              <span className={styles.past} style={{ width: `${Math.max(0, pct(now))}%` }} aria-hidden="true" />
              {placed.map((p) => {
                const decided = !!p.item.outcome && !p.item.outcome.failed;
                // The real end, not the chip's minimum footprint.
                const realEnd = p.ev.end ? Date.parse(p.ev.end) : p.start;
                const late = !decided && p.ev.type === "DECISION" && realEnd < now;
                const left = pct(p.start);
                const { Icon } = TYPE[p.ev.type];
                return (
                  <Link
                    key={`${p.item.id}-${p.ev.type}-${p.ev.start}`}
                    href={`/cases/${p.item.order_id}`}
                    className={styles.event}
                    data-type={p.ev.type}
                    data-late={late || undefined}
                    data-past={realEnd < now || undefined}
                    data-decided={decided ? "" : undefined}
                    style={{
                      left: `${left}%`,
                      top: `calc(${p.row} * var(--row-h) + 6px)`,
                    }}
                    onMouseEnter={(e) => show(p, e.currentTarget)}
                    onFocus={(e) => show(p, e.currentTarget)}
                    onBlur={() => setTip(null)}
                    aria-label={`${TYPE[p.ev.type].label}, ${p.item.reference} (${p.item.topic}): ${p.ev.label}, ${clock(p.start)}${p.ev.end ? ` to ${clock(p.ev.end)}` : ""}${late ? ", late" : ""}`}
                  >
                    {decided ? <Check size={13} strokeWidth={2.6} aria-hidden="true" /> : <Icon size={13} strokeWidth={2.2} aria-hidden="true" />}
                    <span className={styles.eventText}>
                      <b>{p.item.reference.replace("CD-", "")}</b> {p.item.topic}
                    </span>
                  </Link>
                );
              })}
              {hidden > 0 && <span className={styles.more}>+{hidden}</span>}
            </div>
          </div>
        ))}

        <div className={styles.nowLayer} aria-hidden="true">
          <span className={styles.axisLane} />
          <div className={styles.nowTrack}>
            <span className={styles.now} style={{ left: `${pct(now)}%` }}>
              <span className={styles.nowPill} suppressHydrationWarning>
                {ready ? clock(now).replace(" UTC", "") : "Now"}
              </span>
            </span>
          </div>
        </div>

        {tip && (
          <div className={styles.tip} style={{ left: tip.x, top: tip.y }} role="tooltip">
            <span className={styles.tipType} data-type={tip.p.ev.type}>
              {TYPE[tip.p.ev.type].label}
            </span>
            <strong>{tip.p.item.reference}</strong>
            <span>{tip.p.ev.label}</span>
            <span className={styles.tipTime}>
              {clock(tip.p.start)}
              {tip.p.ev.end ? ` – ${clock(tip.p.ev.end)}` : ""}
            </span>
            <span className={styles.tipTitle}>{tip.p.item.title}</span>
          </div>
        )}
      </div>

      {/* The same schedule as a list, for screen readers and anyone who prefers text. */}
      <div className="visually-hidden">
      <table>
        <caption>Scheduled events, {hours} hour view</caption>
        <tbody>
          {lanes.flatMap(({ desk, placed }) =>
            placed.map((p) => (
              <tr key={`${desk}-${p.item.id}-${p.ev.type}-${p.ev.start}`}>
                <td>{DESK_LABEL[desk]}</td>
                <td>{p.item.reference}</td>
                <td>{TYPE[p.ev.type].label}</td>
                <td>{p.ev.label}</td>
                <td>
                  {clock(p.start)}
                  {p.ev.end ? ` to ${clock(p.ev.end)}` : ""}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      </div>
    </section>
  );
}
