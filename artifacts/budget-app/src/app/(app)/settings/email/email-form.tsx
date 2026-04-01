"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Save,
  Mail,
  Eye,
  EyeOff,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// safeJson: safely parses a fetch Response body without throwing.
// Returns null for empty bodies, non-JSON bodies, or malformed JSON.
// ---------------------------------------------------------------------------
async function safeJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  try {
    const text = await res.text();
    if (!text.trim()) return null;
    // Parse if content-type says JSON, or if body looks like JSON
    if (
      ct.includes("application/json") ||
      text.trimStart().startsWith("{") ||
      text.trimStart().startsWith("[")
    ) {
      return JSON.parse(text);
    }
    return null;
  } catch {
    return null;
  }
}

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: string;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  fromName: string;
  isEnabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}

const DEFAULT_CONFIG: EmailConfig = {
  smtpHost: "",
  smtpPort: 587,
  smtpEncryption: "STARTTLS",
  smtpUser: "",
  smtpPass: "",
  fromAddress: "",
  fromName: "Yosan AI",
  isEnabled: false,
  lastTestedAt: null,
  lastTestOk: null,
  lastTestError: null,
};

type StatusKind = "not_configured" | "saved" | "verified" | "failed";

function getStatus(config: EmailConfig, hasSavedOnce: boolean): StatusKind {
  if (!hasSavedOnce || !config.smtpHost) return "not_configured";
  if (config.lastTestOk === true) return "verified";
  if (config.lastTestOk === false) return "failed";
  return "saved";
}

function StatusBadge({ kind, lastTestedAt }: { kind: StatusKind; lastTestedAt: string | null }) {
  const fmtTime = lastTestedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(lastTestedAt))
    : null;

  if (kind === "verified") {
    return (
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          Verified working
        </Badge>
        {fmtTime && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {fmtTime}
          </span>
        )}
      </div>
    );
  }
  if (kind === "failed") {
    return (
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="gap-1 border-destructive/50 bg-destructive/10 text-destructive">
          <XCircle className="w-3 h-3" />
          Last test failed
        </Badge>
        {fmtTime && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {fmtTime}
          </span>
        )}
      </div>
    );
  }
  if (kind === "saved") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        <AlertCircle className="w-3 h-3" />
        Saved — not verified
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <AlertCircle className="w-3 h-3" />
      Not configured
    </Badge>
  );
}

