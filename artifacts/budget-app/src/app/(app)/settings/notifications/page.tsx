import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { NotificationsForm } from "./notifications-form";

export const metadata: Metadata = {
  title: "Notifications | Settings | Yosan AI",
};

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <NotificationsForm />;
}
