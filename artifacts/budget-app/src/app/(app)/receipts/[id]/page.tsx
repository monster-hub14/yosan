import { Metadata } from "next";
import { ReviewClient } from "./review-client";

export const metadata: Metadata = { title: "Review Receipt | Budget" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  return <ReviewClient id={id} />;
}
