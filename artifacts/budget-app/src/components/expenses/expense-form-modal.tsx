"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CalendarDays, Loader2 } from "lucide-react";
import { CategoryPicker } from "@/components/expenses/category-picker";

interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  children?: Category[];
}

interface SafeToSpend {
  amount: number;
  status: string;
  remainingBalance: number;
}

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  budgetId: string;
  editExpense?: {
    id: string;
    amount: number;
    date: string;
    merchant?: string;
    description?: string;
    notes?: string;
    categoryId?: string;
  };
  onSaved?: (expense: unknown, safeToSpend: SafeToSpend | null) => void;
}

export function ExpenseFormModal({ open, onClose, budgetId, editExpense, onSaved }: ExpenseFormModalProps) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string>("");
  const [categoryColor, setCategoryColor] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSafeToSpend, setSavedSafeToSpend] = useState<SafeToSpend | null>(null);

  useEffect(() => {
    if (open) {
      if (editExpense) {
        setAmount(String(editExpense.amount));
        setDate(editExpense.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
        setMerchant(editExpense.merchant ?? "");
        setDescription(editExpense.description ?? "");
        setNotes(editExpense.notes ?? "");
        setCategoryId(editExpense.categoryId ?? null);
      } else {
        setAmount("");
        setDate(new Date().toISOString().slice(0, 10));
        setMerchant("");
        setDescription("");
        setNotes("");
        setCategoryId(null);
        setCategoryName("");
        setCategoryColor(null);
      }
      setError(null);
      setSavedSafeToSpend(null);
    }
  }, [open, editExpense]);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/categories?budgetId=${budgetId}`)
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        if (editExpense?.categoryId && data.flat) {
          const cat = (data.flat as Category[]).find((c) => c.id === editExpense.categoryId);
          if (cat) {
            setCategoryName(cat.name);
            setCategoryColor(cat.color ?? null);
          }
        }
      })
      .catch(console.error);
  }, [open, budgetId, editExpense?.categoryId]);

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (!date) {
      setError("Date is required");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      amount: parseFloat(amount),
      date,
      merchant: merchant || undefined,
      description: description || undefined,
      notes: notes || undefined,
      categoryId: categoryId || undefined,
    };

    try {
      let res;
      if (editExpense) {
        res = await fetch(`/api/budgets/${budgetId}/expenses/${editExpense.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/budgets/${budgetId}/expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json() as { expense: unknown; safeToSpend: SafeToSpend | null; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Failed to save expense");
        return;
      }

      setSavedSafeToSpend(data.safeToSpend ?? null);
      onSaved?.(data.expense, data.safeToSpend ?? null);

      if (!editExpense) {
        setTimeout(() => onClose(), 800);
      } else {
        onClose();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="pl-9"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="date"
                type="date"
                className="pl-9"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Merchant */}
          <div className="space-y-1.5">
            <Label htmlFor="merchant">Merchant / Store</Label>
            <Input
              id="merchant"
              placeholder="e.g. Whole Foods, Amazon…"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <CategoryPicker
              categories={categories}
              value={categoryId}
              onChange={(id, name, color) => {
                setCategoryId(id);
                setCategoryName(name);
                setCategoryColor(color);
              }}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="desc"
              placeholder="Brief description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes…"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
          )}

          {/* Safe-to-spend update animation */}
          <AnimatePresence>
            {savedSafeToSpend && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-muted rounded-lg px-4 py-3 text-sm"
              >
                <span className="text-muted-foreground">Safe to spend updated: </span>
                <span className="font-semibold">
                  ${Math.abs(savedSafeToSpend.amount).toFixed(2)}/day
                </span>
                <Badge
                  variant="outline"
                  className="ml-2 text-xs"
                  style={{
                    color: savedSafeToSpend.status === "on-track" ? "#22c55e" : savedSafeToSpend.status === "caution" ? "#f59e0b" : "#ef4444",
                    borderColor: "currentColor",
                  }}
                >
                  {savedSafeToSpend.status}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : (editExpense ? "Save Changes" : "Add Expense")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
