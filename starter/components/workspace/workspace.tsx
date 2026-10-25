"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Inbox, MessageCircle, Search, X } from "lucide-react";
import type { CaseView, QueueResponse } from "@/lib/ui/contract";
import { groupOf, needsCall, sortQueue, type Group } from "@/lib/ui/queue";
import { useClock, useLiveRefresh, usePanel } from "../providers";
import { timeLeft, tone } from "./time-left";
import { CaseDetail } from "./case-detail";
import styles from "./workspace.module.css";

const GROUP_LABEL: Record<Group, string> = { now: "Now", today: "Today", parked: "Parked" };

export function Workspace({
  queue,
  data,
  selectedId,
  isCaseRoute,
}: {
  queue: QueueResponse;
  data: CaseView | null;
  selectedId: string | null;
  isCaseRoute: boolean;
}) {
  const { now, ready } = useClock();
  const { open: panelOpen, setOpen } = usePanel();
  useLiveRefresh();

  const items = useMemo(() => sortQueue(queue.items), [queue.items]);
  // Group at the time the queue was built until the browser has the server's clock, so counts don't jump.
  const t = ready ? now : Date.parse(queue.generated_at);
  const selected = items.find((i) => i.order_id === selectedId);

  const counts = { now: 0, today: 0, parked: 0 } as Record<Group, number>;
  for (const i of items) if (needsCall(i)) counts[groupOf(i, t)]++;

  const [group, setGroup] = useState<Group>(() => (selected ? groupOf(selected, t) : "now"));
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Searching looks across every group; otherwise show the chosen group.
  const q = query.trim().toLowerCase().replace(/^cd-?/, "");
  const listed = q
    ? items.filter((i) =>
        [i.reference, i.vehicle, i.route, i.title].some((f) => f?.toLowerCase().replace("cd-", "").includes(q)),
      )
    : items.filter((i) => groupOf(i, t) === group);

  // "/" jumps to search from anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.key !== "/" || t?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.ws} data-case={isCaseRoute || undefined}>
      <aside className={styles.list} aria-label="Calls">
        <div className={styles.search}>
          <Search size={17} strokeWidth={2} aria-hidden="true" />
          <label htmlFor="call-search" className="visually-hidden">
            Search calls
          </label>
          <input
            ref={searchRef}
            id="call-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Order, car or city"
            autoComplete="off"
          />
          {query ? (
            <button type="button" className={styles.clear} onClick={() => setQuery("")} aria-label="Clear search">
              <X size={16} strokeWidth={2} />
            </button>
          ) : (
            <kbd className={styles.slash} aria-hidden="true">
              /
            </kbd>
          )}
        </div>
        {q ? (
          <p className={styles.resultCount} role="status">
            {listed.length} {listed.length === 1 ? "match" : "matches"}
          </p>
        ) : (
        <div className={styles.groups} role="group" aria-label="Show">
          {(["now", "today", "parked"] as const).map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>
              {GROUP_LABEL[g]} <span>{counts[g]}</span>
            </button>
          ))}
        </div>
        )}
        <ul className={styles.rows}>
          {listed.length === 0 && (
            <li className={styles.emptyRow}>
              {q ? (
                <>
                  <strong>No calls match “{query.trim()}”.</strong> Try an order number like 420603, a car or a city.
                </>
              ) : (
                "Nothing here."
              )}
            </li>
          )}
          {listed.map((i) => {
            const d = !!i.outcome && !i.outcome.failed && !i.outcome.undo_until;
            return (
              <li key={i.id}>
                <Link
                  href={`/cases/${i.order_id}`}
                  scroll={false}
                  className={styles.row}
                  aria-current={i.order_id === selectedId ? "true" : undefined}
                >
                  <span className={styles.chip} data-tone={tone(i, now)} suppressHydrationWarning>
                    {d && <Check size={13} strokeWidth={2.6} aria-hidden="true" />}
                    {timeLeft(i, now, ready)}
                  </span>
                  <span className={styles.rowText}>
                    <span className={styles.ref}>
                      {i.reference}
                      {q && <span className={styles.rowGroup}> · {GROUP_LABEL[groupOf(i, t)]}</span>}
                    </span>
                    <span className={styles.rowTitle}>{i.title}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className={styles.listFoot}>
          <span className={styles.liveDot} aria-hidden="true" />
          {queue.orders_checked} checked · {queue.quiet_count} quiet
        </p>
      </aside>

      <div className={styles.pane}>
        {isCaseRoute && (
          <Link href="/inbox" className={styles.back}>
            <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /> All calls
          </Link>
        )}
        {data ? (
          <CaseDetail key={data.order.id} data={data} item={selected} />
        ) : (
          <div className={styles.pick}>
            <Inbox size={28} strokeWidth={1.4} aria-hidden="true" />
            <p>Pick a call on the left.</p>
          </div>
        )}
      </div>

      {!panelOpen && (
        <button type="button" className={styles.fab} onClick={() => setOpen(true)}>
          <MessageCircle size={20} strokeWidth={1.8} aria-hidden="true" />
          Ask Shift Watch
        </button>
      )}
    </div>
  );
}
