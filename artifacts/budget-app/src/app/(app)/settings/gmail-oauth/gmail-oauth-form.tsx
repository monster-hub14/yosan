"use client";

import { useState, useEffect, Suspense } from "react";
import {
  Loader2, Save, Mail, Eye, EyeOff, CheckCircle2, AlertCircle,
  ArrowRight, Tag, RefreshCw, Bug, ChevronDown, ChevronRight,
  Copy, ExternalLink, ShieldCheck, ShieldAlert, Key, TriangleAlert,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { GmailSettingsClient } from "../gmail/gmail-settings-client";

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  isConfigured: boolean;
}

interface Budget {
  id: string;
  name: string;
}

interface DebugData {
  ok: boolean;
  error?: string;
  baseUrlError?: string | null;
  decryptionOk: boolean;
  clientIdSuffix: string | null;
  clientIdLength: number | null;
  rawClientIdLength: number | null;
  hasClientSecret: boolean;
  encryptionKeySource: string;
  appBaseUrl: string | null;
  appBaseUrlSource: string;
  authorizedJavascriptOrigin: string | null;
  redirectUri: string | null;
  scope: string;
  authUrlPreview: string | null;
  configUpdatedAt: string | null;
}

interface BaseUrlStatus {
  isExplicitlySet: boolean;
  isProduction: boolean;
  detectedUrl: string | null;
  source: string;
  error: string | null;
  isHttps: boolean;
  needsAction: boolean;
  severity: "ok" | "warn" | "error";
}

interface RedirectUriValidation {
  valid: boolean;
  issues: string[];
}

interface Props {
  budgets: Budget[];
  defaultBudgetId?: string;
}

const STEPS: { num: number; Icon: React.ElementType; title: string; desc: string }[] = [
  {
    num: 1,
    Icon: Mail,
    title: "Connect your Gmail account",
    desc: "Authorize read-only access so Yosan AI can scan for receipt emails.",
  },
  {
    num: 2,
    Icon: Tag,
    title: "Choose receipt labels",
    desc: 'Pick the Gmail labels (e.g. "Receipts", "INBOX") that contain your purchase emails.',
  },
  {
    num: 3,
    Icon: RefreshCw,
    title: "Sync and review",
    desc: "Run a sync to import matching emails into your Pending Imports for review.",
  },
];

function DebugRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-2 py-1.5 border-b border-border/50 last:border-0 text-xs">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className={mono ? "font-mono break-all" : ""}>{value}</span>
    </div>
  );
}

function validateRedirectUri(data: DebugData): RedirectUriValidation {
  const issues: string[] = [];
  const uri = data.redirectUri;

  if (!uri) {
    return { valid: false, issues: ["Redirect URI could not be determined — base URL error."] };
  }

  // Check: must be parseable as absolute URL
  let parsed: URL | null = null;
  try {
    parsed = new URL(uri);
  } catch {
    issues.push(`Not a valid absolute URL: "${uri}"`);
    return { valid: false, issues };
  }

  // Check: must use https
  if (parsed.protocol !== "https:") {
    issues.push(`Scheme must be https, got "${parsed.protocol.replace(":", "")}". Google OAuth requires HTTPS.`);
  }

  // Check: no query string
  if (parsed.search) {
    issues.push(`Contains a query string ("${parsed.search}") — redirect URIs must not have query parameters.`);
  }

  // Check: no fragment/hash
  if (parsed.hash) {
    issues.push(`Contains a hash fragment ("${parsed.hash}") — redirect URIs must not have fragments.`);
  }

  // Check: origin matches appBaseUrl
  if (data.appBaseUrl && parsed.origin !== data.appBaseUrl) {
    issues.push(
      `Origin mismatch — redirect URI origin is "${parsed.origin}" but app base URL is "${data.appBaseUrl}".`
    );
  }

  return { valid: issues.length === 0, issues };
}

