"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellRing, Hash } from "lucide-react";
import type { Page, PageTrigger, Person, Presence, SlackFeed } from "@/lib/contract";
import { ackPage, passPage, setPresence } from "@/lib/ui/api";
import { DESK_LABEL, clock, relative } from "@/lib/ui/present";
import { useLiveRefresh } from "../providers";
import styles from "./slack.module.css";

const PRESENCE_LABEL: Record<Presence, string> = { ACTIVE: "Active", AWAY: "Away", ON_CALL: "On a call" };
const TRIGGER_LABEL: Record<PageTrigger, string> = {
  SAFETY: "Safety",
  DRIVER_DROPPED: "Driver dropped the job",
  ESCALATED: "Moved to the shift lead",
  DUE_SOON: "Due in under 10 min",
};

/** The thread under a page: each step up the ladder, in Shift Watch's words. */
function threadLines(p: Page): { at: string; text: string }[] {
  const lines = p.history.slice(1).map((h, i) => {
    const before = p.history[i];
    if (h.result === "ACKED") return { at: h.at, text: `${h.person_name} is on it. The card stays open until it's done.` };
    const how = h.channel === "DM" ? "by DM" : "in the room";
    return { at: h.at, text: before.result === "PASSED" ? `${before.person_name} passed it on. Paged ${h.person_name} ${how}.` : `No answer in 3 min. Paged ${h.person_name} ${how}.` };
  });
  if (p.ended === "NO_ONE_LEFT") lines.push({ at: p.history.at(-1)!.at, text: "Nobody answered and the ladder has run out. It stays here until someone takes it." });
  if (p.ended === "CARD_CLOSED") lines.push({ at: p.history.at(-1)!.at, text: "The card was closed on the case. No more pages." });
  return lines;
}

