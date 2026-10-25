"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, Languages, Loader2, MessageCircleQuestion } from "lucide-react";
import type { CaseView, QueueItem } from "@/lib/ui/contract";
import { languageName, relative, urgency, when } from "@/lib/ui/present";
import { useClock, useFocusOrder, usePanel } from "../providers";
import { KindTag, LanguageTag } from "../ui/tags";
import { RouteStrip } from "../ui/route-strip";
import { DecisionCard } from "../case/decision-card";
import { HeldMessage } from "../case/held-message";
import { Timeline } from "../case/timeline";
import { Travel } from "../case/travel";
import { AgentNotes } from "../case/agent-notes";
import { AgentSteps } from "../case/agent-steps";
import caseStyles from "../case/case.module.css";
import styles from "./workspace.module.css";

type Tab = "timeline" | "travel" | "notes" | "steps";

const PARTY_LABEL = { driver: "Driver", pickup: "Pickup", delivery: "Delivery", customer: "Customer" } as const;

/** How long a decided plan stays on top of the case, showing what happened: the same five minutes the
 *  queue keeps a decided card (DECIDED_SHOWN_MS in lib/shift-watch/queue.ts). */
const SHOWN_AFTER_DECISION = 5 * 60_000;

export function CaseDetail({ data, item }: { data: CaseView; item?: QueueItem }) {
  const { now, ready } = useClock();
  const { ask } = usePanel();
  const [tab, setTab] = useState<Tab>("timeline");
  const { order, status } = data;
  useFocusOrder(order.id);

  // The plan waiting for a person, or one a person just decided (failed ones stay until dealt with).
  const active =
    data.proposals.find((p) => p.status === "PENDING_REVIEW" || p.status === "HELD") ??
    data.proposals.find((p) => p.review && (p.status === "FAILED" || !ready || now - Date.parse(p.review.at) < SHOWN_AFTER_DECISION)) ??
    null;
  const earlier = data.proposals.filter((p) => p !== active);
  const deadlineIso = item?.deadline ?? status?.decision_deadline ?? null;
  const deadline = deadlineIso ? Date.parse(deadlineIso) : null;
  const decided = !!active?.review || !!item?.outcome;
  const u = urgency(deadline, now);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "timeline", label: "Timeline", count: data.timeline.length },
    { id: "travel", label: "Travel", count: data.travel.length },
    { id: "notes", label: "Notes", count: data.notes.length },
    { id: "steps", label: "Steps", count: data.steps.length },
  ];

  return (
    <div className={styles.detail}>
      <header className={styles.detailHead}>
        <div className={styles.detailMeta}>
          <KindTag kind={item?.kind ?? data.kind} />
          <span className={styles.ref}>{order.reference}</span>
          <span className={styles.muted}>{order.vehicle}</span>
          {item?.language && <LanguageTag need={item.language} />}
          {deadline != null && !decided && (
            <span className={styles.callBy} data-urgency={u} suppressHydrationWarning title={item?.deadline_reason ?? status?.deadline_reason ?? undefined}>
              Call by {when(deadline, now)}
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

      {data.languages.mixed && (
        <p className={styles.parties}>
          <Languages size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>
            <strong>Cross-border.</strong>{" "}
            {data.languages.parties
              .filter((p) => p.language)
              .map((p) => `${PARTY_LABEL[p.role]} ${p.role === "pickup" || p.role === "delivery" ? `(${p.name}) ` : ""}${languageName(p.language!)}`)
              .join(" · ")}
          </span>
        </p>
      )}

      {item?.language && <p className={styles.langNote}>{item.language.why}</p>}

      {data.running && (
        <p className={styles.working} role="status">
          <Loader2 size={16} strokeWidth={2.2} className={styles.spin} aria-hidden="true" />
          The order agent is looking into this now.
        </p>
      )}

      {data.held_messages.map((m) => (
        <HeldMessage key={m.id} message={m} />
      ))}

      {active ? (
        <DecisionCard key={`${active.id}-${active.status}`} proposal={active} title={item && !item.outcome ? item.title : active.summary} item={item} />
      ) : (
        <section className={styles.nothing}>
          <h2 className={styles.nothingTitle}>{item ? item.title : "Nothing to decide"}</h2>
          <p>{item?.deadline_reason ? `${item.deadline_reason}. ` : ""}{status?.summary ?? data.headline}</p>
          {item && item.checked.length > 0 && (
            <ul className={styles.alsoOpen}>
              {item.checked.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <div className={styles.nothingRow}>
            {status?.next_check_at && (
              <span className={styles.muted}>
                Agent checks again {when(status.next_check_at, now)}
                {ready ? ` · ${relative(Date.parse(status.next_check_at), now)}` : ""}
              </span>
            )}
            <button type="button" className={styles.softBtn} onClick={() => ask(`What's going on with ${order.reference}?`)}>
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
        <Link href={`/orders/${order.id}`} className={styles.fullRecord}>
          <FileText size={15} strokeWidth={1.8} aria-hidden="true" />
          Full record
        </Link>
      </div>
      <div id="detail-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={caseStyles.tabBody}>
        {tab === "timeline" && <Timeline entries={data.timeline} />}
        {tab === "travel" &&
          (data.travel.length > 0 ? <Travel legs={data.travel} /> : <p className={styles.muted}>No travel on this order.</p>)}
        {tab === "notes" &&
          (data.notes.length > 0 ? (
            <AgentNotes notes={data.notes} updatedAt={data.notes_updated_at} />
          ) : (
            <p className={styles.muted}>The agent hasn&apos;t worked on this order yet.</p>
          ))}
        {tab === "steps" &&
          (data.steps.length > 0 ? (
            <AgentSteps steps={data.steps} stopReason={data.stop_reason} earlier={earlier} />
          ) : (
            <p className={styles.muted}>No agent runs on this order yet.</p>
          ))}
      </div>
    </div>
  );
}
