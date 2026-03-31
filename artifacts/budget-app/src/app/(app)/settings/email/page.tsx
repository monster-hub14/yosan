import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { EmailSettingsForm } from "./email-form";

export const metadata: Metadata = {
  title: "Email Settings | Yosan AI",
};

export default async function EmailSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  return <EmailSettingsForm />;
}
