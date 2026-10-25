"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, PanelRightClose, PanelRightOpen, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { useClock, usePanel } from "./providers";
import { DemoMenu, DeskPicker } from "./demo-menu";
import { dayClock } from "@/lib/ui/present";
import styles from "./header.module.css";

type Theme = "system" | "light" | "dark";

function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("bahn-theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      /* ignore */
    }
  }, []);
  const cycle = () => {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem("bahn-theme");
      else localStorage.setItem("bahn-theme", next);
    } catch {
      /* ignore */
    }
  };
  return { theme, cycle };
}

export function Wordmark() {
  return (
    <span className={styles.wordmark}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <rect x="3" y="3.5" width="18" height="4.2" rx="2.1" fill="currentColor" />
        <rect x="3" y="9.9" width="12" height="4.2" rx="2.1" fill="currentColor" />
        <rect x="3" y="16.3" width="18" height="4.2" rx="2.1" fill="currentColor" />
      </svg>
      bahn
    </span>
  );
}

export function Header({ live }: { live: boolean }) {
  const { now } = useClock();
  const { open, setOpen } = usePanel();
  const { theme, cycle } = useTheme();
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : SunMoon;
  const themeLabel = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Match system";
  const pathname = usePathname();
  const inInbox = pathname.startsWith("/inbox") || pathname.startsWith("/cases");
  const inSlack = pathname.startsWith("/slack");

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Link href="/" className={styles.home} aria-label="Bahn control room, overview">
          <Wordmark />
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" aria-current={!inInbox && !inSlack ? "page" : undefined}>
            Overview
          </Link>
          <Link href="/inbox" aria-current={inInbox ? "page" : undefined}>
            Inbox
          </Link>
          <Link href="/slack" aria-current={inSlack ? "page" : undefined}>
            Slack (mock)
          </Link>
        </nav>
      </div>

      <div className={styles.right}>
        <span className={styles.clock} title="Demo clock: starts at the data snapshot and runs in real time">
          <span className={styles.liveDot} aria-hidden="true" />
          <span className="visually-hidden">Demo time </span>
          <span suppressHydrationWarning>{dayClock(now)}</span>
        </span>
        <DeskPicker />
        <DemoMenu live={live} />
        <button
          type="button"
          className={styles.iconButton}
          onClick={cycle}
          aria-label={`Theme: ${themeLabel}. Change theme`}
          title={`Theme: ${themeLabel}`}
        >
          <ThemeIcon size={20} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className={styles.panelButton}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="shift-watch"
        >
          {open ? <PanelRightClose size={18} strokeWidth={1.6} /> : <PanelRightOpen size={18} strokeWidth={1.6} />}
          <span>Shift Watch</span>
        </button>
      </div>
    </header>
  );
}