export function EmailSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; lastTestedAt?: string } | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [config, setConfig] = useState<EmailConfig>(DEFAULT_CONFIG);
  /**
   * Snapshot of the smtpHost last confirmed by the server (on load or successful save).
   * Used for canTest so that unsaved form edits (e.g. clearing the host field) don't
   * disable the test button — the server still has the saved config.
   */
  const [savedSmtpHost, setSavedSmtpHost] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/settings/email");
      const data = await safeJson(res) as Record<string, unknown> | null;

      if (data === null) {
        setLoadError(
          res.ok
            ? "Unexpected response from server — please reload the page"
            : `Server error (${res.status}) — check server logs`
        );
        return;
      }

      if (!data.ok) {
        const msg = typeof data.error === "string" && data.error
          ? data.error
          : "Failed to load email settings";
        setLoadError(msg);
        return;
      }

      const cfg = data.config as Partial<EmailConfig> | null | undefined;
      if (cfg) {
        const loaded: EmailConfig = { ...DEFAULT_CONFIG, ...cfg };
        setConfig(loaded);
        setSavedSmtpHost(loaded.smtpHost || null);
        if (loaded.fromAddress || (loaded.fromName && loaded.fromName !== "Yosan AI")) {
          setAdvancedOpen(true);
        }
      }
    } catch {
      setLoadError("Failed to load email settings — please reload the page");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const statusKind = getStatus(config, !!savedSmtpHost);
  /** Test is available only when the server has a saved SMTP host, regardless of current form edits. */
  const canTest = !!savedSmtpHost;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await safeJson(res) as Record<string, unknown> | null;

      if (data === null) {
        toast.error(res.ok ? "Unexpected response from server" : "Server error — check server logs");
        return;
      }

      if (!data.ok) {
        toast.error(
          typeof data.error === "string" && data.error ? data.error : "Failed to save"
        );
        return;
      }

      // Confirm the response includes the saved config
      if (!data.config || typeof data.config !== "object") {
        toast.error("Unexpected response from server");
        return;
      }

      // Refresh state from server truth
      const saved = data.config as Partial<EmailConfig>;
      setConfig((c) => ({ ...c, ...saved }));
      setSavedSmtpHost((saved.smtpHost as string) || null);
      toast.success("Settings saved");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    if (!canTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAddress: testEmail }),
      });
      const data = await safeJson(res) as Record<string, unknown> | null;

      if (data === null) {
        const errMsg = res.ok ? "Unexpected response from server" : "Server error — check server logs";
        setTestResult({ ok: false, error: errMsg });
        toast.error(errMsg);
        return;
      }

      if (data.ok === true) {
        const lastTestedAt = typeof data.lastTestedAt === "string" ? data.lastTestedAt : undefined;
        setTestResult({ ok: true, lastTestedAt });
        setConfig((c) => ({
          ...c,
          lastTestOk: true,
          lastTestError: null,
          lastTestedAt: lastTestedAt ?? c.lastTestedAt,
        }));
        toast.success("Test email sent successfully");
      } else {
        const errMsg =
          typeof data.error === "string" && data.error ? data.error : "Send failed";
        const lastTestedAt = typeof data.lastTestedAt === "string" ? data.lastTestedAt : undefined;
        setTestResult({ ok: false, error: errMsg, lastTestedAt });
        setConfig((c) => ({
          ...c,
          lastTestOk: false,
          lastTestError: errMsg,
          lastTestedAt: lastTestedAt ?? c.lastTestedAt,
        }));
        toast.error(errMsg);
      }
    } catch {
      setTestResult({ ok: false, error: "Network error" });
      toast.error("Network error — could not reach the server");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6 max-w-xl">
        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 flex items-start gap-3">
              <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-sm text-destructive font-medium">
                  Could not load email settings
                </p>
                <p className="text-xs text-destructive/80">{loadError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={loadConfig}
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Outbound SMTP */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base">Outbound Email</CardTitle>
                <CardDescription className="text-sm mt-0.5">
                  SMTP server for alerts and notification emails
                </CardDescription>
              </div>
            </div>
            <StatusBadge kind={statusKind} lastTestedAt={config.lastTestedAt} />
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Enable email</p>
                <p className="text-xs text-muted-foreground mt-0.5">Send alerts and summaries via SMTP</p>
              </div>
              <Switch
                id="emailEnabled"
                checked={config.isEnabled}
                onCheckedChange={(v) => setConfig((c) => ({ ...c, isEnabled: v }))}
              />
            </div>

            {/* Host + Port + Encryption */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtpHost" className="text-sm font-medium">SMTP host</Label>
                <Input
                  id="smtpHost"
                  value={config.smtpHost}
                  onChange={(e) => setConfig((c) => ({ ...c, smtpHost: e.target.value }))}
                  placeholder="smtp.example.com"
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="smtpPort" className="text-sm font-medium">Port</Label>
                  <Input
                    id="smtpPort"
                    type="number"
                    min={1}
                    max={65535}
                    value={config.smtpPort}
                    onChange={(e) => setConfig((c) => ({ ...c, smtpPort: parseInt(e.target.value) || 587 }))}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtpEncryption" className="text-sm font-medium">Encryption</Label>
                  <select
                    id="smtpEncryption"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={config.smtpEncryption}
                    onChange={(e) => {
                      const enc = e.target.value;
                      setConfig((c) => ({
                        ...c,
                        smtpEncryption: enc,
                        smtpPort: enc === "TLS" ? 465 : enc === "STARTTLS" ? 587 : c.smtpPort,
                      }));
                    }}
                  >
                    <option value="STARTTLS">STARTTLS (587)</option>
                    <option value="TLS">TLS / SSL (465)</option>
                    <option value="NONE">None — plain (25)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Credentials */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtpUser" className="text-sm font-medium">Username</Label>
                <Input
                  id="smtpUser"
                  value={config.smtpUser}
                  onChange={(e) => setConfig((c) => ({ ...c, smtpUser: e.target.value }))}
                  placeholder="you@example.com"
                  autoComplete="off"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Used as the sender address unless overridden in Advanced settings below.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtpPass" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="smtpPass"
                    type={showPass ? "text" : "password"}
                    value={config.smtpPass}
                    onChange={(e) => setConfig((c) => ({ ...c, smtpPass: e.target.value }))}
                    placeholder={config.smtpPass === "••••••••" ? "••••••••  (unchanged)" : "App password or SMTP password"}
                    className="pr-10 text-sm font-mono"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPass((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Advanced — collapsed by default */}
            <div className="rounded-md border border-border overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/40 transition-colors"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
              >
                <span className="text-muted-foreground">Advanced settings</span>
                {advancedOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              {advancedOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-border bg-muted/20">
                  <p className="text-xs text-muted-foreground pt-3">
                    By default, the sender address is your SMTP username. Override below only if needed.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="fromName" className="text-sm font-medium">Sender display name</Label>
                    <Input
                      id="fromName"
                      value={config.fromName}
                      onChange={(e) => setConfig((c) => ({ ...c, fromName: e.target.value }))}
                      placeholder="Yosan AI"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fromAddress" className="text-sm font-medium">Override sender address</Label>
                    <Input
                      id="fromAddress"
                      type="email"
                      value={config.fromAddress ?? ""}
                      onChange={(e) => setConfig((c) => ({ ...c, fromAddress: e.target.value }))}
                      placeholder="noreply@yourdomain.com"
                      className="text-sm font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to send from your SMTP username.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={saving} size="sm" className="w-full sm:w-auto">
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save settings
            </Button>
          </form>

          {/* Divider + Test section */}
          <Separator className="my-5" />

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Send test email</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {canTest
                  ? "Verify your SMTP configuration using the saved settings."
                  : "Save your SMTP settings first before sending a test."}
              </p>
            </div>

            <form onSubmit={handleTest} className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[200px] space-y-1.5">
                <Label htmlFor="testEmailAddr" className="text-sm">Send to</Label>
                <Input
                  id="testEmailAddr"
                  type="email"
                  value={testEmail}
                  onChange={(e) => { setTestEmail(e.target.value); setTestResult(null); }}
                  placeholder="you@example.com"
                  disabled={!canTest}
                  className="text-sm"
                />
              </div>
              <Button
                type="submit"
                disabled={testing || !testEmail || !canTest}
                size="sm"
                variant="outline"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send test
              </Button>
            </form>

            {/* Last test result from this session */}
            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-md px-3 py-2.5 text-sm ${
                  testResult.ok
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testResult.ok ? "Test email delivered successfully." : testResult.error}</span>
              </div>
            )}

            {/* Persistent last-test result from DB (shown when no in-session result yet) */}
            {!testResult && config.lastTestOk !== null && config.lastTestedAt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {config.lastTestOk ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                ) : (
                  <XCircle className="w-3 h-3 text-destructive" />
                )}
                Last test {config.lastTestOk ? "passed" : "failed"}
                {" · "}
                {new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(config.lastTestedAt))}
                {!config.lastTestOk && config.lastTestError && (
                  <> · {config.lastTestError}</>
                )}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
