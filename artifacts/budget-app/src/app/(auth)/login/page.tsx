import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign In | Budget",
};

export default async function LoginPage() {
  let setupComplete = false;
  try {
    const progress = await db.setupProgress.findUnique({
      where: { id: "singleton" },
      select: { completedAt: true },
    });
    setupComplete = progress?.completedAt != null;
  } catch {
    // DB may not be initialised yet on a fresh install
  }

  if (!setupComplete) {
    redirect("/setup");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Budget</h1>
          <p className="text-sm text-muted-foreground">AI-powered budget tracker</p>
        </div>
      </div>

      <LoginForm />

      <p className="text-center text-xs text-muted-foreground">
        Self-hosted &middot;{" "}
        <Link
          href="https://github.com"
          className="underline hover:text-foreground transition-colors"
        >
          View on GitHub
        </Link>
      </p>
    </div>
  );
}
