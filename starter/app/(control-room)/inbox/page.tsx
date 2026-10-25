import type { Metadata } from "next";
import { getCase, getQueue } from "@/lib/ui/data";
import { sortQueue } from "@/lib/ui/queue";
import { Workspace } from "@/components/workspace/workspace";

// Live data on the demo clock: render on every request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inbox · Control room" };

export default async function InboxPage(props: PageProps<"/inbox">) {
  const { team } = await props.searchParams;
  const queue = await getQueue(typeof team === "string" ? team : null);
  // Open the most urgent call straight away.
  const first = sortQueue(queue.items)[0];
  const data = first ? await getCase(first.order_id) : null;
  return <Workspace queue={queue} data={data} selectedId={first?.order_id ?? null} isCaseRoute={false} team={typeof team === "string" ? team : null} />;
}
