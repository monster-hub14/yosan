import { Metadata } from "next";
import { InboxClient } from "./inbox-client";

export const metadata: Metadata = { title: "Receipt Inbox | Yosan AI" };

export default function InboxPage() {
  return <InboxClient />;
}