export function GmailOAuthForm({ budgets, defaultBudgetId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [config, setConfig] = useState<OAuthConfig>({
    clientId: "",
    clientSecret: "",
    isConfigured: false,
  });

  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);
  const [baseUrlStatus, setBaseUrlStatus] = useState<BaseUrlStatus | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/gmail-oauth").then((r) => r.json()),
      fetch("/api/settings/gmail/base-url-status").then((r) => r.json()),
    ])
      .then(([oauthData, urlStatus]) => {
        if (oauthData.config) setConfig(oauthData.config);
        setBaseUrlStatus(urlStatus as BaseUrlStatus);
      })
      .finally(() => setLoading(false));
  }, []);

  async function loadDebug() {
    setLoadingDebug(true);
    try {
      const res = await fetch("/api/settings/gmail/debug");
      const data = await res.json();
      setDebugData(data);
    } catch {
      toast.error("Failed to load debug info");
    } finally {
      setLoadingDebug(false);
    }
  }

  function toggleDebug() {
    if (!debugOpen && !debugData) loadDebug();
    setDebugOpen((v) => !v);
  }

  async function copyInstructionUri(text: string, which: "origin" | "callback") {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "origin") {
        setCopiedOrigin(true);
        setTimeout(() => setCopiedOrigin(false), 2000);
      } else {
        setCopiedCallback(true);
        setTimeout(() => setCopiedCallback(false), 2000);
      }
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  }

  async function copyRedirectUri() {
    if (!debugData?.redirectUri) return;
    await navigator.clipboard.writeText(debugData.redirectUri);
    toast.success("Redirect URI copied");
  }

  async function copyAuthUrl() {
    if (!debugData?.authUrlPreview) return;
    await navigator.clipboard.writeText(debugData.authUrlPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/gmail-oauth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig(data.config);
        setDebugData(null); // invalidate debug cache after save
        toast.success("Gmail OAuth credentials saved");
      } else {
        toast.error(data.error || "Failed to save credentials");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const uriValidation = debugData ? validateRedirectUri(debugData) : null;

  // Prefer server-resolved values from debug data; fall back to browser origin
  const windowOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const instrOrigin = debugData?.authorizedJavascriptOrigin ?? windowOrigin;
  const instrCallback = debugData?.redirectUri ?? `${windowOrigin}/api/settings/gmail/callback`;

  // Block the "Connect Gmail" button when we're in production and the resolved URL is HTTP.
  const connectBlocked =
    baseUrlStatus !== null &&
    baseUrlStatus.isProduction &&
    !baseUrlStatus.isHttps;

  return (
    <div className="space-y-8 max-w-2xl">

      {/* ── APP_BASE_URL warning banner ── */}
      {baseUrlStatus && baseUrlStatus.severity !== "ok" && (
        <div
          className={
            baseUrlStatus.severity === "error"
              ? "flex gap-3 p-4 rounded-lg border border-red-500/40 bg-red-500/10"
              : "flex gap-3 p-4 rounded-lg border border-amber-400/40 bg-amber-400/10"
          }
        >
          <Globe
            className={
              baseUrlStatus.severity === "error"
                ? "w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400"
                : "w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
            }
          />
          <div className="flex-1 min-w-0 space-y-2">
            <p
              className={
                baseUrlStatus.severity === "error"
                  ? "text-sm font-semibold text-red-800 dark:text-red-300"
                  : "text-sm font-semibold text-amber-800 dark:text-amber-300"
              }
            >
              {baseUrlStatus.severity === "error" && !baseUrlStatus.isHttps && baseUrlStatus.isProduction
                ? "Gmail OAuth requires HTTPS — APP_BASE_URL not configured"
                : baseUrlStatus.error
                ? "APP_BASE_URL is set but invalid"
                : "APP_BASE_URL is not configured — Gmail OAuth may not work"}
            </p>

            <p
              className={
                baseUrlStatus.severity === "error"
                  ? "text-xs text-red-700 dark:text-red-400"
                  : "text-xs text-amber-700 dark:text-amber-400"
              }
            >
              {baseUrlStatus.error
                ? baseUrlStatus.error
                : baseUrlStatus.isProduction && !baseUrlStatus.isHttps
                ? "Google requires HTTPS for OAuth redirect URIs. The detected URL uses HTTP, which will be rejected by Google."
                : "Without APP_BASE_URL set explicitly, the app guesses its public URL from request headers. On Docker or reverse-proxy setups this guess is often wrong or uses HTTP, which breaks the Gmail OAuth flow."}
            </p>

            {/* Detected URL */}
            {baseUrlStatus.detectedUrl && (
              <div className="space-y-0.5">
                <p
                  className={
                    baseUrlStatus.severity === "error"
                      ? "text-[11px] font-medium text-red-700 dark:text-red-400"
                      : "text-[11px] font-medium text-amber-700 dark:text-amber-400"
                  }
                >
                  Currently detected URL
                  <span className="font-normal ml-1 opacity-70">
                    (source: {baseUrlStatus.source})
                  </span>
                </p>
                <p className="font-mono text-xs bg-background/60 rounded px-2 py-1 border border-border/60 break-all">
                  {baseUrlStatus.detectedUrl}
                  {!baseUrlStatus.isHttps && (
                    <span className="ml-2 text-[10px] font-sans text-red-600 dark:text-red-400 font-medium">
                      ← HTTP (not HTTPS)
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Fix instructions */}
            <div className="rounded-md border border-border/50 bg-background/40 px-3 py-2 space-y-1.5">
              <p
                className={
                  baseUrlStatus.severity === "error"
                    ? "text-[11px] font-semibold text-red-700 dark:text-red-400"
                    : "text-[11px] font-semibold text-amber-700 dark:text-amber-400"
                }
              >
                How to fix
              </p>
              <p className="text-xs text-foreground/70">
                Set the <span className="font-mono font-medium">APP_BASE_URL</span> environment variable to your
                server&apos;s public HTTPS origin and restart the app:
              </p>
              <p className="font-mono text-xs bg-muted/60 rounded px-2 py-1 break-all">
                APP_BASE_URL=https://yourdomain.com
              </p>
              <p className="text-[11px] text-muted-foreground">
                In Docker: add to your <span className="font-mono">.env</span> file or{" "}
                <span className="font-mono">environment:</span> section in{" "}
                <span className="font-mono">docker-compose.yml</span>.
                Must be just the origin — no path, no trailing slash.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 1: Admin OAuth Credentials ── */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Gmail OAuth Credentials</CardTitle>
                <CardDescription>
                  Instance-level Google OAuth app credentials. Configure once — all users can then connect their own Gmail accounts.
                </CardDescription>
              </div>
            </div>
            {!config.isConfigured && (
              <Badge variant="outline" className="gap-1 text-muted-foreground shrink-0">
                <AlertCircle className="w-3 h-3" />
                Not set
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Success callout */}
          {config.isConfigured && (
            <div className="flex gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Google OAuth is configured
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Users on this instance can now connect their Gmail accounts for receipt import.
                  Complete the steps below to set up your own account.
                </p>
              </div>
            </div>
          )}

          {/* Setup instructions */}
          <div className="rounded-md bg-muted/40 border border-border px-4 py-3 space-y-3 text-sm">
            <p className="font-medium text-foreground">Google Cloud Console setup</p>

            {!baseUrlStatus?.isExplicitlySet ? (
              /* ── Prerequisite notice: APP_BASE_URL must be set first ── */
              <div className="flex gap-3 p-3 rounded-md bg-blue-500/10 border border-blue-500/30">
                <Globe className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <div className="space-y-2.5 min-w-0">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                    Set <span className="font-mono">APP_BASE_URL</span> before configuring Gmail OAuth
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Google OAuth requires an exact Authorized Redirect URI that matches your app&apos;s
                    public HTTPS origin. Without{" "}
                    <span className="font-mono font-medium">APP_BASE_URL</span> configured, the app
                    falls back to a local network address — which Google will reject and will not work
                    for OAuth.
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">How to fix</p>
                    <p className="text-xs text-foreground/70">
                      Add <span className="font-mono font-medium">APP_BASE_URL</span> to your
                      environment and restart the app:
                    </p>
                    <p className="font-mono text-xs bg-muted/60 rounded px-2 py-1 break-all">
                      APP_BASE_URL=https://yourdomain.com
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      In Docker: add to your <span className="font-mono">.env</span> file or the{" "}
                      <span className="font-mono">environment:</span> section in{" "}
                      <span className="font-mono">docker-compose.yml</span>. Must be just the origin
                      — no path, no trailing slash.
                    </p>
                  </div>
                  <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 italic">
                    The full Google Cloud Console setup instructions will appear here once{" "}
                    <span className="font-mono not-italic">APP_BASE_URL</span> is configured and the
                    app is restarted.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Important note */}
                <div className="flex gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
                  <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <p className="text-amber-700 dark:text-amber-400">
                    <span className="font-semibold">Important:</span> Enabling OAuth credentials alone is not
                    enough. You must also enable the Gmail API in the same Google Cloud project, otherwise
                    label and sync requests will fail.
                  </p>
                </div>

                <ol className="space-y-3 text-xs text-muted-foreground">
                  {/* Step 1 */}
                  <li className="flex gap-2.5">
                    <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
                    <span>
                      Go to{" "}
                      <a
                        href="https://console.cloud.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:no-underline"
                      >
                        Google Cloud Console
                      </a>
                    </span>
                  </li>

                  {/* Step 2 */}
                  <li className="flex gap-2.5">
                    <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
                    <span>Create or select the Google Cloud project you want to use for Gmail receipt import</span>
                  </li>

                  {/* Step 3 — Gmail API */}
                  <li className="flex gap-2.5">
                    <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
                    <span className="space-y-1">
                      <span className="block font-medium text-foreground">Enable the Gmail API</span>
                      <span className="block">
                        Go to <span className="font-mono">APIs &amp; Services → Library</span>, search for{" "}
                        <span className="font-mono">Gmail API</span>, and click Enable. Or use the direct link:
                      </span>
                      <a
                        href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:no-underline font-mono"
                      >
                        console.cloud.google.com/apis/library/gmail.googleapis.com
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </span>
                  </li>

                  {/* Step 4 */}
                  <li className="flex gap-2.5">
                    <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">4</span>
                    <span>
                      Configure the <span className="font-mono">OAuth consent screen</span> if not already done
                      — add <span className="font-mono">gmail.readonly</span> to the scopes
                    </span>
                  </li>

                  {/* Step 5 */}
                  <li className="flex gap-2.5">
                    <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">5</span>
                    <span>
                      Go to <span className="font-mono">APIs &amp; Services → Credentials</span> and create an{" "}
                      <span className="font-medium">OAuth 2.0 Client ID</span> for a <span className="font-medium">Web Application</span>
                    </span>
                  </li>

                  {/* Step 6 — URIs */}
                  <li className="flex gap-2.5">
                    <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">6</span>
                    <span className="flex-1 space-y-2 min-w-0">
                      <span className="block">Add the following Authorized JavaScript origin and Authorized Redirect URI:</span>

                      {/* JS Origin */}
                      <span className="block space-y-1">
                        <span className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wide">Authorized JavaScript Origin</span>
                        <span className="flex items-center gap-2">
                          <span className="flex-1 font-mono text-[11px] bg-background border border-border rounded px-2 py-1 break-all">
                            {instrOrigin}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyInstructionUri(instrOrigin, "origin")}
                            className="flex-none flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {copiedOrigin ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            {copiedOrigin ? "Copied!" : "Copy"}
                          </button>
                        </span>
                      </span>

                      {/* Callback URI */}
                      <span className="block space-y-1">
                        <span className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wide">Authorized Redirect URI</span>
                        <span className="flex items-center gap-2">
                          <span className="flex-1 font-mono text-[11px] bg-background border border-border rounded px-2 py-1 break-all">
                            {instrCallback}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyInstructionUri(instrCallback, "callback")}
                            className="flex-none flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {copiedCallback ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            {copiedCallback ? "Copied!" : "Copy"}
                          </button>
                        </span>
                      </span>
                    </span>
                  </li>

                  {/* Step 7 */}
                  <li className="flex gap-2.5">
                    <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">7</span>
                    <span>Paste the Client ID and Client Secret into the fields below and save</span>
                  </li>
                </ol>

                {/* Troubleshooting callout */}
                <div className="flex gap-2 p-3 rounded-md bg-muted/60 border border-border text-xs text-muted-foreground">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold text-foreground/80">Troubleshooting:</span>{" "}
                    If you see an error like{" "}
                    <span className="font-mono italic">&quot;Gmail API has not been used in project … before or it is disabled&quot;</span>,
                    enable the Gmail API (Step 3) in the same project as your OAuth client, then wait a
                    few minutes for the change to propagate before trying again.
                  </p>
                </div>
              </>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                value={config.clientId}
                onChange={(e) => setConfig((c) => ({ ...c, clientId: e.target.value }))}
                placeholder="123456789-abc....apps.googleusercontent.com"
                autoComplete="off"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="clientSecret"
                  type={showSecret ? "text" : "password"}
                  value={config.clientSecret}
                  onChange={(e) => setConfig((c) => ({ ...c, clientSecret: e.target.value }))}
                  placeholder="GOCSPX-..."
                  autoComplete="new-password"
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret((v) => !v)}
                  tabIndex={-1}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Stored encrypted on your server.</p>
            </div>

            <Button type="submit" disabled={saving} size="sm">
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save credentials
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── OAuth Debug Panel (shown when configured) ── */}
      {config.isConfigured && (
        <Card className="border-border border-dashed">
          <CardHeader className="pb-3">
            <button
              type="button"
              onClick={toggleDebug}
              className="flex items-center gap-2 w-full text-left"
            >
              {debugOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <Bug className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">OAuth Debug</span>
              <span className="text-xs text-muted-foreground ml-1">
                — verify redirect URI, base URL, and credentials
              </span>
            </button>
          </CardHeader>

          {debugOpen && (
            <CardContent className="pt-0 space-y-4">
              {loadingDebug ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading debug info…
                </div>
              ) : debugData ? (
                <>
                  {/* Base URL error — hard red if APP_BASE_URL is set but invalid */}
                  {debugData.baseUrlError && (
                    <div className="flex gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-400">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium mb-0.5">APP_BASE_URL configuration error</p>
                        <p className="font-mono">{debugData.baseUrlError}</p>
                        <p className="mt-1">Set APP_BASE_URL to a plain origin, e.g. <span className="font-mono">https://yourdomain.com</span></p>
                      </div>
                    </div>
                  )}

                  {/* Decryption status banner */}
                  {debugData.decryptionOk ? (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      Credentials decrypted successfully — the app is reading your stored client ID correctly.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-400">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      Decryption failed — the stored credentials cannot be read. Re-enter and save your Client ID and Secret.
                    </div>
                  )}

                  {/* ── Redirect URI — prominent display above the table ── */}
                  <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">Redirect URI</p>
                      <span className="text-xs text-muted-foreground">(register this exactly in Google Cloud Console)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-xs font-mono break-all bg-background border border-border rounded px-2 py-1.5">
                        {debugData.redirectUri ?? "— (unavailable)"}
                      </p>
                      {debugData.redirectUri && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 shrink-0"
                          onClick={copyRedirectUri}
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </Button>
                      )}
                    </div>
                    {/* Redirect URI validation */}
                    {uriValidation && !uriValidation.valid && (
                      <div className="rounded-md border border-yellow-400/40 bg-yellow-400/10 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                          <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                          Redirect URI validation failed
                        </div>
                        <ul className="list-disc ml-4 space-y-1">
                          {uriValidation.issues.map((issue, i) => (
                            <li key={i} className="text-xs text-yellow-700 dark:text-yellow-400">{issue}</li>
                          ))}
                        </ul>
                        <p className="text-xs text-yellow-700/80 dark:text-yellow-400/80 mt-1">
                          Make sure this URI matches exactly what is registered under
                          "Authorized Redirect URIs" in your Google Cloud Console OAuth client.
                        </p>
                      </div>
                    )}
                    {uriValidation?.valid && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        Redirect URI format looks valid — make sure this matches your Google Cloud Console entry exactly.
                      </p>
                    )}
                  </div>

                  {/* Full debug fields table */}
                  <div className="rounded-md border border-border px-3 py-1">
                    <DebugRow
                      label="Decryption"
                      value={
                        debugData.decryptionOk ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ OK</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-medium">✗ FAILED</span>
                        )
                      }
                    />
                    <DebugRow
                      label="Encryption key source"
                      value={
                        <span className="flex items-center gap-1.5">
                          <Key className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono">{debugData.encryptionKeySource}</span>
                        </span>
                      }
                    />
                    <DebugRow
                      label="Client ID"
                      value={
                        debugData.clientIdSuffix
                          ? `${debugData.clientIdSuffix} (${debugData.clientIdLength} chars)`
                          : "— (decryption failed)"
                      }
                      mono
                    />
                    <DebugRow
                      label="Raw encrypted length"
                      value={debugData.rawClientIdLength ? `${debugData.rawClientIdLength} chars` : "—"}
                    />
                    <DebugRow
                      label="Has client secret"
                      value={
                        debugData.hasClientSecret ? (
                          <span className="text-emerald-600 dark:text-emerald-400">✓ yes</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400">✗ no / decryption failed</span>
                        )
                      }
                    />
                    <DebugRow label="App base URL" value={debugData.appBaseUrl ?? "—"} mono />
                    <DebugRow label="Base URL source" value={debugData.appBaseUrlSource} />
                    <DebugRow
                      label="JS origin (for Google)"
                      value={debugData.authorizedJavascriptOrigin ?? "—"}
                      mono
                    />
                    <DebugRow label="Redirect URI" value={debugData.redirectUri ?? "—"} mono />
                    <DebugRow label="Scope" value={debugData.scope} mono />
                    <DebugRow
                      label="Config saved"
                      value={
                        debugData.configUpdatedAt
                          ? new Date(debugData.configUpdatedAt).toLocaleString()
                          : "—"
                      }
                    />
                  </div>

                  {/* Auth URL preview */}
                  {debugData.authUrlPreview && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Auth URL preview — this is the exact URL the app sends to Google:
                      </p>
                      <div className="rounded-md border border-border bg-muted/30 p-2">
                        <p className="text-xs font-mono break-all text-foreground/80 leading-relaxed">
                          {debugData.authUrlPreview}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={copyAuthUrl}
                        >
                          <Copy className="w-3 h-3" />
                          {copied ? "Copied!" : "Copy URL"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => window.open(debugData.authUrlPreview!, "_blank")}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open in new tab
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1.5 ml-auto"
                          onClick={loadDebug}
                          disabled={loadingDebug}
                        >
                          {loadingDebug ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Refresh
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground py-2">Failed to load debug info.</div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Section 2: User setup flow (shown only once OAuth is configured) ── */}
      {config.isConfigured && (
        <>
          {/* Numbered step guide */}
          <div>
            <h2 className="text-base font-semibold mb-1">Next: set up Gmail receipt import</h2>
            <p className="text-sm text-muted-foreground mb-5">
              OAuth credentials are ready. Follow these three steps to start importing receipts from your inbox.
            </p>
            <ol className="space-y-4">
              {STEPS.map(({ num, Icon, title, desc }) => (
                <li key={num} className="flex gap-3">
                  <div className="flex-none flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary shrink-0 mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="pt-1">
                    <p className="text-sm font-medium leading-tight">
                      <span className="text-muted-foreground mr-1.5">{num}.</span>
                      {title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Prominent CTA — dimmed when connect is blocked */}
          <div
            className={
              connectBlocked
                ? "flex items-center gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/5"
                : "flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5"
            }
          >
            <Mail
              className={
                connectBlocked
                  ? "w-5 h-5 text-red-500 shrink-0"
                  : "w-5 h-5 text-primary shrink-0"
              }
            />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {connectBlocked
                  ? "Gmail connection unavailable until APP_BASE_URL is set"
                  : "Connect Gmail to start importing receipt emails"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connectBlocked
                  ? "Fix the configuration issue above, then restart the app to enable Gmail OAuth."
                  : "Use the panel below to authorize your account, choose labels, and run your first sync."}
              </p>
            </div>
            {connectBlocked ? (
              <TriangleAlert className="w-4 h-4 text-red-500 shrink-0" />
            ) : (
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </div>

          {/* Full Gmail user settings embedded */}
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          }>
            <GmailSettingsClient
              budgets={budgets}
              defaultBudgetId={defaultBudgetId}
              connectBlocked={connectBlocked}
              connectBlockedReason={
                connectBlocked
                  ? "Gmail OAuth requires HTTPS. Set APP_BASE_URL=https://yourdomain.com and restart."
                  : undefined
              }
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
