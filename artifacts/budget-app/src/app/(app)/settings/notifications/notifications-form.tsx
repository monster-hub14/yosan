"use client";

import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface Pref {
  channel: "EMAIL" | "IN_APP";
  event: string;
  isEnabled: boolean;
  budgetId?: string | null;
}

const EVENT_META: Record<string, { label: string; description: string }> = {
  overspending_alert: {
    label: "Overspending Alert",
    description: "When a category exceeds its spending target",
  },
  budget_approaching: {
    label: "Budget Approaching",
    description: "When a category reaches 80% of its target",
  },
  weekly_summary: {
    label: "Weekly Summary",
    description: "Weekly digest of spending and budget status",
  },
  upcoming_bill: {
    label: "Upcoming Bill",
    description: "3 days before a recurring expense is due",
  },
  payday_reminder: {
    label: "Payday Reminder",
    description: "The day before your scheduled paycheck",
  },
  new_insight: {
    label: "New Insight",
    description: "When AI generates a new spending insight",
  },
};

const EVENT_KEYS = Object.keys(EVENT_META);

type PrefKey = `${string}:${string}`;

function buildKey(channel: string, event: string): PrefKey {
  return `${channel}:${event}` as PrefKey;
}

export function NotificationsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Map<PrefKey, boolean>>(new Map());
  const [emailEnabled, setEmailEnabled] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/notifications").then((r) => r.json()),
      fetch("/api/settings/email").then((r) => r.json()),
    ]).then(([notifData, emailData]) => {
      const map = new Map<PrefKey, boolean>();
      // Set defaults (all in-app enabled, no email by default)
      for (const event of EVENT_KEYS) {
        map.set(buildKey("IN_APP", event), true);
        map.set(buildKey("EMAIL", event), false);
      }
      // Apply saved prefs
      for (const pref of notifData.prefs ?? []) {
        map.set(buildKey(pref.channel, pref.event), pref.isEnabled);
      }
      setPrefs(map);
      setEmailEnabled(emailData.config?.isEnabled ?? false);
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
            <a href="/settings/ai" className="underline font-medium">
              Instance Settings
            </a>{" "}
            to set up SMTP.
          </span>
        </div>
      )}

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

          {EVENT_KEYS.map((event, idx) => {
            const meta = EVENT_META[event];
            return (
              <div
                key={event}
                className={`grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-6 py-4 ${idx < EVENT_KEYS.length - 1 ? "border-b border-border" : ""}`}
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
            email notifications automatically.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
