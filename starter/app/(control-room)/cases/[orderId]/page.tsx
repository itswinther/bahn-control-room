import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCase, getQueue } from "@/lib/ui/data";
import { Workspace } from "@/components/workspace/workspace";

export async function generateMetadata(props: PageProps<"/cases/[orderId]">): Promise<Metadata> {
  const { orderId } = await props.params;
  const data = await getCase(orderId);
  return { title: data ? `${data.order.reference} · Control room` : "Order not found · Control room" };
}

export default async function CasePage(props: PageProps<"/cases/[orderId]">) {
  const { orderId } = await props.params;
  const [queue, data] = await Promise.all([getQueue(), getCase(orderId)]);
  if (!data) notFound();
  return <Workspace queue={queue} data={data} selectedId={orderId} isCaseRoute />;
}
