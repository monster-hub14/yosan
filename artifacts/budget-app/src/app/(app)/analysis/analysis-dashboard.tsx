"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  RefreshCw,
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Circle,
  Info,
  Clock,
  BrainCircuit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface SpendingInsight {
  type: "overspent" | "on_track" | "under_budget" | "tip" | "alert";
  categoryName: string;
  actual: number;
  target: number | null;
  percentUsed: number | null;
  message: string;
}

interface AnalysisResult {
  status: "on-track" | "at-risk" | "off-track";
  statusReason: string;
  spendingPacePercent: number;
  totalSpent: number;
  totalBudget: number | null;
  safeToSpendPerDay: number | null;
  insights: SpendingInsight[];
  recommendations: string[];
  narrative: string;
  generatedByAI: boolean;
}

interface StoredInsight {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  metadata: string;
  isRead: boolean;
  createdAt: string;
}

function fmt(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status }: { status: string }) {
  if (status === "on-track") {
    return <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400 gap-1"><CheckCircle className="w-3 h-3" />On Track</Badge>;
  }
  if (status === "at-risk") {
    return <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 gap-1"><AlertTriangle className="w-3 h-3" />At Risk</Badge>;
  }
  return <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-400 gap-1"><TrendingDown className="w-3 h-3" />Off Track</Badge>;
}

function InsightRow({ insight }: { insight: SpendingInsight }) {
  const color =
    insight.type === "overspent" ? "text-red-600 dark:text-red-400"
    : insight.type === "alert" ? "text-amber-600 dark:text-amber-400"
    : "text-green-600 dark:text-green-400";

  const progressColor =
    insight.type === "overspent" ? "bg-red-500"
    : insight.type === "alert" ? "bg-amber-500"
    : "bg-green-500";

  const pct = insight.percentUsed ?? 0;

  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-sm font-medium truncate">{insight.categoryName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn("text-sm font-semibold tabular-nums", color)}>
            {fmt(insight.actual)}
          </span>
          {insight.target !== null && (
            <span className="text-xs text-muted-foreground">/ {fmt(insight.target)}</span>
          )}
        </div>
      </div>
      {insight.target !== null && (
        <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("absolute left-0 top-0 h-full rounded-full transition-all", progressColor)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
          {/* Overflow indicator */}
          {pct > 100 && (
            <div className="absolute right-0 top-0 h-full w-1 bg-red-700 rounded-full" />
          )}
        </div>
      )}
    </div>
  );
}

