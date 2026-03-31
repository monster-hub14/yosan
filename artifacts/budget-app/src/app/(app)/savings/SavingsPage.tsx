"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, PiggyBank, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  perPaycheckAmount: number | null;
  isMonthlyGoal: boolean;
  targetDate: string | null;
  notes: string | null;
  isActive: boolean;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

interface Props {
  budgetId: string;
  currency: string;
}

const RING_R = 36;
const RING_CIRC = 2 * Math.PI * RING_R;

function CircularProgress({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = RING_CIRC * (1 - clamped / 100);

  const color =
    clamped >= 80
      ? "hsl(var(--status-healthy-hsl))"
      : clamped >= 50
      ? "hsl(var(--status-caution-hsl))"
      : "hsl(var(--primary))";

  return (
    <div className="relative w-[88px] h-[88px] flex-shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle
          cx={40}
          cy={40}
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth={5}
          className="text-muted opacity-40"
        />
        <motion.circle
          cx={40}
          cy={40}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          initial={{ strokeDashoffset: RING_CIRC }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.0, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold tabular-nums" style={{ color }}>
          {clamped.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

const EASE = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.38, ease: EASE },
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

const containerVariants = {
  show: { transition: { staggerChildren: 0.08 } },
};

export default function SavingsPage({ budgetId, currency }: Props) {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    targetAmount: "",
    perPaycheckAmount: "",
    isMonthlyGoal: false,
    targetDate: "",
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/budgets/${budgetId}/savings-goals`);
      const { goals } = await res.json();
      setGoals(goals ?? []);
    } catch {
      toast.error("Failed to load savings goals");
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditingGoal(null);
    setForm({ name: "", targetAmount: "", perPaycheckAmount: "", isMonthlyGoal: false, targetDate: "", notes: "" });
    setShowForm(true);
  }

  function openEdit(goal: SavingsGoal) {
    setEditingGoal(goal);
    setForm({
      name: goal.name,
      targetAmount: goal.targetAmount.toString(),
      perPaycheckAmount: goal.perPaycheckAmount?.toString() ?? "",
      isMonthlyGoal: goal.isMonthlyGoal,
      targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : "",
      notes: goal.notes ?? "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.targetAmount) {
      toast.error("Name and target amount are required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name,
        targetAmount: parseFloat(form.targetAmount),
        perPaycheckAmount: form.perPaycheckAmount ? parseFloat(form.perPaycheckAmount) : null,
        isMonthlyGoal: form.isMonthlyGoal,
        targetDate: form.targetDate || null,
        notes: form.notes || null,
      };

      let res: Response;
      if (editingGoal) {
        res = await fetch(`/api/budgets/${budgetId}/savings-goals/${editingGoal.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/budgets/${budgetId}/savings-goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success(editingGoal ? "Goal updated" : "Goal created");
      setShowForm(false);
      load();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this savings goal?")) return;
    try {
      const res = await fetch(`/api/budgets/${budgetId}/savings-goals/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to delete");
        return;
      }
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Savings Goals</h1>
          <p className="text-muted-foreground text-sm">Track progress toward your financial goals</p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          New goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 gap-4 text-center"
        >
          <PiggyBank className="w-12 h-12 text-muted-foreground/50" />
          <div>
            <h2 className="text-lg font-semibold">No savings goals yet</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Create a goal to start tracking your progress.
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Create goal
          </Button>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          <AnimatePresence>
            {goals.map((goal) => {
              const progress =
                goal.targetAmount > 0
                  ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
                  : 0;

              return (
                <motion.div key={goal.id} variants={cardVariants} exit="exit" layout>
                  <Card className="border-border h-full">
                    <CardContent className="p-5 space-y-4">
                      {/* Top row: actions */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm leading-snug">{goal.name}</p>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {!goal.isActive && <Badge variant="secondary" className="text-xs mr-1">Inactive</Badge>}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(goal)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(goal.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Ring + amounts */}
                      <div className="flex items-center gap-4">
                        <CircularProgress percent={progress} />
                        <div className="flex-1 min-w-0">
                          <p className="text-2xl font-bold leading-none">
                            {formatCurrency(goal.currentAmount, currency)}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            of {formatCurrency(goal.targetAmount, currency)} goal
                          </p>
                          {goal.perPaycheckAmount !== null && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {formatCurrency(goal.perPaycheckAmount, currency)} / paycheck
                              {goal.isMonthlyGoal && " (monthly)"}
                            </p>
                          )}
                          {goal.targetDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Target:{" "}
                              {new Date(goal.targetDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Edit Savings Goal" : "New Savings Goal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Goal name</Label>
              <Input placeholder="e.g. Emergency Fund" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Total target amount</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Monthly contribution</p>
                <p className="text-xs text-muted-foreground">Toggle to enter a monthly amount instead of per-paycheck</p>
              </div>
              <Switch checked={form.isMonthlyGoal} onCheckedChange={(v) => setForm({ ...form, isMonthlyGoal: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>{form.isMonthlyGoal ? "Monthly contribution" : "Per-paycheck contribution"}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.perPaycheckAmount}
                onChange={(e) => setForm({ ...form, perPaycheckAmount: e.target.value })}
              />
              {form.isMonthlyGoal && (
                <p className="text-xs text-muted-foreground">
                  This will be converted to a per-paycheck amount based on your pay schedule.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Target date (optional)</Label>
              <Input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input placeholder="Any notes…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingGoal ? "Update" : "Create goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
