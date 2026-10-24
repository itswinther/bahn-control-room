import styles from "@/components/ui/skeleton.module.css";

export default function Loading() {
  return (
    <div className={styles.wrap} aria-busy="true">
      <p className={styles.label} role="status">
        Pulling up the order…
      </p>
      <div className={styles.line} style={{ width: "30%" }} />
      <div className={styles.block} style={{ height: 72, maxWidth: 720 }} />
      <div className={styles.block} style={{ height: 380 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 20 }}>
        <div className={styles.block} style={{ height: 320 }} />
        <div className={styles.block} style={{ height: 320, animationDelay: "120ms" }} />
      </div>
    </div>
  );
}
