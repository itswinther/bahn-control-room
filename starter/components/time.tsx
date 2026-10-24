"use client";

import { useClock } from "./providers";
import { age, clock, relative } from "@/lib/ui/present";

/**
 * Relative times render on the client only, against the demo clock.
 * The server (and first paint) shows the plain clock time instead, so nothing jumps.
 */
export function Relative({ at, tz }: { at: string; tz?: string }) {
  const { now, ready } = useClock();
  const t = Date.parse(at);
  return (
    <time dateTime={at} title={clock(at, tz)} suppressHydrationWarning>
      {ready ? relative(t, now) : clock(at, tz)}
    </time>
  );
}

export function Age({ at, prefix = "" }: { at: string; prefix?: string }) {
  const { now, ready } = useClock();
  const t = Date.parse(at);
  return (
    <time dateTime={at} title={clock(at)} suppressHydrationWarning>
      {prefix}
      {ready ? age(t, now) : clock(at)}
    </time>
  );
}
