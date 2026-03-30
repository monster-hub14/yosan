"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  nextDueDate: string | null;
  notes: string | null;
  isActive: boolean;
  category: { id: string; name: string; color: string | null } | null;
}

const FREQ_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function formatDueDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  budgetId: string;
  currency: string;
}

export default function RecurringPage({ budgetId, currency }: Props) {
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringExpense | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    amount: "",
    frequency: "MONTHLY",
    nextDueDate: "",
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/budgets/${budgetId}/recurring`);
      const { recurring } = await res.json();
      setRecurring(recurring ?? []);
    } catch {
      toast.error("Failed to load recurring expenses");
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditingItem(null);
    setForm({ name: "", amount: "", frequency: "MONTHLY", nextDueDate: "", notes: "" });
    setShowForm(true);
  }

  function openEdit(item: RecurringExpense) {
    setEditingItem(item);
    setForm({
      name: item.name,
      amount: item.amount.toString(),
      frequency: item.frequency,
      nextDueDate: item.nextDueDate ? item.nextDueDate.slice(0, 10) : "",
      notes: item.notes ?? "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.amount) {
      toast.error("Name and amount are required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name,
        amount: parseFloat(form.amount),
        frequency: form.frequency,
        nextDueDate: form.nextDueDate || null,
        notes: form.notes || null,
      };

      if (editingItem) {
        await fetch(`/api/budgets/${budgetId}/recurring/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Updated");
      } else {
        await fetch(`/api/budgets/${budgetId}/recurring`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Added");
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
    if (!confirm("Delete this recurring expense?")) return;
    try {
      await fetch(`/api/budgets/${budgetId}/recurring/${id}`, { method: "DELETE" });
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

  const totalMonthly = recurring
    .filter((r) => r.isActive)
    .reduce((sum, r) => {
      switch (r.frequency) {
        case "DAILY": return sum + r.amount * 30;
        case "WEEKLY": return sum + r.amount * 4.33;
        case "BIWEEKLY": return sum + r.amount * 2.165;
        case "MONTHLY": return sum + r.amount;
        case "QUARTERLY": return sum + r.amount / 3;
        case "ANNUALLY": return sum + r.amount / 12;
        default: return sum + r.amount;
      }
    }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring Bills</h1>
          <p className="text-muted-foreground text-sm">
            {formatCurrency(totalMonthly, currency)}/month in recurring expenses
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add bill
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Recurring Expenses</CardTitle>
          <CardDescription>Sorted by next due date</CardDescription>
        </CardHeader>
        <CardContent>
          {recurring.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-3 text-center">
              <RefreshCw className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No recurring bills set up</p>
              <Button variant="outline" size="sm" onClick={openAdd}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add recurring bill
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recurring.map((item) => {
                const days = item.nextDueDate ? daysUntil(item.nextDueDate) : null;
                const dueSoon = days !== null && days <= 7;
                return (
                  <div key={item.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-4 h-4 text-rose-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          {!item.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                          {dueSoon && <Badge variant="destructive" className="text-xs">Due soon</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{FREQ_LABELS[item.frequency] ?? item.frequency}</span>
                          {item.nextDueDate && (
                            <>
                              <span>·</span>
                              <span>
                                {days === 0 ? "Due today" :
                                 days === 1 ? "Due tomorrow" :
                                 days !== null ? `Due ${formatDueDate(item.nextDueDate)} (${days}d)` :
                                 formatDueDate(item.nextDueDate)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                      <p className="text-sm font-semibold text-rose-400 tabular-nums">
                        {formatCurrency(item.amount, currency)}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Recurring Bill" : "Add Recurring Bill"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="e.g. Netflix, Rent" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQ_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Next due date</Label>
              <Input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input placeholder="Any notes…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingItem ? "Update" : "Add bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
