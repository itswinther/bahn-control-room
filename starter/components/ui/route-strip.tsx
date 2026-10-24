import styles from "./route-strip.module.css";

/**
 * Pickup to delivery, drawn like the route on Bahn's map cards: an orange
 * origin pin, an asphalt destination pin and the leg between. It shows the
 * route only, never progress, so it can't suggest a car is moving when it isn't.
 */
export function RouteStrip({
  from,
  to,
  fromCode,
  toCode,
  size = "m",
}: {
  from: string;
  to: string;
  fromCode?: string;
  toCode?: string;
  size?: "s" | "m";
}) {
  return (
    <div className={styles.strip} data-size={size}>
      <span className="visually-hidden">
        From {from} to {to}
      </span>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.pin} data-end="a">
          A
        </span>
        <span className={styles.line} />
        <span className={styles.pin} data-end="b">
          B
        </span>
      </div>
      <div className={styles.labels} aria-hidden="true">
        <span>
          {fromCode && <span className={styles.code}>{fromCode}</span>}
          {from}
        </span>
        <span>
          {toCode && <span className={styles.code}>{toCode}</span>}
          {to}
        </span>
      </div>
    </div>
  );
}

export function splitRoute(route: string | null): [string, string] | null {
  if (!route) return null;
  const parts = route.split("→").map((p) => p.trim());
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}
