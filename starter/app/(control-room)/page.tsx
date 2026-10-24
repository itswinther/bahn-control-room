import { getQueue } from "@/lib/ui/data";
import { Overview } from "@/components/overview/overview";

export default async function Home() {
  const queue = await getQueue();
  return <Overview queue={queue} />;
}
