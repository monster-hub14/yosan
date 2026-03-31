"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2, Mail, CheckCircle2, AlertCircle, RefreshCw, LogOut,
  Tag, Calendar, Hash, ArrowRight, Info, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface GmailStatus {
  oauthConfigured: boolean;
  status: "not_connected" | "connected" | "revoked";
  tokenEmail: string | null;
  connectedAt: string | null;
  selectedLabelIds: string[];
  selectedLabelNames: Record<string, string>;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  syncCutoffDate: string | null;
  maxPerSync: number;
}

interface GmailLabel {
  id: string;
  name: string;
}

interface Budget {
  id: string;
  name: string;
}

interface Props {
  budgets: Budget[];
  defaultBudgetId?: string;
}

export function GmailSettingsClient({ budgets, defaultBudgetId }: Props) {
  const searchParams = useSearchParams();

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [syncCutoffDate, setSyncCutoffDate] = useState("");
  const [maxPerSync, setMaxPerSync] = useState(50);
  const [savingLabels, setSavingLabels] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(
    defaultBudgetId ?? budgets[0]?.id ?? ""
  );

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/settings/gmail/status");
    const data = await res.json();
    if (data.ok) {
      setStatus(data as GmailStatus & { ok: boolean });
      setSelectedLabelIds(data.selectedLabelIds ?? []);
      setMaxPerSync(data.maxPerSync ?? 50);
      if (data.syncCutoffDate) {
        setSyncCutoffDate(data.syncCutoffDate.slice(0, 10));
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus().finally(() => setLoadingStatus(false));
  }, [fetchStatus]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected === "1") toast.success("Gmail connected successfully!");
    if (error) toast.error(`Gmail connection failed: ${error.replace(/_/g, " ")}`);
  }, [searchParams]);

  function openOAuthPopup() {
    const width = 520;
    const height = 680;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

    // Build an absolute auth URL so it resolves correctly in all contexts.
    const authUrl = new URL("/api/settings/gmail/auth", window.location.href).href;

    const popup = window.open(
      authUrl,
      "gmail-oauth",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      // Popup blocked by the browser — do NOT navigate the current tab.
      toast.error(
        "Popups are blocked. Please allow popups for this page and try again."
      );
      return;
    }

    // BroadcastChannel lets the relay page notify us without depending on
    // window.opener — it works whether the window opened as a popup or a tab.
    const channel = new BroadcastChannel("gmail_oauth_complete");

    channel.onmessage = (event: MessageEvent) => {
      channel.close();
      clearInterval(pollClose);
      if (event.data?.status === "connected") {
        toast.success("Gmail connected successfully!");
        fetchStatus();
      } else {
        const err = String(event.data?.error ?? "unknown").replace(/_/g, " ");
        toast.error(`Gmail connection failed: ${err}`);
      }
    };

    // Clean up channel if the popup/tab is closed before OAuth completes.
    const pollClose = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClose);
        channel.close();
      }
    }, 500);
  }

  async function loadLabels() {
    setLoadingLabels(true);
    try {
      const res = await fetch("/api/settings/gmail/labels");
      const data = await res.json();
      if (data.ok) {
        setLabels(data.labels ?? []);
      } else if (data.reconnect_required) {
        toast.error("Gmail disconnected. Please reconnect.");
        fetchStatus();
      } else {
        toast.error(data.error || "Failed to load labels");
      }
    } finally {
      setLoadingLabels(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Gmail? Your pending imports will not be deleted.")) return;
    const res = await fetch("/api/settings/gmail/disconnect", { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast.success("Gmail disconnected");
      fetchStatus();
      setLabels([]);
    } else {
      toast.error("Failed to disconnect Gmail");
    }
  }

  async function handleSaveLabels() {
    if (selectedLabelIds.length === 0) {
      toast.error("Select at least one label");
      return;
    }
    setSavingLabels(true);
    const labelNames: Record<string, string> = {};
    for (const id of selectedLabelIds) {
      const found = labels.find((l) => l.id === id);
      if (found) labelNames[id] = found.name;
    }
    try {
      const res = await fetch("/api/settings/gmail/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labelIds: selectedLabelIds,
          labelNames,
          syncCutoffDate: syncCutoffDate || null,
          maxPerSync,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Gmail settings saved");
        fetchStatus();
      } else {
        toast.error(data.error || "Failed to save settings");
      }
    } finally {
      setSavingLabels(false);
    }
  }

  async function handleSync() {
    if (!selectedBudgetId) {
      toast.error("Select a budget first");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(`/api/budgets/${selectedBudgetId}/gmail/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        const msg =
          data.imported === 0
            ? "No new emails found"
            : `Imported ${data.imported} email${data.imported !== 1 ? "s" : ""}${data.skipped ? ` (${data.skipped} already imported)` : ""}`;
        toast.success(msg);
        fetchStatus();
      } else if (data.reconnect_required) {
        toast.error("Gmail disconnected. Please reconnect.");
        fetchStatus();
      } else {
        toast.error(data.error || "Sync failed");
      }
    } finally {
      setSyncing(false);
    }
  }

  function toggleLabel(id: string) {
    setSelectedLabelIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  if (loadingStatus) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Failed to load Gmail status.
      </div>
    );
  }

  const isConnected = status.status === "connected";
  const isRevoked = status.status === "revoked";

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Connection card */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Gmail Account</CardTitle>
                <CardDescription>
                  Connect your Gmail to automatically import receipts sent to your inbox.
                </CardDescription>
              </div>
            </div>
            {isConnected && (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shrink-0"
              >
                <CheckCircle2 className="w-3 h-3" />
                Connected
              </Badge>
            )}
            {isRevoked && (
              <Badge
                variant="outline"
                className="gap-1 border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400 shrink-0"
              >
                <AlertCircle className="w-3 h-3" />
                Token revoked
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status.oauthConfigured && (
            <div className="flex gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <p className="text-amber-700 dark:text-amber-400">
                Gmail OAuth is not configured. Ask your admin to add Google OAuth credentials in
                Instance Settings → Gmail OAuth.
              </p>
            </div>
          )}

          {isRevoked && (
            <div className="flex gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <p className="text-red-700 dark:text-red-400">
                Your Gmail access was revoked. Reconnect to continue importing receipts.
              </p>
            </div>
          )}

          {isConnected ? (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">Connected as </span>
                <span className="font-medium">{status.tokenEmail}</span>
                {status.connectedAt && (
                  <span className="text-muted-foreground ml-2">
                    · since {new Date(status.connectedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDisconnect}
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              disabled={!status.oauthConfigured}
              onClick={openOAuthPopup}
            >
              <Mail className="w-4 h-4 mr-2" />
              {isRevoked ? "Reconnect Gmail" : "Connect Gmail"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Label config */}
      {isConnected && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Labels to import from</CardTitle>
            </div>
            <CardDescription>
              Emails in these labels will be checked when you sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadLabels} disabled={loadingLabels}>
                {loadingLabels ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {labels.length > 0 ? "Refresh labels" : "Load labels"}
              </Button>
              {status.selectedLabelIds.length > 0 && labels.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {status.selectedLabelIds.length} label
                  {status.selectedLabelIds.length !== 1 ? "s" : ""} previously saved
                </p>
              )}
            </div>

            {labels.length > 0 && (
              <div className="max-h-52 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                {labels.map((label) => (
                  <label
                    key={label.id}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedLabelIds.includes(label.id)}
                      onCheckedChange={() => toggleLabel(label.id)}
                    />
                    <span>{label.name}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  Only import after
                </Label>
                <Input
                  type="date"
                  value={syncCutoffDate}
                  onChange={(e) => setSyncCutoffDate(e.target.value)}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">Leave blank to import all</p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Hash className="w-3.5 h-3.5" />
                  Max emails per sync
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={maxPerSync}
                  onChange={(e) => setMaxPerSync(Math.max(1, parseInt(e.target.value) || 50))}
                  className="text-sm"
                />
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleSaveLabels}
              disabled={savingLabels || selectedLabelIds.length === 0}
            >
              {savingLabels ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Save label settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sync */}
      {isConnected && status.selectedLabelIds.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Sync now</CardTitle>
            </div>
            <CardDescription>
              Fetch new emails from your selected labels and add them to your receipt inbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.lastSyncAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RotateCcw className="w-3.5 h-3.5" />
                Last synced {new Date(status.lastSyncAt).toLocaleString()}
              </div>
            )}

            {status.lastSyncError && (
              <div className="flex gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <p className="text-red-700 dark:text-red-400">
                  Last sync error: {status.lastSyncError}
                </p>
              </div>
            )}

            <div className="flex items-end gap-3">
              {budgets.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Import into budget</Label>
                  <Select
                    value={selectedBudgetId}
                    onValueChange={setSelectedBudgetId}
                  >
                    <SelectTrigger className="w-48 text-sm">
                      <SelectValue placeholder="Select budget" />
                    </SelectTrigger>
                    <SelectContent>
                      {budgets.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleSync} disabled={syncing} size="sm">
                {syncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sync inbox
              </Button>
            </div>

            <div className="flex gap-1.5 p-3 rounded-md bg-muted/40 border border-border text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>
                All imported emails are added as pending imports for your review. Nothing is
                automatically added to your budget.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
