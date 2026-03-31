import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { GmailOAuthForm } from "./gmail-oauth-form";

export const metadata: Metadata = {
  title: "Gmail OAuth Config | Yosan AI",
};

export default async function GmailOAuthPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  return <GmailOAuthForm />;
}
