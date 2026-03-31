import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AnalysisDashboard } from "./analysis-dashboard";

export const metadata: Metadata = { title: "Analysis | Yosan AI" };

export default async function AnalysisPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AnalysisDashboard />;
}
