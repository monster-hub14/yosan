"use client";

import { useState, useMemo } from "react";
import { Download, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExpenseRow } from "./use-reports";
import { fmtCurrency } from "./use-reports";

type SortKey = "date" | "amount";
type SortDir = "asc" | "desc";

function exportCSV(rows: ExpenseRow[], start: string, end: string) {
  const header = ["Date", "Name", "Merchant", "Category", "Subcategory", "Amount"].join(",");
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = rows.map(r => [
    r.date.slice(0, 10),
    escape(r.description ?? ""),
    escape(r.merchant ?? ""),
    escape(r.parentCategoryName ?? r.categoryName ?? ""),
    escape(r.parentCategoryName ? (r.categoryName ?? "") : ""),
    r.amount.toFixed(2),
  ].join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yosan-report-${start.slice(0, 10)}-to-${end.slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface ExpenseTableProps {
  rows: ExpenseRow[];
  dateRange: { start: string; end: string };
}

export function ExpenseTable({ rows, dateRange }: ExpenseTableProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const topCategories = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of rows) {
      const label = r.parentCategoryName ?? r.categoryName ?? "Uncategorized";
      if (!seen.has(label)) { seen.add(label); result.push(label); }
    }
    return result.sort();
  }, [rows]);

  const subcategories = useMemo(() => {
    if (categoryFilter === "all") return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of rows) {
      const topLabel = r.parentCategoryName ?? r.categoryName ?? "Uncategorized";
      if (topLabel !== categoryFilter) continue;
      if (r.parentCategoryName && r.categoryName) {
        if (!seen.has(r.categoryName)) { seen.add(r.categoryName); result.push(r.categoryName); }
      }
    }
    return result.sort();
  }, [rows, categoryFilter]);

  function handleCategoryChange(val: string) {
    setCategoryFilter(val);
    setSubcategoryFilter("all");
  }

  const filtered = useMemo(() => {
    let out = rows;
    if (categoryFilter !== "all") {
      out = out.filter(r => (r.parentCategoryName ?? r.categoryName ?? "Uncategorized") === categoryFilter);
    }
    if (subcategoryFilter !== "all" && subcategories.length > 0) {
      out = out.filter(r => r.categoryName === subcategoryFilter);
    }
    return out;
  }, [rows, categoryFilter, subcategoryFilter, subcategories]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else cmp = a.amount - b.amount;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 ml-1 text-muted-foreground/50" />;
    return sortDir === "desc"
      ? <ChevronDown className="w-3 h-3 ml-1 text-foreground" />
      : <ChevronUp className="w-3 h-3 ml-1 text-foreground" />;
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            Expense Detail
            <Badge variant="secondary" className="ml-2 text-xs font-normal">{sorted.length} rows</Badge>
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportCSV(sorted, dateRange.start, dateRange.end)}
            disabled={sorted.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Select value={categoryFilter} onValueChange={handleCategoryChange}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {topCategories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {subcategories.length > 0 && (
            <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
              <SelectTrigger className="h-8 text-xs w-[180px]">
                <SelectValue placeholder="All subcategories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subcategories</SelectItem>
                {subcategories.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th
                  className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("date")}
                >
                  <span className="inline-flex items-center">Date <SortIcon k="date" /></span>
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Merchant</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Subcategory</th>
                <th
                  className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("amount")}
                >
                  <span className="inline-flex items-center justify-end">Amount <SortIcon k="amount" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                    No expenses match the current filters
                  </td>
                </tr>
              ) : (
                sorted.map(row => {
                  const topCat = row.parentCategoryName ?? row.categoryName ?? null;
                  const subCat = row.parentCategoryName ? row.categoryName : null;
                  return (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                        {new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-2.5 max-w-[180px] truncate">{row.description ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[140px] truncate">{row.merchant ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{topCat ?? "Uncategorized"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{subCat ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                        {fmtCurrency(row.amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
