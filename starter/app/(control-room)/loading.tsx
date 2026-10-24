import styles from "@/components/ui/skeleton.module.css";

export default function Loading() {
  return (
    <div className={styles.wrap} aria-busy="true">
      <p className={styles.label} role="status">
        Sorting today’s calls…
      </p>
      <div className={styles.block} style={{ height: 120, maxWidth: 560 }} />
      <div className={styles.line} style={{ width: "70%" }} />
      <div className={styles.line} style={{ width: "58%" }} />
      <div style={{ height: 24 }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.block} style={{ height: 132, animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}
