import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ maxWidth: 640, margin: "48px auto", display: "grid", gap: 16, justifyItems: "start" }}>
      <p className="eyebrow">Not found</p>
      <h1 className="display" style={{ fontSize: 48 }}>
        Order not here
      </h1>
      <p>It may be closed, or the link is off. Everything that needs you is on the queue.</p>
      <Link
        href="/"
        style={{
          height: 48,
          display: "inline-flex",
          alignItems: "center",
          padding: "0 22px",
          borderRadius: 999,
          background: "var(--accent)",
          color: "var(--accent-fg)",
          fontWeight: 600,
        }}
      >
        Back to the queue
      </Link>
    </div>
  );
}
