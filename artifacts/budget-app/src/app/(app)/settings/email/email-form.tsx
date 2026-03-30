"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, Mail, Eye, EyeOff, Inbox } from "lucide-react";
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
import { toast } from "sonner";

export function EmailSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [config, setConfig] = useState({
    smtpHost: "",
    smtpPort: 587,
    smtpEncryption: "STARTTLS",
    smtpUser: "",
    smtpPass: "",
    fromAddress: "",
    fromName: "Budget App",
    isEnabled: false,
  });

  useEffect(() => {
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) setConfig((c) => ({ ...c, ...data.config }));
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Email settings saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
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
    <div className="space-y-6 max-w-xl">
      {/* Outbound SMTP */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Email / SMTP</CardTitle>
              <CardDescription>
                Configure outbound email for notifications and receipt forwarding
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="flex items-center justify-between">
              <Label htmlFor="emailEnabled">Enable email</Label>
              <Switch
                id="emailEnabled"
                checked={config.isEnabled}
                onCheckedChange={(v) => setConfig((c) => ({ ...c, isEnabled: v }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2 col-span-3 sm:col-span-1">
                <Label htmlFor="smtpHost">SMTP Host</Label>
                <Input
                  id="smtpHost"
                  value={config.smtpHost}
                  onChange={(e) => setConfig((c) => ({ ...c, smtpHost: e.target.value }))}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="space-y-2 col-span-3 sm:col-span-1">
                <Label htmlFor="smtpPort">Port</Label>
                <Input
                  id="smtpPort"
                  type="number"
                  value={config.smtpPort}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, smtpPort: parseInt(e.target.value) }))
                  }
                  placeholder="587"
                />
              </div>
              <div className="space-y-2 col-span-3 sm:col-span-1">
                <Label htmlFor="smtpEncryption">Encryption</Label>
                <select
                  id="smtpEncryption"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={config.smtpEncryption}
                  onChange={(e) => setConfig((c) => ({ ...c, smtpEncryption: e.target.value }))}
                >
                  <option value="STARTTLS">STARTTLS (587)</option>
                  <option value="TLS">TLS/SSL (465)</option>
                  <option value="NONE">None (plain)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtpUser">Username</Label>
              <Input
                id="smtpUser"
                value={config.smtpUser}
                onChange={(e) => setConfig((c) => ({ ...c, smtpUser: e.target.value }))}
                placeholder="your@email.com"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtpPass">Password</Label>
              <div className="relative">
                <Input
                  id="smtpPass"
                  type={showPass ? "text" : "password"}
                  value={config.smtpPass}
                  onChange={(e) => setConfig((c) => ({ ...c, smtpPass: e.target.value }))}
                  placeholder="App password or SMTP password"
                  className="pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPass(!showPass)}
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <Label htmlFor="fromAddress">From address</Label>
                <Input
                  id="fromAddress"
                  type="email"
                  value={config.fromAddress}
                  onChange={(e) => setConfig((c) => ({ ...c, fromAddress: e.target.value }))}
                  placeholder="budget@yourdomain.com"
                />
              </div>
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <Label htmlFor="fromName">From name</Label>
                <Input
                  id="fromName"
                  value={config.fromName}
                  onChange={(e) => setConfig((c) => ({ ...c, fromName: e.target.value }))}
                  placeholder="Budget App"
                />
              </div>
            </div>

            <Button type="submit" disabled={saving} size="sm">
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save settings
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Receipt ingestion (instance-level stub) */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Inbox className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Receipt Ingestion</CardTitle>
                <Badge variant="secondary" className="text-xs">Coming soon</Badge>
              </div>
              <CardDescription>
                Forward email receipts to your instance for automatic AI parsing
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            When receipt ingestion is enabled, the app listens on an inbound email
            address (e.g. via a mail relay or catch-all rule). Forwarded receipts
            are parsed by the configured AI provider and added as pending expenses
            for review.
          </p>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Inbound address format
            </p>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
              receipts+&#123;budgetId&#125;@&#123;your-domain&#125;
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            Each budget has its own forwarding address shown in Budget &rsaquo; Budget Settings.
            Configure your mail server or IMAP polling in a future release.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
