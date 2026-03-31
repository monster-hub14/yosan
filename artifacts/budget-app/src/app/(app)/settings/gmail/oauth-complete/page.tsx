"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Suspense } from "react";
import Link from "next/link";

function OAuthCompleteInner() {
  const searchParams = useSearchParams();
  const [canCloseManually, setCanCloseManually] = useState(false);

  const status = searchParams.get("status");
  const error = searchParams.get("error");
  const isSuccess = status === "connected";

  useEffect(() => {
    // Broadcast the OAuth result to any listening main-app window via
    // BroadcastChannel. This works regardless of opener chain — the main app
    // listens on the same channel name and updates its UI on receipt.
    const channel = new BroadcastChannel("gmail_oauth_complete");
    channel.postMessage({
      status: isSuccess ? "connected" : "error",
      error: error ?? undefined,
    });
    channel.close();

    // Attempt to close this popup/tab after the broadcast has had time to
    // propagate. window.close() only works if this window was opened via
    // window.open() — browsers refuse to close user-navigated tabs.
    const closeTimer = setTimeout(() => {
      window.close();
      // If we're still running here, close() was refused (non-popup tab).
      // Show a manual-close message after a short grace period.
      setTimeout(() => setCanCloseManually(true), 300);
    }, 400);

    return () => clearTimeout(closeTimer);
  }, [isSuccess, error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-background">
      {isSuccess ? (
        <>
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          <p className="text-sm font-medium text-foreground">Gmail connected!</p>
          {canCloseManually ? (
            <>
              <p className="text-xs text-muted-foreground">
                You can close this tab.
              </p>
              <Link
                href="/settings/gmail"
                className="text-xs underline text-primary"
              >
                Return to Gmail settings
              </Link>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Closing this window…</p>
          )}
        </>
      ) : error ? (
        <>
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="text-sm font-medium text-foreground">Connection failed</p>
          <p className="text-xs text-muted-foreground font-mono">{error}</p>
          {canCloseManually ? (
            <>
              <p className="text-xs text-muted-foreground">
                You can close this tab.
              </p>
              <Link
                href="/settings/gmail"
                className="text-xs underline text-primary"
              >
                Return to Gmail settings
              </Link>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Closing this window…</p>
          )}
        </>
      ) : (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Finishing…</p>
        </>
      )}
    </div>
  );
}

export default function OAuthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <OAuthCompleteInner />
    </Suspense>
  );
}
