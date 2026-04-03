import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign In | Yosan AI",
};

export default async function LoginPage() {
  let adminAccountCreated = false;
  try {
    const progress = await db.setupProgress.findUnique({
      where: { id: "singleton" },
      select: { adminAccountCreated: true },
    });
    adminAccountCreated = progress?.adminAccountCreated === true;
  } catch {
    // DB may not be initialised yet on a fresh install
  }

  if (!adminAccountCreated) {
    redirect("/setup");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center justify-center">
          <img src="/logo.png" alt="Yosan AI Logo" className="w-72 h-72" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Yosan AI</h1>
          <p className="text-sm text-muted-foreground">AI-powered budget tracker</p>
        </div>
      </div>

      <LoginForm />

      <p className="text-center text-xs text-muted-foreground">
        Self-hosted &middot;{" "}
        <Link
          href="https://github.com/monster-hub14/yosan"
          target="_blank"
          className="underline hover:text-foreground transition-colors"
        >
          View on GitHub
        </Link>
      </p>
    </div>
  );
}