function StoredInsightCard({
  insight,
  onMarkRead,
}: {
  insight: StoredInsight;
  onMarkRead: (id: string) => void;
}) {
  const meta = (() => {
    try { return JSON.parse(insight.metadata) as Partial<AnalysisResult>; } catch { return null; }
  })();

  const statusColor =
    meta?.status === "off-track" ? "border-red-200 dark:border-red-900"
    : meta?.status === "at-risk" ? "border-amber-200 dark:border-amber-900"
    : "border-border";

  return (
    <Card className={cn("border", statusColor, !insight.isRead && "bg-muted/20")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {meta?.status && <StatusBadge status={meta.status} />}
              {!insight.isRead && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">New</Badge>}
            </div>
            <CardTitle className="text-sm font-medium">{insight.title}</CardTitle>
            <CardDescription className="text-xs flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              {new Date(insight.createdAt).toLocaleString()}
            </CardDescription>
          </div>
          {!insight.isRead && (
            <Button size="sm" variant="ghost" className="text-xs h-7 px-2 flex-shrink-0" onClick={() => onMarkRead(insight.id)}>
              Mark read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground pb-4">
        {insight.body}
        {meta?.recommendations && meta.recommendations.length > 0 && (
          <ul className="mt-3 space-y-1">
            {meta.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <Circle className="w-2 h-2 mt-1 flex-shrink-0 fill-current opacity-60" />
                {r}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalysisDashboard() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [storedInsights, setStoredInsights] = useState<StoredInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"live" | "history">("live");
  const [aiStatus, setAiStatus] = useState<"ok" | "rate_limited" | "disabled" | "unconfigured" | null>(null);
  const [aiStatusMsg, setAiStatusMsg] = useState<string | null>(null);

  const loadStoredInsights = useCallback(async () => {
    const res = await fetch("/api/analysis/insights");
    if (res.ok) {
      const data = await res.json() as { insights: StoredInsight[] };
      setStoredInsights(data.insights);
    }
  }, []);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const res = await fetch("/api/analysis/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 429) {
        const data = await res.json() as { error: string; usageLimitReached?: boolean };
        const isDisabled = data.error?.toLowerCase().includes("disabled");
        setAiStatus(isDisabled ? "disabled" : "rate_limited");
        setAiStatusMsg(data.error);
        await loadStoredInsights();
        return;
      }
      if (res.status === 503 || res.status === 424) {
        setAiStatus("unconfigured");
        setAiStatusMsg("AI provider is not configured. Visit Instance Settings to enable AI.");
        await loadStoredInsights();
        return;
      }
      if (res.ok) {
        const data = await res.json() as { analysis: AnalysisResult };
        setAiStatus("ok");
        setAiStatusMsg(null);
        setAnalysis(data.analysis);
        await loadStoredInsights();
      }
    } catch (err) {
      console.error("[analysis] refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [loadStoredInsights]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      refresh(),
      loadStoredInsights(),
    ]).finally(() => setLoading(false));
  }, [refresh, loadStoredInsights]);

  async function markRead(insightId: string) {
    await fetch("/api/analysis/insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insightId, isRead: true }),
    });
    setStoredInsights((prev) => prev.map((i) => i.id === insightId ? { ...i, isRead: true } : i));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Analyzing your spending…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* AI status banners */}
      {aiStatus === "unconfigured" && (
        <div className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg text-sm">
          <BrainCircuit className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            AI is not configured — showing rule-based analysis only. Visit{" "}
            <a href="/settings/ai" className="underline font-medium text-foreground">Instance Settings</a>{" "}
            to enable AI-powered insights.
          </span>
        </div>
      )}
      {aiStatus === "disabled" && (
        <div className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg text-sm">
          <BrainCircuit className="w-4 h-4 flex-shrink-0 text-amber-500" />
          <span className="text-muted-foreground">
            AI insights are disabled for your account. Contact your admin to re-enable.
          </span>
        </div>
      )}
      {aiStatus === "rate_limited" && aiStatusMsg && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{aiStatusMsg} Showing last saved analysis.</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Spending Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI-powered insights for your current pay period</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === "live" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("live")}
          >
            Live
          </Button>
          <Button
            variant={view === "history" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("history")}
          >
            History
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => refresh(true)}
            className="gap-1.5"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {view === "history" ? (
        <div className="space-y-3">
          {storedInsights.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No analysis history yet. Run a refresh to generate your first analysis.
            </div>
          ) : (
            storedInsights.map((ins) => (
              <StoredInsightCard key={ins.id} insight={ins} onMarkRead={markRead} />
            ))
          )}
        </div>
      ) : analysis ? (
        <>
          {/* Status overview */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="border-border col-span-2 sm:col-span-1">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <StatusBadge status={analysis.status} />
                <p className="text-xs text-muted-foreground mt-2">{analysis.statusReason}</p>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Spent</p>
                <p className="text-xl font-bold tabular-nums">{fmt(analysis.totalSpent)}</p>
                {analysis.totalBudget && (
                  <p className="text-xs text-muted-foreground mt-1">of {fmt(analysis.totalBudget)}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Period Elapsed</p>
                <p className="text-xl font-bold tabular-nums">{analysis.spendingPacePercent}%</p>
                <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${analysis.spendingPacePercent}%` }} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Safe to Spend/Day</p>
                <p className="text-xl font-bold tabular-nums">
                  {analysis.safeToSpendPerDay !== null ? fmt(analysis.safeToSpendPerDay) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">remaining balance</p>
              </CardContent>
            </Card>
          </div>

          {/* Narrative */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                {analysis.generatedByAI ? (
                  <Sparkles className="w-4 h-4 text-violet-500" />
                ) : (
                  <Info className="w-4 h-4 text-muted-foreground" />
                )}
                <CardTitle className="text-sm">Period Summary</CardTitle>
                {analysis.generatedByAI && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600 dark:text-violet-400">AI</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              {analysis.narrative}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Category breakdown */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <LineChart className="w-4 h-4 text-muted-foreground" />
                  Category Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {analysis.insights.filter((i) => i.actual > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No categorized expenses this period</p>
                ) : (
                  analysis.insights
                    .filter((i) => i.actual > 0)
                    .map((insight, i) => <InsightRow key={i} insight={insight} />)
                )}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {analysis.generatedByAI ? (
                    <Sparkles className="w-4 h-4 text-violet-500" />
                  ) : (
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  )}
                  <CardTitle className="text-sm">Recommendations</CardTitle>
                  {analysis.generatedByAI && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600 dark:text-violet-400">AI</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {analysis.recommendations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recommendations at this time.</p>
                ) : (
                  <ul className="space-y-3">
                    {analysis.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <span className="text-muted-foreground leading-snug">{rec}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <LineChart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No analysis available. Click Refresh to generate one.</p>
        </div>
      )}
    </div>
  );
}
