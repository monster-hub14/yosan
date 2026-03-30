"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Brain, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UserRow { id: string; name: string; email: string; hasOverride: boolean }

interface AIControl {
  aiEnabled: boolean;
  extractionEnabled: boolean;
  categorizationEnabled: boolean;
  recurringCategorizationEnabled: boolean;
  insightsEnabled: boolean;
  forecastingEnabled: boolean;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  monthlyLimit: number | null;
}

interface GlobalConfig {
  dailyLimitPerUser: number | null;
  weeklyLimitPerUser: number | null;
  monthlyLimitPerUser: number | null;
}

const FEATURE_TOGGLES: { key: keyof AIControl; label: string }[] = [
  { key: "extractionEnabled", label: "Receipt extraction" },
  { key: "categorizationEnabled", label: "Auto-categorization" },
  { key: "recurringCategorizationEnabled", label: "Recurring categorization" },
  { key: "insightsEnabled", label: "Spending insights" },
  { key: "forecastingEnabled", label: "Forecasting" },
];

const DEFAULT_CONTROL: AIControl = {
  aiEnabled: true,
  extractionEnabled: true,
  categorizationEnabled: true,
  recurringCategorizationEnabled: true,
  insightsEnabled: true,
  forecastingEnabled: true,
  dailyLimit: null,
  weeklyLimit: null,
  monthlyLimit: null,
};

export function UserAIControlButton({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [control, setControl] = useState<AIControl | null>(null);
  const [global, setGlobal] = useState<GlobalConfig | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/ai-control`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as { control: AIControl | null; global: GlobalConfig | null };
      setControl(data.control ?? { ...DEFAULT_CONTROL });
      setGlobal(data.global);
    } catch {
      toast.error("Failed to load user AI controls");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!control) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/ai-control`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(control),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(`AI controls updated for ${user.name}`);
      setOpen(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/ai-control`, { method: "DELETE" });
      if (!res.ok) throw new Error("Reset failed");
      toast.success(`AI controls reset to global defaults for ${user.name}`);
      setOpen(false);
    } catch {
      toast.error("Failed to reset");
    } finally {
      setResetting(false);
    }
  }

  function update<K extends keyof AIControl>(key: K, value: AIControl[K]) {
    setControl((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={handleOpen}>
          <Brain className="w-3.5 h-3.5" />
          {user.hasOverride ? (
            <Badge variant="secondary" className="text-xs h-4 px-1">Custom</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">AI</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Controls — {user.name}</DialogTitle>
          <DialogDescription>
            Override global AI settings for this user. Leave limits blank to use global defaults.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : control ? (
          <div className="space-y-5 py-2">
            {/* Master toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">AI enabled</Label>
                <p className="text-xs text-muted-foreground">Disable to block all AI features</p>
              </div>
              <Switch checked={control.aiEnabled} onCheckedChange={(v) => update("aiEnabled", v)} />
            </div>

            {control.aiEnabled && (
              <>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Feature toggles
                  </p>
                  {FEATURE_TOGGLES.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <Label className="text-sm">{label}</Label>
                      <Switch
                        checked={control[key] as boolean}
                        onCheckedChange={(v) => update(key, v)}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Usage limits (overrides global)
                  </p>
                  {[
                    { key: "dailyLimit" as const, label: "Daily limit", globalVal: global?.dailyLimitPerUser },
                    { key: "weeklyLimit" as const, label: "Weekly limit", globalVal: global?.weeklyLimitPerUser },
                    { key: "monthlyLimit" as const, label: "Monthly limit", globalVal: global?.monthlyLimitPerUser },
                  ].map(({ key, label, globalVal }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="w-28 shrink-0 text-sm">{label}</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder={globalVal != null ? `Global: ${globalVal}` : "Unlimited"}
                        value={control[key] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                          update(key, isNaN(v ?? NaN) ? null : v);
                        }}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        <DialogFooter className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={resetting || loading}>
            {resetting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
            Reset to global
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
