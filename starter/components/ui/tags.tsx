import { AlertTriangle, CircleDashed, Clock, Hand, ShieldAlert, UserRound } from "lucide-react";
import type { LegState, QueueKind } from "@/lib/ui/contract";
import { KIND_LABEL, LEG_LABEL } from "@/lib/ui/present";
import styles from "./tags.module.css";

const KIND_ICON = {
  SAFETY: ShieldAlert,
  DECISION: Hand,
  HELD: AlertTriangle,
  DRIVER_WAITING: UserRound,
  LOOSE_END: CircleDashed,
  WAITING: Clock,
} as const;

const KIND_TONE: Record<QueueKind, string> = {
  SAFETY: "red",
  DECISION: "ink",
  HELD: "orange",
  DRIVER_WAITING: "teal",
  LOOSE_END: "orange",
  WAITING: "grey",
};

export function KindTag({ kind }: { kind: QueueKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={styles.tag} data-tone={KIND_TONE[kind]}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      {KIND_LABEL[kind]}
    </span>
  );
}

const LEG_TONE: Record<LegState, string> = {
  BOOKED: "green",
  QUOTED: "teal",
  REQUESTED: "orange",
  NOT_BOOKED: "grey",
};

/** Booked / quoted / unconfirmed, colour-coded so a quote never reads as a booking. */
export function LegTag({ state }: { state: LegState }) {
  return (
    <span className={styles.tag} data-tone={LEG_TONE[state]} data-solid="">
      <span className={styles.dot} aria-hidden="true" />
      {LEG_LABEL[state]}
    </span>
  );
}

export function Tag({ tone = "grey", children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span className={styles.tag} data-tone={tone}>
      {children}
    </span>
  );
}
