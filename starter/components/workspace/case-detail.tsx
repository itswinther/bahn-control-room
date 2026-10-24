"use client";

import { useState } from "react";
import { Link2, MessageCircleQuestion } from "lucide-react";
import type { CaseView, QueueItem, TravelLeg } from "@/lib/ui/contract";
import { clock, relative, urgency } from "@/lib/ui/present";
import { useClock, useDecisions, usePanel } from "../providers";
import { KindTag } from "../ui/tags";
import { RouteStrip } from "../ui/route-strip";
import { DecisionCard } from "../case/decision-card";
import { Timeline } from "../case/timeline";
import { Travel } from "../case/travel";
import { AgentNotes } from "../case/agent-notes";
import { AgentSteps } from "../case/agent-steps";
import caseStyles from "../case/case.module.css";
import styles from "./workspace.module.css";

type Tab = "timeline" | "travel" | "notes" | "steps";

export function CaseDetail({ data, item }: { data: CaseView; item?: QueueItem }) {
  const { now, ready } = useClock();
  const { decisions } = useDecisions();
  const { ask } = usePanel();
  const [tab, setTab] = useState<Tab>("timeline");
  const { order, status } = data;

  const active = data.proposals.find((p) => p.status === "PENDING_REVIEW" || p.status === "HELD") ?? null;
  const decision = active ? decisions[active.id] : undefined;
  const earlier = data.proposals.filter((p) => p !== active);
  const deadline = status.decision_deadline ? Date.parse(status.decision_deadline) : null;
  const u = urgency(deadline, now);

  // Once a booking is approved and runs, travel shows it as booked.
  const travel: TravelLeg[] = data.travel.map((leg) => {
    if (!decision || decision.decision === "REJECTED" || !decision.reference) return leg;
    if (leg.state === "QUOTED") return { ...leg, state: "BOOKED", reference: decision.reference, detail: "Booked just now. Boarding not confirmed." };
    if (leg.state === "BOOKED" && active?.command === "travel.rebook_ferry")
      return { ...leg, state: "NOT_NEEDED", detail: "Released after the new booking." };
    return leg;
  });

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "timeline", label: "Timeline", count: data.timeline.length },
    { id: "travel", label: "Travel", count: travel.length },
    { id: "notes", label: "Notes", count: data.notes.length },
    { id: "steps", label: "Steps", count: data.steps.length },
  ];

  return (
    <div className={styles.detail}>
      <header className={styles.detailHead}>
        <div className={styles.detailMeta}>
          <KindTag kind={data.kind} />
          <span className={styles.ref}>{order.reference}</span>
          <span className={styles.muted}>{order.vehicle}</span>
          {deadline != null && !decision && (
            <span className={styles.callBy} data-urgency={u} suppressHydrationWarning>
              Call by {clock(deadline)}
              {ready && ` · ${u === "overdue" ? `late ${relative(deadline, now).replace(" ago", "")}` : relative(deadline, now).replace("in ", "")}`}
            </span>
          )}
        </div>
        <div className={styles.detailRoute}>
          <RouteStrip
            from={order.pickup.place}
            to={order.delivery.place}
            fromCode={order.pickup.country}
            toCode={order.delivery.country}
            size="s"
          />
        </div>
      </header>

      {order.linked_orders?.map((l) => (
        <p key={l.id} className={styles.linked}>
          <Link2 size={15} strokeWidth={1.8} aria-hidden="true" />
          <strong>{l.reference}</strong> {l.why}
        </p>
      ))}

      {active ? (
        <DecisionCard key={active.id} proposal={active} title={item?.title ?? data.headline} />
      ) : (
        <section className={styles.nothing}>
          <h2 className={styles.nothingTitle}>Nothing to decide yet</h2>
          <p>{data.stop_reason ?? status.summary}</p>
          <div className={styles.nothingRow}>
            {status.next_check_at && (
              <span className={styles.muted}>
                Next check {clock(status.next_check_at)}
                {ready ? ` · ${relative(Date.parse(status.next_check_at), now)}` : ""}
              </span>
            )}
            <button type="button" className={styles.softBtn} onClick={() => ask("What are we waiting for?")}>
              <MessageCircleQuestion size={17} strokeWidth={1.7} aria-hidden="true" />
              Ask Shift Watch
            </button>
          </div>
        </section>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Order details">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="detail-panel"
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className={styles.tabCount}>{t.count}</span>
          </button>
        ))}
      </div>
      <div id="detail-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={caseStyles.tabBody}>
        {tab === "timeline" && <Timeline entries={data.timeline} />}
        {tab === "travel" &&
          (travel.length > 0 ? <Travel legs={travel} /> : <p className={styles.muted}>No travel on this order.</p>)}
        {tab === "notes" && <AgentNotes notes={data.notes} updatedAt={data.notes_updated_at} />}
        {tab === "steps" && <AgentSteps steps={data.steps} stopReason={data.stop_reason} earlier={earlier} />}
      </div>
    </div>
  );
}
