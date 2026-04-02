import { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import SetupWizard from "@/components/setup/SetupWizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Setup | Yosan AI",
};

export default async function SetupPage() {
  let adminAccountCreated = false;

  try {
    const progress = await db.setupProgress.findUnique({
      where: { id: "singleton" },
      select: { adminAccountCreated: true },
    });
    adminAccountCreated = progress?.adminAccountCreated === true;
  } catch {
    // DB might not be initialized yet — allow setup to proceed
  }

  if (adminAccountCreated) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl">
        <SetupWizard />
      </div>
    </div>
  );
}
