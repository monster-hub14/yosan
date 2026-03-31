import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ForecastDashboard } from "./forecast-dashboard";

export const metadata: Metadata = { title: "Forecast | Yosan AI" };

export default async function ForecastPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ForecastDashboard />;
}
