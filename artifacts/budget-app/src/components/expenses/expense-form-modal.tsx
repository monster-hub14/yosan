"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CalendarDays, ChevronDown, ChevronRight, Search, Loader2, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

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

  const handleSelectCategory = (cat: Category) => {
    setCategoryId(cat.id);
    setCategoryName(cat.name);
    setCategoryColor(cat.color ?? null);
    setCatOpen(false);
    setCatSearch("");
  };

  const filterCategories = useCallback((cats: Category[], q: string): Category[] => {
    if (!q) return cats;
    const lower = q.toLowerCase();
    return cats.flatMap((c) => {
      const matches = c.name.toLowerCase().includes(lower);
      const matchingChildren = (c.children ?? []).filter((ch) => ch.name.toLowerCase().includes(lower));
      if (matches || matchingChildren.length > 0) {
        return [{ ...c, children: matches ? (c.children ?? []) : matchingChildren }];
      }
      return [];
    });
  }, []);

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

  const filtered = filterCategories(categories, catSearch);

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
            <Popover open={catOpen} onOpenChange={setCatOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  {categoryId ? (
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor ?? "#6b7280" }} />
                      {categoryName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select category…</span>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search categories…"
                    value={catSearch}
                    onChange={(e) => setCatSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <ScrollArea className="h-56">
                  <div className="space-y-0.5">
                    {filtered.map((parent) => (
                      <div key={parent.id}>
                        <div className="flex items-center gap-1">
                          {(parent.children?.length ?? 0) > 0 && !catSearch ? (
                            <button
                              className="p-0.5 rounded hover:bg-muted"
                              onClick={() => setExpandedParents((p) => {
                                const next = new Set(p);
                                next.has(parent.id) ? next.delete(parent.id) : next.add(parent.id);
                                return next;
                              })}
                            >
                              {expandedParents.has(parent.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <div className="w-5" />
                          )}
                          <button
                            className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                            onClick={() => handleSelectCategory(parent)}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: parent.color ?? "#6b7280" }} />
                            <span className="font-medium">{parent.name}</span>
                            {categoryId === parent.id && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                          </button>
                        </div>
                        {(expandedParents.has(parent.id) || !!catSearch) && (parent.children ?? []).map((child) => (
                          <button
                            key={child.id}
                            className="w-full flex items-center gap-2 pl-9 pr-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                            onClick={() => handleSelectCategory(child)}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: child.color ?? parent.color ?? "#6b7280" }} />
                            {child.name}
                            {categoryId === child.id && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                          </button>
                        ))}
                      </div>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-sm text-muted-foreground px-2 py-3 text-center">No categories found</p>
                    )}
                  </div>
                </ScrollArea>
                {categoryId && (
                  <div className="pt-2 border-t mt-2">
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground w-full text-left px-1"
                      onClick={() => { setCategoryId(null); setCategoryName(""); setCategoryColor(null); setCatOpen(false); }}
                    >
                      Clear selection
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
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
