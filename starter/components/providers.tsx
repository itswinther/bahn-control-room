"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SNAPSHOT, syncDemoClock } from "@/lib/ui/clock";
import type { Desk } from "@/lib/ui/contract";

/* ---------- Demo clock ---------- */

const ClockContext = createContext<{ now: number; ready: boolean; reset: () => Promise<void> }>({
  now: SNAPSHOT,
  ready: false,
  reset: async () => {},
});

// The server owns the demo clock (GET /api/clock); the browser keeps the offset and ticks locally.
function ClockProvider({ children }: { children: React.ReactNode }) {
  const [offset, setOffset] = useState<number | null>(null);
  const [now, setNow] = useState(SNAPSHOT);

  useEffect(() => {
    let alive = true;
    const sync = () => syncDemoClock().then((o) => alive && o != null && setOffset(o));
    sync();
    const resync = setInterval(sync, 60_000);
    return () => {
      alive = false;
      clearInterval(resync);
    };
  }, []);

  useEffect(() => {
    if (offset == null) return;
    setNow(Date.now() + offset);
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);

  const reset = useCallback(async () => {
    await fetch("/api/clock", { method: "POST" });
    window.location.assign("/");
  }, []);

  return <ClockContext.Provider value={{ now, ready: offset != null, reset }}>{children}</ClockContext.Provider>;
}

export const useClock = () => useContext(ClockContext);

/* ---------- Who is deciding ---------- */

// A stand-in for sign-in: decisions go to the backend with this desk as the reviewer, and the backend
// checks it may decide (the shift lead may decide anything).
const DeskContext = createContext<{ desk: Desk; setDesk: (d: Desk) => void }>({ desk: "ops-shift", setDesk: () => {} });

function DeskProvider({ children }: { children: React.ReactNode }) {
  const [desk, setDeskState] = useState<Desk>("ops-shift");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bahn-desk");
      if (saved?.startsWith("ops-")) setDeskState(saved as Desk);
    } catch {
      /* ignore */
    }
  }, []);
  const setDesk = useCallback((d: Desk) => {
    setDeskState(d);
    try {
      localStorage.setItem("bahn-desk", d);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo(() => ({ desk, setDesk }), [desk, setDesk]);
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export const useDesk = () => useContext(DeskContext);

/** Re-read the page's data every few seconds while it's visible, so agents' work shows up by itself. */
export function useLiveRefresh(ms = 6000) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [router, ms]);
}

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
      <DeskProvider>
        <PanelProvider>{children}</PanelProvider>
      </DeskProvider>
    </ClockProvider>
  );
}
