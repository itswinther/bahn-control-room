"use client";

import { useState } from "react";
import { Bot, Cog, Mail, MapPin, MessageSquare, Phone, ShieldCheck, UserRound } from "lucide-react";
import type { Source, TimelineEntry } from "@/lib/ui/contract";
import { SOURCE_LABEL, languageName, relative, when } from "@/lib/ui/present";
import { useClock } from "../providers";
import styles from "./case.module.css";

const ICON: Record<Source, typeof Mail> = {
  APP_CHAT: MessageSquare,
  EMAIL: Mail,
  CALL: Phone,
  SYSTEM: Cog,
  AGENT: Bot,
  SHIFT_WATCH: ShieldCheck,
  OPERATOR: UserRound,
  TRACKING: MapPin,
};


// Event times stay in UTC, like every deadline on screen; slots and promises carry their own zone.
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <section className={styles.panel} aria-labelledby="timeline-title">
      <div className={styles.panelHead}>
        <h2 id="timeline-title" className={`heading ${styles.panelTitle}`}>
          Timeline
        </h2>
        <p className={styles.panelHint}>Newest on top. Each line shows its source.</p>
      </div>
      <ol className={styles.timeline}>
        {entries.map((e, i) => (
          <Entry key={e.id} entry={e} sameAsAbove={sameSpeaker(entries[i - 1], e)} />
        ))}
      </ol>
    </section>
  );
}

/** The line above is the same person on the same channel within half an hour: don't name them twice. */
function sameSpeaker(above: TimelineEntry | undefined, e: TimelineEntry) {
  return !!above && above.who === e.who && above.source === e.source && Math.abs(Date.parse(above.at) - Date.parse(e.at)) < 30 * 60_000;
}

function Entry({ entry: e, sameAsAbove }: { entry: TimelineEntry; sameAsAbove: boolean }) {
  const [original, setOriginal] = useState(false);
  const { now, ready } = useClock();
  const Icon = ICON[e.source];
  const fromDriver = /· driver\b/i.test(e.who);
  const promise = e.hear_back_by ? Date.parse(e.hear_back_by) : null;

  return (
    <li className={styles.entry} data-tone={e.tone ?? "neutral"} data-driver={fromDriver || undefined}>
      <span className={styles.entryIcon} aria-hidden="true">
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <div className={styles.entryBody}>
        <p className={styles.entryMeta}>
          {!sameAsAbove && <span className={styles.entryWho}>{e.who}</span>}
          {!sameAsAbove && !e.who.toLowerCase().includes(SOURCE_LABEL[e.source].toLowerCase()) && (
            <span className={styles.entrySource}>{SOURCE_LABEL[e.source]}</span>
          )}
          {/* One time per line: the day only when it isn't today; how long ago on hover. */}
          <time className={styles.entryTime} dateTime={e.at} title={ready ? relative(Date.parse(e.at), now) : undefined} suppressHydrationWarning>
            {when(e.at, now)}
          </time>
        </p>
        <p className={styles.entryText}>
          {e.translation && !original ? e.translation : e.text}
        </p>
        {e.translation && (
          <button type="button" className={styles.translate} onClick={() => setOriginal(!original)}>
            {e.outgoing
              ? original
                ? "Show our English"
                : `Sent in ${languageName(e.language ?? "")}. Show what the driver got`
              : original
                ? "Show English translation"
                : `Translated from ${languageName(e.language ?? "")}. Show original`}
          </button>
        )}
        {e.unclear && e.unclear.length > 0 && (
          <p className={styles.entryFlags}>
            <span className={styles.unclear}>Not clear: {e.unclear.join("; ")}</span>
          </p>
        )}
        {(e.agent_written || promise) && (
          <p className={styles.entryFlags}>
            {e.agent_written && <span className={styles.agentFlag}>Sent by Shift Watch</span>}
            {promise && (
              <span className={styles.promise} data-kept={ready && now > promise ? "passed" : "open"}>
                Reply promised by {when(promise, now)}
              </span>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
