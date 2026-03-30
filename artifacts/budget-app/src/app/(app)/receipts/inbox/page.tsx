import { Metadata } from "next";
import { InboxClient } from "./inbox-client";

export const metadata: Metadata = { title: "Receipt Inbox | Budget" };

export default function InboxPage() {
  return <InboxClient />;
}
