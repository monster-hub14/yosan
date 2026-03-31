import { Metadata } from "next";
import { ReceiptsLanding } from "./receipts-landing";

export const metadata: Metadata = { title: "Receipts | Yosan AI" };

export default function ReceiptsPage() {
  return <ReceiptsLanding />;
}
