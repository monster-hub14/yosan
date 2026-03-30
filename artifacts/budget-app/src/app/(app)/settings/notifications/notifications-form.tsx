"use client";

import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, Loader2, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface Pref {
  channel: "EMAIL" | "IN_APP";
  event: string;
  isEnabled: boolean;
  budgetId?: string | null;
}

interface NotifConfig {
  notificationEmail: string | null;
  digestFrequency: string;
  billReminderDays: number;
}

const EVENT_META: Record<string, { label: string; description: string; group: string }> = {
  overspending_alert: {
    label: "Overspending Alert",
    description: "When a category exceeds its spending target",
    group: "Spending",
  },
  budget_approaching: {
    label: "Budget Approaching",
    description: "When a category reaches 80% of its target",
    group: "Spending",
  },
  deficit_risk: {
    label: "Cash Flow Deficit Risk",
    description: "When projected balance goes negative within 14 days",
    group: "Spending",
  },
  savings_goal_risk: {
    label: "Savings Goal At Risk",
    description: "When a savings goal is less than 50% funded",
    group: "Spending",
  },
  weekly_summary: {
    label: "Weekly Summary",
    description: "Weekly digest of spending and budget status",
    group: "Digest",
  },
  new_insight: {
    label: "New AI Insight",
    description: "When AI generates a new spending insight",
    group: "Digest",
  },
  upcoming_bill: {
    label: "Upcoming Bill",
    description: "Before a recurring expense is due (days configurable below)",
    group: "Reminders",
  },
  payday_reminder: {
    label: "Payday Reminder",
    description: "The day before your scheduled paycheck",
    group: "Reminders",
  },
  receipt_upload_reminder: {
    label: "Receipt Upload Reminder",
    description: "When no receipt has been uploaded for 7+ days",
    group: "Reminders",
  },
};

const EVENT_KEYS = Object.keys(EVENT_META);
const GROUPS = ["Spending", "Digest", "Reminders"] as const;

type PrefKey = `${string}:${string}`;
function buildKey(channel: string, event: string): PrefKey {
  return `${channel}:${event}` as PrefKey;
}

export function NotificationsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [prefs, setPrefs] = useState<Map<PrefKey, boolean>>(new Map());
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [notifConfig, setNotifConfig] = useState<NotifConfig>({
    notificationEmail: "",
    digestFrequency: "WEEKLY",
    billReminderDays: 3,
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/notifications").then((r) => r.json()),
      fetch("/api/settings/email-status").then((r) => r.json()),
      fetch("/api/notifications/config").then((r) => r.json()),
    ]).then(([notifData, emailData, configData]) => {
      const map = new Map<PrefKey, boolean>();
      for (const event of EVENT_KEYS) {
        map.set(buildKey("IN_APP", event), true);
        map.set(buildKey("EMAIL", event), false);
      }
      for (const pref of notifData.prefs ?? []) {
        map.set(buildKey(pref.channel, pref.event), pref.isEnabled);
      }
      setPrefs(map);
      setEmailEnabled(emailData.isEnabled ?? false);
      if (configData.config) {
        setNotifConfig({
          notificationEmail: configData.config.notificationEmail ?? "",
          digestFrequency: configData.config.digestFrequency ?? "WEEKLY",
          billReminderDays: configData.config.billReminderDays ?? 3,
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  function toggle(channel: string, event: string) {
    setPrefs((prev) => {
      const next = new Map(prev);
      next.set(buildKey(channel, event), !prev.get(buildKey(channel, event)));
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updates: Pref[] = [];
      for (const event of EVENT_KEYS) {
        for (const channel of ["EMAIL", "IN_APP"] as const) {
          updates.push({
            channel,
            event,
            isEnabled: prefs.get(buildKey(channel, event)) ?? false,
          });
        }
      }
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Notification preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/notifications/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationEmail: notifConfig.notificationEmail || null,
          digestFrequency: notifConfig.digestFrequency,
          billReminderDays: notifConfig.billReminderDays,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Delivery settings saved");
    } catch {
      toast.error("Failed to save delivery settings");
    } finally {
      setSavingConfig(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading preferences…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      {!emailEnabled && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
          <Mail className="w-4 h-4 flex-shrink-0" />
          <span>
            Email delivery is not configured. Visit{" "}
            <a href="/settings/email" className="underline font-medium">
              Email Settings
            </a>{" "}
            to set up SMTP.
          </span>
        </div>
      )}

      {/* Delivery settings */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Settings className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Delivery Settings</CardTitle>
              <CardDescription>Configure where and how often you receive notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="notifEmail">
              Notification email address
              <span className="ml-1 text-xs text-muted-foreground">(separate from your account email)</span>
            </Label>
            <Input
              id="notifEmail"
              type="email"
              placeholder="alerts@yourdomain.com (leave blank to use account email)"
              value={notifConfig.notificationEmail ?? ""}
              onChange={(e) => setNotifConfig((c) => ({ ...c, notificationEmail: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="digestFreq">Digest frequency</Label>
              <select
                id="digestFreq"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={notifConfig.digestFrequency}
                onChange={(e) => setNotifConfig((c) => ({ ...c, digestFrequency: e.target.value }))}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billDays">Bill reminder lead days</Label>
              <Input
                id="billDays"
                type="number"
                min={1}
                max={30}
                value={notifConfig.billReminderDays}
                onChange={(e) =>
                  setNotifConfig((c) => ({
                    ...c,
                    billReminderDays: Math.max(1, Math.min(30, parseInt(e.target.value) || 3)),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Alert this many days before a bill is due</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} disabled={savingConfig} size="sm" variant="outline" className="gap-2">
              {savingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save delivery settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification toggles — grouped */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Bell className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose which alerts you receive and how</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-6 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
            <span>Event</span>
            <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />In-App</span>
            <span className="flex items-center gap-1"><Mail className="w-3 h-3" />Email</span>
          </div>

          {GROUPS.map((group, gIdx) => {
            const groupEvents = EVENT_KEYS.filter((k) => EVENT_META[k].group === group);
            return (
              <div key={group}>
                <div className="px-6 py-2 bg-muted/40 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
                </div>
                {groupEvents.map((event, idx) => {
                  const meta = EVENT_META[event];
                  const isLast = gIdx === GROUPS.length - 1 && idx === groupEvents.length - 1;
                  return (
                    <div
                      key={event}
                      className={`grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-6 py-4 ${!isLast ? "border-b border-border" : ""}`}
                    >
                      <div>
                        <p className="text-sm font-medium">{meta.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                      </div>
                      <Switch
                        checked={prefs.get(buildKey("IN_APP", event)) ?? false}
                        onCheckedChange={() => toggle("IN_APP", event)}
                      />
                      <Switch
                        checked={prefs.get(buildKey("EMAIL", event)) ?? false}
                        onCheckedChange={() => toggle("EMAIL", event)}
                        disabled={!emailEnabled}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Preferences
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-sm">Cron Alerts (Self-Hosted)</CardTitle>
          <CardDescription className="text-xs">
            Schedule <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">POST /api/cron/alerts</code> daily with{" "}
            <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Authorization: Bearer &lt;CRON_SECRET&gt;</code> to deliver
            email notifications automatically. Pass <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">{`{"type":"deficit_risk"}`}</code>{" "}
            in the body to run a specific alert type.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
