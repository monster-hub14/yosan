"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, PiggyBank, RefreshCw, Target } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { motion } from "framer-motion";

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

      if (editingGoal) {
        await fetch(`/api/budgets/${budgetId}/savings-goals/${editingGoal.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Goal updated");
      } else {
        await fetch(`/api/budgets/${budgetId}/savings-goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Goal created");
      }
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
      await fetch(`/api/budgets/${budgetId}/savings-goals/${id}`, { method: "DELETE" });
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
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <PiggyBank className="w-12 h-12 text-muted-foreground/50" />
          <div>
            <h2 className="text-lg font-semibold">No savings goals</h2>
            <p className="text-muted-foreground text-sm mt-1">Create a goal to start tracking your savings.</p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Create goal
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {goals.map((goal) => {
            const progress = goal.targetAmount > 0
              ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
              : 0;
            return (
              <Card key={goal.id} className="border-border">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Target className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{goal.name}</p>
                        {!goal.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(goal)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(goal.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-2xl font-bold">{formatCurrency(goal.currentAmount, currency)}</span>
                      <span className="text-sm text-muted-foreground">/ {formatCurrency(goal.targetAmount, currency)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-amber-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{progress.toFixed(0)}% complete</p>
                  </div>

                  {goal.perPaycheckAmount !== null && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(goal.perPaycheckAmount, currency)} / paycheck
                      {goal.isMonthlyGoal && " (from monthly goal)"}
                    </p>
                  )}

                  {goal.targetDate && (
                    <p className="text-xs text-muted-foreground">
                      Target: {new Date(goal.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
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
