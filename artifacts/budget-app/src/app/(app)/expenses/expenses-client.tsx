"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Filter, ChevronDown, Trash2, Pencil, TrendingDown, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ExpenseFormModal } from "@/components/expenses/expense-form-modal";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parentId: string | null;
}

interface Expense {
  id: string;
  amount: number;
  date: string;
  merchant: string | null;
  description: string | null;
  notes: string | null;
  categoryId: string | null;
  category: Category | null;
  addedBy: { id: string; name: string } | null;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const dd = d.toDateString();
  if (dd === today.toDateString()) return "Today";
  if (dd === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function groupByDate(expenses: Expense[]) {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = e.date.slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

interface ExpensesClientProps {
  budgetId: string;
  initialCategories: Category[];
}

export function ExpensesClient({ budgetId, initialCategories }: ExpensesClientProps) {
  const searchParams = useSearchParams();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Support ?add=1 to auto-open the "add expense" modal (e.g. from dashboard CTA)
  const [addOpen, setAddOpen] = useState(() => searchParams.get("add") === "1");
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const flatCategories = initialCategories;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (search) params.set("search", search);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    // When user explicitly sets date filters, opt into full history; otherwise default to active period
    if (dateFrom || dateTo) params.set("all", "true");

    fetch(`/api/budgets/${budgetId}/expenses?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setExpenses(data.expenses ?? []);
        setTotal(data.total ?? 0);
        setPages(data.pages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [budgetId, page, search, categoryFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteExpense) return;
    setDeleting(true);
    try {
      await fetch(`/api/budgets/${budgetId}/expenses/${deleteExpense.id}`, { method: "DELETE" });
      setDeleteExpense(null);
      load();
    } catch {
      console.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleSaved = () => {
    setAddOpen(false);
    setEditExpense(null);
    load();
  };

  const grouped = groupByDate(expenses);
  const allTotal = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total > 0 ? `${total} expense${total !== 1 ? "s" : ""}` : "No expenses yet"}
            {allTotal > 0 && ` · $${allTotal.toFixed(2)} shown`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Expense
        </Button>
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search merchant, description…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => setFiltersOpen((v) => !v)} className={cn(filtersOpen && "bg-muted")}>
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 pb-1">
                <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v === "all" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {flatCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color ?? "#6b7280" }} />
                          {c.parentId ? "  " : ""}{c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="w-36"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    placeholder="From"
                  />
                  <span className="text-muted-foreground text-sm">–</span>
                  <Input
                    type="date"
                    className="w-36"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    placeholder="To"
                  />
                </div>
                {(search || categoryFilter || dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setCategoryFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
                    Clear filters
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Expense list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <TrendingDown className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-muted-foreground">No expenses found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {search || categoryFilter || dateFrom || dateTo ? "Try adjusting your filters" : "Add your first expense to get started"}
            </p>
          </div>
          {!search && !categoryFilter && !dateFrom && !dateTo && (
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Expense
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([dateKey, dayExpenses]) => (
            <div key={dateKey}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{formatDate(dateKey)}</h3>
                <span className="text-sm text-muted-foreground tabular-nums">
                  ${dayExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                </span>
              </div>
              <div className="space-y-2">
                {dayExpenses.map((expense) => (
                  <motion.div
                    key={expense.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/20 transition-colors"
                  >
                    {/* Color dot */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white font-semibold text-sm"
                      style={{ backgroundColor: expense.category?.color ?? "#6b7280" }}
                    >
                      {(expense.merchant ?? expense.description ?? "?").charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate text-sm">
                          {expense.merchant ?? expense.description ?? "Unnamed expense"}
                        </span>
                        {expense.category && (
                          <Badge
                            variant="secondary"
                            className="text-xs px-1.5 py-0 h-4 shrink-0"
                            style={{ backgroundColor: (expense.category.color ?? "#6b7280") + "22", color: expense.category.color ?? "#6b7280" }}
                          >
                            {expense.category.name}
                          </Badge>
                        )}
                      </div>
                      {expense.description && expense.merchant && (
                        <p className="text-xs text-muted-foreground truncate">{expense.description}</p>
                      )}
                    </div>

                    {/* Amount */}
                    <span className="font-semibold tabular-nums text-sm shrink-0">
                      ${expense.amount.toFixed(2)}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditExpense(expense)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-destructive"
                        onClick={() => setDeleteExpense(expense)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <ExpenseFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        budgetId={budgetId}
        onSaved={handleSaved}
      />

      {editExpense && (
        <ExpenseFormModal
          open
          onClose={() => setEditExpense(null)}
          budgetId={budgetId}
          editExpense={{
            id: editExpense.id,
            amount: editExpense.amount,
            date: editExpense.date,
            merchant: editExpense.merchant ?? undefined,
            description: editExpense.description ?? undefined,
            notes: editExpense.notes ?? undefined,
            categoryId: editExpense.categoryId ?? undefined,
          }}
          onSaved={handleSaved}
        />
      )}

      <AlertDialog open={!!deleteExpense} onOpenChange={(v) => { if (!v) setDeleteExpense(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the expense of{" "}
              <strong>${deleteExpense?.amount.toFixed(2)}</strong>
              {deleteExpense?.merchant ? ` at ${deleteExpense.merchant}` : ""}
              {". "}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
