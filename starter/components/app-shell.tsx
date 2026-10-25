"use client";

import { Header } from "./header";
import { ShiftWatchPanel } from "./shift-watch-panel";
import { usePanel } from "./providers";
import styles from "./app-shell.module.css";

export function AppShell({ children, live }: { children: React.ReactNode; live: boolean }) {
  const { attr, setOpen } = usePanel();
  return (
    <div className={styles.shell} data-panel={attr}>
      <a href="#main" className={styles.skip}>
        Skip to the queue
      </a>
      <Header live={live} />
      <div className={styles.body}>
        <main id="main" className={styles.main}>
          {children}
        </main>
        <div className={styles.scrim} aria-hidden="true" onClick={() => setOpen(false)} />
        <ShiftWatchPanel />
      </div>
    </div>
  );
}
