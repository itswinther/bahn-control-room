"use client";

import { useState } from "react";
import { Bot, Cog, Mail, MapPin, MessageSquare, Phone, ShieldCheck, UserRound } from "lucide-react";
import type { Source, TimelineEntry } from "@/lib/ui/contract";
import { SOURCE_LABEL, clock } from "@/lib/ui/present";
import { useClock } from "../providers";
import { Age } from "../time";
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

const LANG: Record<string, string> = { de: "German", fr: "French", fi: "Finnish", da: "Danish", sv: "Swedish" };

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
        {entries.map((e) => (
          <Entry key={e.id} entry={e} />
        ))}
      </ol>
    </section>
  );
}

function Entry({ entry: e }: { entry: TimelineEntry }) {
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
          <span className={styles.entryWho}>{e.who}</span>
          {!e.who.toLowerCase().includes(SOURCE_LABEL[e.source].toLowerCase()) && (
            <span className={styles.entrySource}>{SOURCE_LABEL[e.source]}</span>
          )}
          <span className={styles.entryTime}>
            {clock(e.at)} · <Age at={e.at} />
          </span>
        </p>
        <p className={styles.entryText}>
          {e.translation && !original ? e.translation : e.text}
        </p>
        {e.translation && (
          <button type="button" className={styles.translate} onClick={() => setOriginal(!original)}>
            {original ? "Show English translation" : `Translated from ${LANG[e.language ?? ""] ?? e.language}. Show original`}
          </button>
        )}
        {(e.agent_written || promise) && (
          <p className={styles.entryFlags}>
            {e.agent_written && <span className={styles.agentFlag}>Sent by Shift Watch</span>}
            {promise && (
              <span className={styles.promise} data-kept={ready && now > promise ? "passed" : "open"}>
                Reply promised by {clock(promise)}
              </span>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
