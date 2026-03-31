import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AISettingsForm } from "./ai-form";

export const metadata: Metadata = {
  title: "AI Settings | Yosan AI",
};

export default async function AISettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  return <AISettingsForm />;
}
