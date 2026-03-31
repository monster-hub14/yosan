"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Suspense } from "react";

function OAuthCompleteInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const status = searchParams.get("status");
  const error = searchParams.get("error");
  const isSuccess = status === "connected";

  useEffect(() => {
    // Give the DOM a moment to render before acting
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && window.opener) {
        // Running in a popup — send message to parent and close
        try {
          window.opener.postMessage(
            {
              type: "gmail_oauth_complete",
              status: isSuccess ? "connected" : "error",
              error: error ?? undefined,
            },
            window.location.origin
          );
        } catch {
          // opener may have been closed or cross-origin
        }
        window.close();
      } else {
        // Not in a popup — navigate the tab to the settings page
        if (isSuccess) {
          router.replace("/settings/gmail?connected=1");
        } else {
          router.replace(`/settings/gmail?error=${encodeURIComponent(error ?? "unknown")}`);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isSuccess, error, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-background">
      {isSuccess ? (
        <>
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          <p className="text-sm font-medium text-foreground">Gmail connected!</p>
          <p className="text-xs text-muted-foreground">Closing this window…</p>
        </>
      ) : error ? (
        <>
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="text-sm font-medium text-foreground">Connection failed</p>
          <p className="text-xs text-muted-foreground font-mono">{error}</p>
          <p className="text-xs text-muted-foreground">Closing this window…</p>
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
