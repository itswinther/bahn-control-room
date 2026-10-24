import { getQueue } from "@/lib/ui/data";
import { Overview } from "@/components/overview/overview";

// Live data on the demo clock: render on every request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const queue = await getQueue();
  return <Overview queue={queue} />;
}
