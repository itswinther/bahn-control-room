import type { Metadata } from "next";
import { slackFeed } from "@/lib/shift-watch/pager";
import { Slack } from "@/components/slack/slack";

// Live data on the demo clock: render on every request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Slack (mock) · Control room" };

export default async function SlackPage(props: PageProps<"/slack">) {
  const { room, dm } = await props.searchParams;
  return <Slack feed={await slackFeed()} room={typeof room === "string" ? room : null} dm={typeof dm === "string" ? dm : null} />;
}
