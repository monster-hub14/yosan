import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import NewBudgetForm from "./NewBudgetForm";

export const metadata: Metadata = { title: "New Budget | Yosan AI" };

export default async function NewBudgetPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Budget</h1>
        <p className="text-muted-foreground text-sm">Set up a new budget to track income and expenses</p>
      </div>
      <NewBudgetForm />
    </div>
  );
}
