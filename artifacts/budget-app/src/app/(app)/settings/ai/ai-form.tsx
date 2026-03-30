"use client";

import { useState, useEffect } from "react";
import {
  Loader2, Save, Bot, Eye, EyeOff, Zap, CheckCircle2, XCircle, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const PROVIDERS = [
  { value: "OPENAI", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
  {
    value: "ANTHROPIC",
    label: "Anthropic",
    models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
  },
  {
    value: "GOOGLE",
    label: "Google Gemini",
    models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  },
  { value: "OLLAMA", label: "Ollama (Local)", models: ["llama3.2", "mistral", "qwen2.5"] },
  { value: "CUSTOM", label: "Custom / OpenAI-compatible", models: [] },
];

type TestStatus = "idle" | "testing" | "success" | "error";

interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  isEnabled: boolean;
  extractionEnabled: boolean;
  categorizationEnabled: boolean;
  recurringCategorizationEnabled: boolean;
  insightsEnabled: boolean;
  forecastingEnabled: boolean;
  dailyLimitPerUser: number | null;
  weeklyLimitPerUser: number | null;
  monthlyLimitPerUser: number | null;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "OPENAI",
  model: "gpt-4o-mini",
  apiKey: "",
  baseUrl: "",
  isEnabled: false,
  extractionEnabled: true,
  categorizationEnabled: true,
  recurringCategorizationEnabled: true,
  insightsEnabled: true,
  forecastingEnabled: false,
  dailyLimitPerUser: 50,
  weeklyLimitPerUser: 200,
  monthlyLimitPerUser: 500,
};

export function AISettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState<string>("");
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setConfig({
            ...DEFAULT_CONFIG,
            ...data.config,
            apiKey: data.config.apiKey || "",
            baseUrl: data.config.baseUrl || "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedProvider = PROVIDERS.find((p) => p.value === config.provider);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("AI settings saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save settings");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTestStatus("testing");
    setTestMessage("");
    try {
      const res = await fetch("/api/settings/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey !== "••••••••" ? config.apiKey : undefined,
          baseUrl: config.baseUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
        setTestMessage(`Connected in ${data.latencyMs}ms — ${data.content}`);
      } else {
        setTestStatus("error");
        setTestMessage(data.error || "Connection failed");
      }
    } catch {
      setTestStatus("error");
      setTestMessage("Network error");
    }
  }

  function updateToggle(key: keyof AIConfig) {
    setConfig((c) => ({ ...c, [key]: !c[key] }));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Provider Config */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>AI Provider</CardTitle>
              <CardDescription>
                Configure the AI used for receipt parsing and insights
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="aiEnabled">Enable AI features</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Required for receipt parsing and financial insights
                </p>
              </div>
              <Switch
                id="aiEnabled"
                checked={config.isEnabled}
                onCheckedChange={(v) => setConfig((c) => ({ ...c, isEnabled: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={config.provider}
                onValueChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    provider: v,
                    model: PROVIDERS.find((p) => p.value === v)?.models[0] || "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProvider && selectedProvider.models.length > 0 ? (
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={config.model}
                  onValueChange={(v) => setConfig((c) => ({ ...c, model: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedProvider.models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="model">Model name</Label>
                <Input
                  id="model"
                  value={config.model}
                  onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                  placeholder="e.g. llama3.2"
                />
              </div>
            )}

            {config.provider !== "OLLAMA" && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showKey ? "text" : "password"}
                    value={config.apiKey}
                    onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowKey(!showKey)}
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Stored securely on your server — never shared.
                </p>
              </div>
            )}

            {(config.provider === "OLLAMA" || config.provider === "CUSTOM") && (
              <div className="space-y-2">
                <Label htmlFor="baseUrl">
                  Base URL
                  {config.provider === "OLLAMA" && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      default: http://localhost:11434
                    </Badge>
                  )}
                </Label>
                <Input
                  id="baseUrl"
                  type="url"
                  value={config.baseUrl}
                  onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
                  placeholder={
                    config.provider === "OLLAMA"
                      ? "http://localhost:11434"
                      : "https://your-api-endpoint.com/v1"
                  }
                />
              </div>
            )}

            {/* Test connection */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testStatus === "testing"}
              >
                {testStatus === "testing" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Test connection
              </Button>

              {testStatus === "success" && (
                <span className="flex items-center gap-1.5 text-sm text-green-500">
                  <CheckCircle2 className="w-4 h-4" />
                  {testMessage}
                </span>
              )}
              {testStatus === "error" && (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <XCircle className="w-4 h-4" />
                  {testMessage}
                </span>
              )}
            </div>

            <Separator />

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

      {/* Feature Toggles */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Feature Toggles</CardTitle>
          <CardDescription>
            Enable or disable individual AI features globally
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "extractionEnabled", label: "Receipt extraction", desc: "Parse merchant, date, total, and items from uploaded receipts" },
            { key: "categorizationEnabled", label: "Auto-categorization", desc: "Suggest expense categories based on merchant and item names" },
            { key: "recurringCategorizationEnabled", label: "Recurring detection", desc: "Identify subscription and recurring charges automatically" },
            { key: "insightsEnabled", label: "Spending insights", desc: "Generate personalized spending analysis and tips" },
            { key: "forecastingEnabled", label: "Forecasting (beta)", desc: "Predict future expenses based on historical patterns" },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <Label className="font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={config[key as keyof AIConfig] as boolean}
                onCheckedChange={() => updateToggle(key as keyof AIConfig)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rate Limits */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Usage Limits</CardTitle>
          </div>
          <CardDescription>
            Per-user AI call limits. Leave empty for unlimited.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "dailyLimitPerUser", label: "Daily limit", placeholder: "e.g. 50" },
            { key: "weeklyLimitPerUser", label: "Weekly limit", placeholder: "e.g. 200" },
            { key: "monthlyLimitPerUser", label: "Monthly limit", placeholder: "e.g. 500" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="flex items-center gap-4">
              <Label className="w-36 shrink-0">{label}</Label>
              <Input
                type="number"
                min={1}
                className="w-32"
                placeholder={placeholder}
                value={String(config[key as keyof AIConfig] ?? "")}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    [key]: e.target.value === "" ? null : parseInt(e.target.value, 10),
                  }))
                }
              />
              <span className="text-sm text-muted-foreground">AI calls</span>
            </div>
          ))}

          <div className="pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save limits
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
