"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { demoNow, demoStartedAt, resetDemoClock, SNAPSHOT } from "@/lib/ui/clock";
import type { WhoPays } from "@/lib/ui/contract";

/* ---------- Demo clock ---------- */

const ClockContext = createContext<{ now: number; ready: boolean; reset: () => void }>({
  now: SNAPSHOT,
  ready: false,
  reset: () => {},
});

function ClockProvider({ children }: { children: React.ReactNode }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(SNAPSHOT);

  useEffect(() => {
    const start = demoStartedAt();
    setStartedAt(start);
    setNow(demoNow(start));
    const id = setInterval(() => setNow(demoNow(start)), 1000);
    return () => clearInterval(id);
  }, []);

  const reset = useCallback(() => {
    resetDemoClock();
    window.location.reload();
  }, []);

  return (
    <ClockContext.Provider value={{ now, ready: startedAt != null, reset }}>
      {children}
    </ClockContext.Provider>
  );
}

export const useClock = () => useContext(ClockContext);

/* ---------- Decisions made in this session ---------- */

export interface LocalDecision {
  decision: "APPROVED" | "EDITED" | "REJECTED";
  at: number;
  whoPays?: WhoPays | null;
  note?: string;
  edits?: Record<string, string>;
  reference?: string;
}

interface DecisionStore {
  decisions: Record<string, LocalDecision>;
  decide: (proposalId: string, d: LocalDecision) => void;
  clear: () => void;
}

const DecisionContext = createContext<DecisionStore>({
  decisions: {},
  decide: () => {},
  clear: () => {},
});

const STORE_KEY = "bahn-decisions";

function DecisionProvider({ children }: { children: React.ReactNode }) {
  const [decisions, setDecisions] = useState<Record<string, LocalDecision>>({});

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE_KEY);
      if (saved) setDecisions(JSON.parse(saved));
    } catch {
      /* fine: decisions just won't survive a reload */
    }
  }, []);

  const persist = (next: Record<string, LocalDecision>) => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const decide = useCallback((proposalId: string, d: LocalDecision) => {
    setDecisions((prev) => {
      const next = { ...prev, [proposalId]: d };
      persist(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setDecisions({});
    persist({});
  }, []);

  const value = useMemo(() => ({ decisions, decide, clear }), [decisions, decide, clear]);
  return <DecisionContext.Provider value={value}>{children}</DecisionContext.Provider>;
}

export const useDecisions = () => useContext(DecisionContext);

/* ---------- Shift Watch panel open/closed ---------- */

const PanelContext = createContext<{
  open: boolean;
  /** "auto" until someone toggles it: CSS then shows it on wide screens only. */
  attr: "auto" | "true" | "false";
  setOpen: (v: boolean) => void;
  ask: (q: string) => void;
  pending: string | null;
  consume: () => void;
}>({
  open: true,
  attr: "auto",
  setOpen: () => {},
  ask: () => {},
  pending: null,
  consume: () => {},
});

const NARROW = "(max-width: 1179px)";

function PanelProvider({ children }: { children: React.ReactNode }) {
  const [explicit, setExplicit] = useState<boolean | null>(null);
  const [wide, setWide] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const update = () => setWide(!mq.matches);
    update();
    mq.addEventListener("change", update);
    try {
      if (!mq.matches && localStorage.getItem("bahn-panel") === "closed") setExplicit(false);
    } catch {
      /* ignore */
    }
    return () => mq.removeEventListener("change", update);
  }, []);

  const setOpen = useCallback((v: boolean) => {
    setExplicit(v);
    try {
      if (!window.matchMedia(NARROW).matches) localStorage.setItem("bahn-panel", v ? "open" : "closed");
    } catch {
      /* ignore */
    }
  }, []);

  const open = explicit ?? wide;
  const attr = explicit === null ? "auto" : explicit ? "true" : "false";

  const ask = useCallback(
    (q: string) => {
      setPending(q);
      setOpen(true);
    },
    [setOpen],
  );

  const consume = useCallback(() => setPending(null), []);

  return (
    <PanelContext.Provider value={{ open, attr, setOpen, ask, pending, consume }}>{children}</PanelContext.Provider>
  );
}

export const usePanel = () => useContext(PanelContext);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClockProvider>
      <DecisionProvider>
        <PanelProvider>{children}</PanelProvider>
      </DecisionProvider>
    </ClockProvider>
  );
}
