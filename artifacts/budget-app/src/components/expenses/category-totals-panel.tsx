"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Target, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface CategoryTotal {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  target: number | null;
  actual: number;
  remaining: number | null;
  percentUsed: number | null;
  status: "on-track" | "approaching" | "over";
  children?: CategoryTotal[];
}

interface CategoryTotalsPanelProps {
  budgetId: string;
  periodStart?: string;
  periodEnd?: string;
  compact?: boolean;
  onTargetSaved?: () => void;
}

const statusConfig = {
  "on-track": {
    bar: "hsl(var(--status-healthy-hsl))",
    badge: "text-[length:inherit] px-1.5 py-0 h-5 border-0",
    badgeStyle: { background: "var(--status-healthy-bg)", color: "hsl(var(--status-healthy-hsl))" },
    label: "✓",
  },
  approaching: {
    bar: "hsl(var(--status-caution-hsl))",
    badge: "text-[length:inherit] px-1.5 py-0 h-5 border-0",
    badgeStyle: { background: "var(--status-caution-bg)", color: "hsl(var(--status-caution-hsl))" },
    label: "~",
  },
  over: {
    bar: "hsl(var(--status-risk-hsl))",
    badge: "text-[length:inherit] px-1.5 py-0 h-5 border-0",
    badgeStyle: { background: "var(--status-risk-bg)", color: "hsl(var(--status-risk-hsl))" },
    label: "!",
  },
};

function ProgressBar({ percent, status, delay = 0 }: { percent: number | null; status: CategoryTotal["status"]; delay?: number }) {
  if (percent === null) return null;
  const clamped = Math.min(100, percent);
  const cfg = statusConfig[status];
  return (
    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: cfg.bar }}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94], delay }}
      />
    </div>
  );
}

function SetTargetModal({
  open,
  onClose,
  budgetId,
  category,
  currentTarget,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  budgetId: string;
  category: { id: string; name: string };
  currentTarget: number | null;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(currentTarget !== null ? String(currentTarget) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(currentTarget !== null ? String(currentTarget) : "");
      setError(null);
    }
  }, [open, currentTarget]);

  const handleSave = async () => {
    const parsed = value === "" ? null : parseFloat(value);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      setError("Enter a valid positive amount or leave empty to clear");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/budgets/${budgetId}/category-targets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: category.id, amount: parsed }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to save");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Target — {category.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="target-amount">Monthly spending target ($)</Label>
            <Input
              id="target-amount"
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 300 — leave empty to clear"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Leave empty to remove the target for this category.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>Save Target</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ cat, depth = 0, budgetId, onEdit, index = 0 }: {
  cat: CategoryTotal;
  depth?: number;
  budgetId: string;
  onEdit: (cat: CategoryTotal) => void;
  index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = (cat.children ?? []).length > 0;
  const cfg = statusConfig[cat.status];

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div
        className={cn(
          "group flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors",
          depth > 0 && "ml-5"
        )}
        onClick={() => hasChildren && setExpanded((v) => !v)}
      >
        {hasChildren ? (
          <button className="text-muted-foreground shrink-0" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? "#6b7280" }} />

        <span className={cn("flex-1 text-sm truncate", depth === 0 && "font-medium")}>{cat.name}</span>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <span className="text-sm font-medium tabular-nums">${cat.actual.toFixed(2)}</span>
          {cat.target !== null && (
            <>
              <span className="text-xs text-muted-foreground">/ ${cat.target.toFixed(0)}</span>
              <Badge className={cn("text-xs border-0 px-1.5 py-0 h-5", cfg.badge)} style={cfg.badgeStyle}>
                {cfg.label}
              </Badge>
            </>
          )}
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
            title="Set spending target"
            onClick={(e) => { e.stopPropagation(); onEdit(cat); }}
          >
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {cat.target !== null && cat.percentUsed !== null && (
        <div className={cn("px-3 pb-1", depth > 0 && "ml-5")}>
          <ProgressBar percent={cat.percentUsed} status={cat.status} delay={index * 0.04 + 0.1} />
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {(cat.children ?? []).map((child, ci) => (
              <CategoryRow key={child.id} cat={child} depth={depth + 1} budgetId={budgetId} onEdit={onEdit} index={ci} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function CategoryTotalsPanel({ budgetId, periodStart, periodEnd, compact, onTargetSaved }: CategoryTotalsPanelProps) {
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<CategoryTotal | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ budgetId });
    if (periodStart) params.set("periodStart", periodStart);
    if (periodEnd) params.set("periodEnd", periodEnd);
    fetch(`/api/categories/totals?${params}`)
      .then((r) => r.json())
      .then((data) => setTotals((data.totals ?? []).filter((t: CategoryTotal) => t.actual > 0 || t.target !== null)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [budgetId, periodStart, periodEnd]);

  useEffect(() => { load(); }, [load]);

  const handleTargetSaved = () => {
    load();
    onTargetSaved?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (totals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p>No spending recorded yet.</p>
        <p className="text-xs mt-1">Add expenses to see category totals.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-0.5", compact && "text-xs")}>
      {totals.map((cat, i) => (
        <CategoryRow key={cat.id} cat={cat} budgetId={budgetId} onEdit={setEditTarget} index={i} />
      ))}

      {editTarget && (
        <SetTargetModal
          open
          onClose={() => setEditTarget(null)}
          budgetId={budgetId}
          category={{ id: editTarget.id, name: editTarget.name }}
          currentTarget={editTarget.target}
          onSaved={handleTargetSaved}
        />
      )}
    </div>
  );
}
