import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export default async function RootPage() {
  const session = await getSession();

  if (!session) {
    let setupComplete = false;
    try {
      const progress = await db.setupProgress.findUnique({
        where: { id: "singleton" },
      });
      setupComplete = !!(progress?.completedAt);
    } catch {
      setupComplete = false;
    }

    if (!setupComplete) {
      redirect("/setup");
    }
    redirect("/login");
  }

  redirect("/dashboard");
}
