"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Receipt, Upload, Inbox, Clock, CheckCircle2, ArrowRight, Mail,
  RefreshCw, Loader2, AlertCircle, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadReceiptModal } from "@/components/receipts/upload-modal";
import Link from "next/link";
import { toast } from "sonner";

interface GmailStatus {
  oauthConfigured: boolean;
  status: "not_connected" | "connected" | "revoked";
  tokenEmail: string | null;
  selectedLabelIds: string[];
  lastSyncAt: string | null;
}

interface Budget {
  id: string;
  name: string;
}

export function ReceiptsLanding({ defaultBudgetId }: { defaultBudgetId?: string }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number } | null>(null);

  useEffect(() => {
    fetch("/api/settings/gmail/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setGmailStatus(data as GmailStatus & { ok: boolean });
      })
      .catch(() => {});
  }, []);

  const gmailReadyToSync =
    gmailStatus?.status === "connected" && gmailStatus.selectedLabelIds.length > 0;
  const gmailConnected = gmailStatus?.status === "connected";
  const gmailRevoked = gmailStatus?.status === "revoked";

  async function handleQuickSync() {
    if (!defaultBudgetId || !gmailReadyToSync) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/budgets/${defaultBudgetId}/gmail/sync`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setSyncResult({ imported: data.imported, skipped: data.skipped ?? 0 });
        if (data.imported === 0) {
          toast.info("No new emails found");
        } else {
          toast.success(
            `Imported ${data.imported} email${data.imported !== 1 ? "s" : ""} from Gmail`
          );
        }
        // Refresh gmail status for last sync time
        fetch("/api/settings/gmail/status")
          .then((r) => r.json())
          .then((d) => { if (d.ok) setGmailStatus(d); })
          .catch(() => {});
      } else if (data.reconnect_required) {
        toast.error("Gmail disconnected. Please reconnect.");
        setGmailStatus((prev) => prev ? { ...prev, status: "revoked" } : prev);
      } else {
        toast.error(data.error || "Sync failed");
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8">
      <UploadReceiptModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <div className="flex justify-center">
          <div className="p-4 rounded-2xl bg-primary/10">
            <Receipt className="w-10 h-10 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold">Smart Receipt Inbox</h1>
        <p className="text-muted-foreground">
          Upload receipts or import from Gmail — AI extracts merchant, date, total, and line items,
          then routes them to your inbox for review.
        </p>
      </motion.div>

      {/* Main actions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <Button
          size="lg"
          className="h-14 text-base gap-3"
          onClick={() => setUploadOpen(true)}
        >
          <Upload className="w-5 h-5" />
          Upload a receipt
        </Button>

        {/* Gmail import card — connection-aware */}
        {gmailReadyToSync ? (
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-base gap-3 w-full"
            onClick={handleQuickSync}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5" />
            )}
            {syncing ? "Syncing Gmail…" : "Sync Gmail inbox"}
          </Button>
        ) : (
          <Link href="/settings/gmail" className="block">
            <Button
              size="lg"
              variant="outline"
              className="h-14 text-base gap-3 w-full"
            >
              <Mail className="w-5 h-5" />
              Import from Gmail
            </Button>
          </Link>
        )}
      </motion.div>

      {/* Gmail status / result feedback */}
      {(gmailRevoked || (gmailConnected && gmailStatus.selectedLabelIds.length === 0) || syncResult) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          {gmailRevoked && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="text-red-700 dark:text-red-400">
                  Your Gmail access was revoked.{" "}
                </span>
                <Link href="/settings/gmail" className="underline text-red-600 dark:text-red-400">
                  Reconnect
                </Link>
              </div>
            </div>
          )}
          {gmailConnected && gmailStatus.selectedLabelIds.length === 0 && !gmailRevoked && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
              <Settings className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="text-amber-700 dark:text-amber-400">
                  Connected as {gmailStatus.tokenEmail} — select Gmail labels to enable sync.{" "}
                </span>
                <Link href="/settings/gmail" className="underline text-amber-600 dark:text-amber-400">
                  Configure
                </Link>
              </div>
            </div>
          )}
          {syncResult && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <span>
                {syncResult.imported === 0
                  ? "No new emails found."
                  : `${syncResult.imported} email${syncResult.imported !== 1 ? "s" : ""} imported`}
                {syncResult.skipped > 0 && ` · ${syncResult.skipped} already imported`}
              </span>
              {syncResult.imported > 0 && (
                <Link href="/receipts/inbox" className="ml-auto">
                  <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted">
                    Review <ArrowRight className="w-3 h-3" />
                  </Badge>
                </Link>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Quick links */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {[
          {
            href: "/receipts/inbox",
            icon: Inbox,
            label: "Inbox",
            desc: "Review pending receipts",
            color: "text-amber-500",
            bg: "bg-amber-500/10",
          },
          {
            href: "/receipts/inbox?status=CONFIRMED",
            icon: CheckCircle2,
            label: "Confirmed",
            desc: "Receipts added to budget",
            color: "text-green-500",
            bg: "bg-green-500/10",
          },
          {
            href: "/receipts/inbox?status=PROCESSING",
            icon: Clock,
            label: "Processing",
            desc: "Being read by AI",
            color: "text-blue-500",
            bg: "bg-blue-500/10",
          },
        ].map(({ href, icon: Icon, label, desc, color, bg }) => (
          <Link key={href} href={href}>
            <Card className="border-border hover:border-primary/40 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`p-2 rounded-lg ${bg} mt-0.5`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto self-center shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          How it works
        </p>
        <div className="space-y-2">
          {[
            { n: 1, text: "Upload a receipt photo/PDF or import receipt emails from Gmail" },
            { n: 2, text: "AI reads the merchant, date, total, and individual line items" },
            { n: 3, text: "Review the extracted data, assign categories, and confirm" },
            { n: 4, text: "The expense is added to your budget automatically" },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {n}
              </span>
              <p className="text-sm">{text}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
