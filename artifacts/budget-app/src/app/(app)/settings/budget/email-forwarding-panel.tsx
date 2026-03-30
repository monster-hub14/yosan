"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Inbox, Copy, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface EmailForwardingPanelProps {
  budgetId: string;
}

interface ForwardingConfig {
  enabled: boolean;
  inboundAddress: string | null;
}

export function EmailForwardingPanel({ budgetId }: EmailForwardingPanelProps) {
  const [config, setConfig] = useState<ForwardingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/budgets/${budgetId}/email-forwarding`);
      if (res.ok) {
        const data = await res.json();
        setConfig({ enabled: data.enabled, inboundAddress: data.inboundAddress });
      }
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerateAddress() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/budgets/${budgetId}/email-forwarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config?.inboundAddress ? { regenerate: true } : {}),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig({ enabled: data.enabled, inboundAddress: data.inboundAddress });
        toast.success(config?.inboundAddress ? "Address regenerated" : "Email forwarding enabled");
      } else {
        toast.error("Failed to generate forwarding address");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    setToggling(true);
    try {
      const res = await fetch(`/api/budgets/${budgetId}/email-forwarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig((prev) => prev ? { ...prev, enabled: data.enabled } : null);
        toast.success(enabled ? "Email forwarding enabled" : "Email forwarding paused");
      } else {
        toast.error("Failed to update forwarding");
      }
    } finally {
      setToggling(false);
    }
  }

  async function handleCopy() {
    if (!config?.inboundAddress) return;
    try {
      await navigator.clipboard.writeText(config.inboundAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Address copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Inbox className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>Receipt Forwarding Address</CardTitle>
              {config?.enabled && config.inboundAddress && (
                <Badge variant="secondary" className="text-xs text-green-500">Active</Badge>
              )}
            </div>
            <CardDescription>
              Forward email receipts directly to this budget for AI processing
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Forward email receipts (as attachments or inline) to the address below.
              AI will extract and categorize each receipt, creating a pending entry for your review.
            </p>

            {config?.inboundAddress ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Your forwarding address
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted px-3 py-2.5 rounded font-mono text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                      {config.inboundAddress}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="shrink-0"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="forwarding-enabled"
                      checked={config.enabled}
                      onCheckedChange={handleToggle}
                      disabled={toggling}
                    />
                    <Label htmlFor="forwarding-enabled" className="text-sm cursor-pointer">
                      {config.enabled ? "Enabled" : "Paused"}
                    </Label>
                    {toggling && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateAddress}
                    disabled={generating}
                    className="text-muted-foreground text-xs"
                  >
                    {generating ? (
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1.5" />
                    )}
                    Regenerate address
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Regenerating creates a new address and deactivates the old one. Configure
                  your email domain in{" "}
                  <a href="/settings/email" className="underline hover:text-foreground">
                    Instance → Email
                  </a>.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Button onClick={handleGenerateAddress} disabled={generating}>
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Inbox className="w-4 h-4 mr-2" />
                  )}
                  Generate forwarding address
                </Button>
                <p className="text-xs text-muted-foreground">
                  Generate a unique address for this budget. Configure your email domain first in{" "}
                  <a href="/settings/email" className="underline hover:text-foreground">
                    Instance → Email
                  </a>.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