function PageMessage({ page: p, feed, actingAs }: { page: Page; feed: SlackFeed; actingAs: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const person = (id: string) => feed.people.find((x) => x.id === id)!;
  const first = p.history[0];
  const target = person(p.person_id);
  const thread = threadLines(p);
  const act = async (call: typeof ackPage) => {
    setBusy(true);
    const res = await call(p.id, actingAs);
    setError(res.ok ? null : res.error);
    setBusy(false);
    router.refresh();
  };

  return (
    <li className={styles.message}>
      <span className={styles.avatar} aria-hidden="true">
        <BellRing size={18} strokeWidth={1.8} />
      </span>
      <div className={styles.messageBody}>
        <p className={styles.byline}>
          <strong>Shift Watch</strong> <time dateTime={first.at}>{clock(first.at)}</time>
        </p>
        <p>
          {first.channel === "ROOM" ? (
            <span className={styles.mention}>@{first.person_name}</span>
          ) : (
            `${first.person_name}${person(first.person_id).presence !== "ACTIVE" ? " is away, so this went to their phone too." : ", this went to your phone too."}`
          )}
        </p>
        <div className={styles.card} data-safety={p.trigger === "SAFETY" || undefined}>
          <p className={styles.cardTop}>
            <span className={styles.trigger}>{TRIGGER_LABEL[p.trigger]}</span>
            <Link href={`/cases/${p.order_id}`} className={styles.ref}>
              {p.reference}
            </Link>
            {p.deadline && !p.acked_at && <span className={styles.due}>Answer due {relative(Date.parse(p.deadline), Date.parse(feed.now))}</span>}
          </p>
          <p className={styles.what}>{p.what}</p>
          <p className={styles.for}>
            {p.acked_at
              ? `${person(p.acked_by!).name} is on it · ${clock(p.acked_at)}`
              : `For ${target.name} (${DESK_LABEL[target.desk]}) · ${p.channel === "DM" ? "DM" : "Room"}${target.presence !== "ACTIVE" ? `, ${PRESENCE_LABEL[target.presence].toLowerCase()}` : ""}`}
          </p>
          <div className={styles.actions}>
            {!p.acked_at && p.ended !== "CARD_CLOSED" && (
              <button type="button" className={styles.primary} disabled={busy} onClick={() => act(ackPage)}>
                I&apos;m on it
              </button>
            )}
            {!p.acked_at && !p.ended && (
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => act(passPage)}>
                Pass it on
              </button>
            )}
            <Link href={`/cases/${p.order_id}`} className={styles.secondary}>
              Open case
            </Link>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        {thread.length > 0 && (
          <ul className={styles.thread}>
            {thread.map((l, i) => (
              <li key={i}>
                <p className={styles.byline}>
                  <strong>Shift Watch</strong> <time dateTime={l.at}>{clock(l.at)}</time>
                </p>
                <p>{l.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function PresencePicker({ person }: { person: Person }) {
  const router = useRouter();
  return (
    <select
      className={styles.presence}
      value={person.presence}
      aria-label={`${person.name}'s status`}
      onChange={async (e) => {
        await setPresence(person.id, e.target.value as Presence);
        router.refresh();
      }}
    >
      {(Object.keys(PRESENCE_LABEL) as Presence[]).map((p) => (
        <option key={p} value={p}>
          {PRESENCE_LABEL[p]}
        </option>
      ))}
    </select>
  );
}

/** A Slack-like view of what Shift Watch paged, for the demo. Nothing is sent anywhere. */
export function Slack({ feed, room, dm }: { feed: SlackFeed; room: string | null; dm: string | null }) {
  useLiveRefresh(5000);
  const dmPerson = feed.people.find((p) => p.id === dm) ?? null;
  const current = dmPerson ? null : feed.rooms.includes(room ?? "") ? room! : "dispatch-desk";
  const inDm = (p: Page, id: string) => p.history.some((h) => h.person_id === id && h.channel === "DM");
  const pages = feed.pages.filter((p) => (dmPerson ? inDm(p, dmPerson.id) : p.room === current));
  const open = (match: (p: Page) => boolean) => feed.pages.filter((p) => !p.acked_at && match(p)).length;

  return (
    <div className={styles.slack}>
      <p className={styles.banner}>Mock Slack · nothing is sent · made-up people</p>
      <nav className={styles.side} aria-label="Rooms and direct messages">
        <h2>Rooms</h2>
        <ul>
          {feed.rooms.map((r) => (
            <li key={r}>
              <Link href={`/slack?room=${r}`} aria-current={r === current ? "page" : undefined}>
                <Hash size={15} strokeWidth={2} aria-hidden="true" />
                <span>{r}</span>
                {open((p) => p.room === r) > 0 && <span className={styles.badge}>{open((p) => p.room === r)}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <h2>Direct messages</h2>
        <ul>
          {feed.people.map((p) => (
            <li key={p.id} className={styles.dmRow}>
              <Link href={`/slack?dm=${p.id}`} aria-current={p.id === dmPerson?.id ? "page" : undefined}>
                <span className={styles.dot} data-presence={p.presence} aria-hidden="true" />
                <span>{p.name}</span>
                {open((x) => inDm(x, p.id) && x.person_id === p.id) > 0 && <span className={styles.badge}>{open((x) => inDm(x, p.id) && x.person_id === p.id)}</span>}
              </Link>
              <PresencePicker person={p} />
            </li>
          ))}
        </ul>
      </nav>
      <section className={styles.main} aria-label={dmPerson ? `Direct messages with ${dmPerson.name}` : `#${current}`}>
        <header className={styles.mainHead}>
          <h1>{dmPerson ? dmPerson.name : `#${current}`}</h1>
          <p>
            {dmPerson
              ? `${DESK_LABEL[dmPerson.desk]} · ${dmPerson.role === "PRIMARY" ? "on duty" : "backup"} · ${PRESENCE_LABEL[dmPerson.presence]}`
              : "Shift Watch posts here when a card needs a person. Times in UTC."}
          </p>
        </header>
        {pages.length ? (
          <ul className={styles.messages}>
            {pages.map((p) => (
              <PageMessage key={p.id} page={p} feed={feed} actingAs={dmPerson?.id ?? p.person_id} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Nothing here yet. Shift Watch only pages when something can&apos;t wait.</p>
        )}
      </section>
    </div>
  );
}
