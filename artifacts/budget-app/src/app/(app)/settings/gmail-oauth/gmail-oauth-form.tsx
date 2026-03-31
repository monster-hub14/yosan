"use client";

import { useState, useEffect, Suspense } from "react";
import {
  Loader2, Save, Mail, Eye, EyeOff, CheckCircle2, AlertCircle,
  ArrowRight, Tag, RefreshCw,
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

interface Props {
  budgets: Budget[];
  defaultBudgetId?: string;
}

const STEPS = [
  {
    num: 1,
    icon: Mail,
    title: "Connect your Gmail account",
    desc: "Authorize read-only access so Yosan AI can scan for receipt emails.",
  },
  {
    num: 2,
    icon: Tag,
    title: "Choose receipt labels",
    desc: 'Pick the Gmail labels (e.g. "Receipts", "INBOX") that contain your purchase emails.',
  },
  {
    num: 3,
    icon: RefreshCw,
    title: "Sync and review",
    desc: "Run a sync to import matching emails into your Pending Imports for review.",
  },
];

export function GmailOAuthForm({ budgets, defaultBudgetId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [config, setConfig] = useState<OAuthConfig>({
    clientId: "",
    clientSecret: "",
    isConfigured: false,
  });

  useEffect(() => {
    fetch("/api/settings/gmail-oauth")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) setConfig(data.config);
      })
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="space-y-8 max-w-2xl">
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
            {config.isConfigured ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground shrink-0">
                <AlertCircle className="w-3 h-3" />
                Not set
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Success callout — shown when configured */}
          {config.isConfigured && (
            <div className="flex gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Google OAuth is configured
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Users on this instance can now connect their Gmail accounts for receipt import. Complete the steps below to set up your own account.
                </p>
              </div>
            </div>
          )}

          {/* Setup instructions */}
          <div className="rounded-md bg-muted/40 border border-border px-4 py-3 space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Google Cloud Console setup</p>
            <ol className="list-decimal ml-4 space-y-1 text-xs">
              <li>Go to <span className="font-mono">console.cloud.google.com</span> → APIs &amp; Services → Credentials</li>
              <li>Create an OAuth 2.0 Client ID for a Web Application</li>
              <li>
                Add <span className="font-mono break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/settings/gmail/callback</span> as an Authorized Redirect URI
              </li>
              <li>
                Add <span className="font-mono break-all">{typeof window !== "undefined" ? window.location.origin : ""}</span> as an Authorized JavaScript Origin
              </li>
              <li>Enable the Gmail API in your project</li>
              <li>Paste the Client ID and Client Secret below and save</li>
            </ol>
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

      {/* ── Section 2: User setup flow (shown only once OAuth is configured) ── */}
      {config.isConfigured && (
        <>
          {/* Numbered step guide */}
          <div>
            <h2 className="text-base font-semibold mb-1">Next: set up your Gmail receipt import</h2>
            <p className="text-sm text-muted-foreground mb-4">
              OAuth is ready. Follow these three steps to start importing receipts from your inbox.
            </p>
            <ol className="space-y-3">
              {STEPS.map((step) => (
                <li key={step.num} className="flex gap-3">
                  <div className="flex-none flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                    {step.num}
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-tight">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-1.5 mt-4 text-xs text-muted-foreground">
              <ArrowRight className="w-3.5 h-3.5" />
              Complete the steps using the panel below
            </div>
          </div>

          {/* Full Gmail user settings embedded */}
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          }>
            <GmailSettingsClient budgets={budgets} defaultBudgetId={defaultBudgetId} />
          </Suspense>
        </>
      )}
    </div>
  );
}
