"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, TrendingUp, Calendar, RefreshCw } from "lucide-react";
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

interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  customDays: number | null;
  nextPayDate: string | null;
  notes: string | null;
  isActive: boolean;
}

interface IncomeEntry {
  id: string;
  amount: number;
  date: string;
  note: string | null;
  incomeSource: { id: string; name: string; frequency: string } | null;
}

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  SEMIMONTHLY: "Twice a month",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
  CUSTOM: "Custom",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  budgetId: string;
  currency: string;
}

export default function IncomePage({ budgetId, currency }: Props) {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    amount: "",
    frequency: "BIWEEKLY",
    customDays: "",
    nextPayDate: "",
    notes: "",
  });

  const [entryForm, setEntryForm] = useState({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
    incomeSourceId: "",
  });

  const load = useCallback(async () => {
    try {
      const [srcRes, entRes] = await Promise.all([
        fetch(`/api/budgets/${budgetId}/income-sources`),
        fetch(`/api/budgets/${budgetId}/income-entries?limit=20`),
      ]);
      const { sources } = await srcRes.json();
      const { entries } = await entRes.json();
      setSources(sources ?? []);
      setEntries(entries ?? []);
    } catch {
      toast.error("Failed to load income data");
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => { load(); }, [load]);

  function openAddSource() {
    setEditingSource(null);
    setForm({ name: "", amount: "", frequency: "BIWEEKLY", customDays: "", nextPayDate: "", notes: "" });
    setShowSourceForm(true);
  }

  function openEditSource(src: IncomeSource) {
    setEditingSource(src);
    setForm({
      name: src.name,
      amount: src.amount.toString(),
      frequency: src.frequency,
      customDays: src.customDays?.toString() ?? "",
      nextPayDate: src.nextPayDate ? src.nextPayDate.slice(0, 10) : "",
      notes: src.notes ?? "",
    });
    setShowSourceForm(true);
  }

  async function handleSaveSource() {
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
        customDays: form.frequency === "CUSTOM" && form.customDays ? parseInt(form.customDays) : null,
        nextPayDate: form.nextPayDate || null,
        notes: form.notes || null,
      };

      if (editingSource) {
        await fetch(`/api/budgets/${budgetId}/income-sources/${editingSource.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Income source updated");
      } else {
        await fetch(`/api/budgets/${budgetId}/income-sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Income source added");
      }
      setShowSourceForm(false);
      load();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSource(id: string) {
    if (!confirm("Delete this income source?")) return;
    try {
      await fetch(`/api/budgets/${budgetId}/income-sources/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleAddEntry() {
    if (!entryForm.amount || !entryForm.date) {
      toast.error("Amount and date are required");
      return;
    }
    setSaving(true);
    try {
      await fetch(`/api/budgets/${budgetId}/income-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(entryForm.amount),
          date: entryForm.date,
          note: entryForm.note || null,
          incomeSourceId: entryForm.incomeSourceId || null,
        }),
      });
      toast.success("Income entry recorded");
      setShowEntryForm(false);
      setEntryForm({ amount: "", date: new Date().toISOString().slice(0, 10), note: "", incomeSourceId: "" });
      load();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEntry(id: string) {
    try {
      await fetch(`/api/budgets/${budgetId}/income-entries/${id}`, { method: "DELETE" });
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
          <h1 className="text-2xl font-bold">Income</h1>
          <p className="text-muted-foreground text-sm">Manage pay schedules and income entries</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEntryForm(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Log income
          </Button>
          <Button size="sm" onClick={openAddSource}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add source
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Income Sources</CardTitle>
          <CardDescription>Recurring pay schedules and amounts</CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-3 text-center">
              <TrendingUp className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No income sources yet</p>
              <Button variant="outline" size="sm" onClick={openAddSource}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add income source
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sources.map((src) => (
                <div key={src.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{src.name}</p>
                        {!src.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{FREQ_LABELS[src.frequency] ?? src.frequency}</span>
                        {src.nextPayDate && (
                          <>
                            <span>·</span>
                            <Calendar className="w-3 h-3" />
                            <span>Next: {formatDate(src.nextPayDate)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                    <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                      {formatCurrency(src.amount)}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSource(src)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteSource(src.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Income Entries</CardTitle>
              <CardDescription>One-off and logged payments</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowEntryForm(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Log
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No entries logged yet</p>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {e.note || e.incomeSource?.name || "Income"}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                      +{formatCurrency(e.amount)}
                    </p>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteEntry(e.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showSourceForm} onOpenChange={setShowSourceForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSource ? "Edit Income Source" : "Add Income Source"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="e.g. Main Job" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount per paycheck</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Pay frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQ_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.frequency === "CUSTOM" && (
              <div className="space-y-1.5">
                <Label>Custom interval (days)</Label>
                <Input type="number" min="1" placeholder="e.g. 10" value={form.customDays} onChange={(e) => setForm({ ...form, customDays: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Next pay date</Label>
              <Input type="date" value={form.nextPayDate} onChange={(e) => setForm({ ...form, nextPayDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input placeholder="Any notes…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSourceForm(false)}>Cancel</Button>
            <Button onClick={handleSaveSource} disabled={saving}>
              {saving ? "Saving…" : editingSource ? "Update" : "Add source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEntryForm} onOpenChange={setShowEntryForm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Income Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input placeholder="What is this payment for?" value={entryForm.note} onChange={(e) => setEntryForm({ ...entryForm, note: e.target.value })} />
            </div>
            {sources.length > 0 && (
              <div className="space-y-1.5">
                <Label>Link to income source (optional)</Label>
                <Select value={entryForm.incomeSourceId} onValueChange={(v) => setEntryForm({ ...entryForm, incomeSourceId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {sources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEntryForm(false)}>Cancel</Button>
            <Button onClick={handleAddEntry} disabled={saving}>
              {saving ? "Saving…" : "Log income"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
