"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, AlertTriangle, Receipt,
  Calendar, Store, DollarSign, Tag, Edit3, Save, Trash2, Package, Clock, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CategoryPicker, type CategoryNode } from "@/components/expenses/category-picker";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ExtractedItem {
  description: string;
  amount: number;
  quantity: number;
  confidence: "high" | "medium" | "low";
  categorySuggestion?: {
    categoryId: string | null;
    categoryName: string | null;
    confidence: string;
    isAmbiguous: boolean;
    clarificationQuestion: string | null;
    suggestedOptions?: string[];
  } | null;
}

interface ParsedData {
  merchant: string | null;
  date: string | null;
  total: number | null;
  items: ExtractedItem[];
  confidence: "high" | "medium" | "low";
  error?: string;
  isManual?: boolean;
}

interface PendingImport {
  id: string;
  status: string;
  data: string;
  error?: string;
  createdAt: string;
  receipt?: {
    id: string;
    originalFilename: string;
    mimeType: string;
    storedFilename: string;
  } | null;
}

interface Category {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  isDefault: boolean;
  parentId?: string | null;
  children?: Category[];
}

interface ReviewClientProps {
  id: string;
}

const CONFIDENCE_COLORS = {
  high: "text-green-500",
  medium: "text-amber-500",
  low: "text-destructive",
};

function normalizeDateStr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // If the string starts with YYYY-MM-DD already, extract that portion directly
  // to avoid UTC conversion shifting the calendar day for timezone-aware inputs.
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  // Fallback: parse and format (handles other date representations)
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function validateDateYear(dateStr: string): string | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  const currentYear = new Date().getFullYear();
  if (isNaN(year) || year < 2000) return "Year looks wrong — did you mean " + currentYear + "? Use four digits (e.g. " + currentYear + ").";
  if (year > currentYear + 1) return "Date is in the future — please check the year.";
  return null;
}

function isDateStale(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  return d < ninetyDaysAgo;
}

export function ReviewClient({ id }: ReviewClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [imp, setImp] = useState<PendingImport | null>(null);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Editable top-level fields
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");

  // Per-item category overrides: itemIndex -> categoryId
  const [itemCategories, setItemCategories] = useState<Record<number, string>>({});
  // Answers to clarification questions: itemIndex -> answered categoryId
  const [clarifications, setClarifications] = useState<Record<number, string>>({});

  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [savingLater, setSavingLater] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    confidence: string;
    matchedExpenseId: string;
    reason: string;
    resolutionOptions: Array<{ value: string; label: string }>;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/receipts/${id}`);
    if (!res.ok) {
      toast.error("Receipt not found");
      router.push("/receipts/inbox");
      return;
    }
    const data = await res.json();
    const importData: PendingImport = data.import;
    setImp(importData);

    try {
      const p: ParsedData = JSON.parse(importData.data || "{}");
      setParsed(p);
      setMerchant(p.merchant || "");
      const initialDate = normalizeDateStr(p.date) || new Date().toISOString().slice(0, 10);
      setDate(initialDate);
      setDateError(validateDateYear(initialDate));
      setTotal(p.total != null ? String(p.total) : "");
      // Pre-fill item categories from AI suggestions
      const initCats: Record<number, string> = {};
      (p.items ?? []).forEach((item, i) => {
        if (item.categorySuggestion?.categoryId && !item.categorySuggestion.isAmbiguous) {
          initCats[i] = item.categorySuggestion.categoryId;
        }
      });
      setItemCategories(initCats);
    } catch {
      setParsed({ merchant: null, date: null, total: null, items: [], confidence: "low" });
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // Load categories for budget
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d: { categories?: Category[] }) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  // Poll if still processing
  useEffect(() => {
    if (!imp || (imp.status !== "PROCESSING" && imp.status !== "PENDING")) return;
    const t = setTimeout(() => load(), 2000);
    return () => clearTimeout(t);
  }, [imp, load]);

  function buildItemsPayload() {
    return parsed?.items?.map((item, i) => {
      const hasUserAnswer = clarifications[i] !== undefined;
      const isAmbiguous =
        (item.categorySuggestion?.isAmbiguous === true) && !hasUserAnswer;
      return {
        description: item.description,
        amount: item.amount,
        quantity: item.quantity,
        // Prefer user-supplied clarification answer, then manual item override, then AI suggestion
        categoryId: clarifications[i] ?? itemCategories[i] ?? item.categorySuggestion?.categoryId ?? null,
        isAmbiguous,
      };
    });
  }

  function buildClarificationsPayload() {
    return Object.entries(clarifications).map(([idx, catId]) => {
      const item = parsed?.items?.[parseInt(idx)];
      const cat = categories.find((c) => c.id === catId);
      return {
        itemDescription: item?.description ?? null,
        categoryId: catId,
        categoryName: cat?.name ?? null,
        question: item?.categorySuggestion?.clarificationQuestion ?? null,
      };
    });
  }

  async function handleConfirm(duplicateResolution?: string) {
    if (dateError) return;
    setConfirming(true);
    setDuplicateWarning(null);
    try {
      const res = await fetch(`/api/receipts/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: merchant || null,
          date: date || null,
          total: total ? parseFloat(total) : null,
          notes: notes || null,
          categoryId: categoryId || null,
          items: buildItemsPayload(),
          clarifications: buildClarificationsPayload(),
          duplicateResolution: duplicateResolution ?? null,
        }),
      });

      const data = await res.json();

      if (res.status === 409 && data.duplicateWarning) {
        setDuplicateWarning({
          confidence: data.confidence,
          matchedExpenseId: data.matchedExpenseId,
          reason: data.reason,
          resolutionOptions: data.resolutionOptions ?? [],
        });
        setConfirming(false);
        return;
      }

      if (!res.ok) {
        toast.error(data.error || "Failed to confirm receipt");
        setConfirming(false);
        return;
      }

      if (data.action === "discarded") {
        toast.info("Receipt discarded — existing expense kept");
      } else if (data.action === "merged") {
        toast.success("Receipt merged into existing expense");
      } else {
        toast.success("Receipt confirmed and added to your budget");
      }
      router.push("/receipts/inbox");
    } catch {
      toast.error("Something went wrong");
      setConfirming(false);
    }
  }

  async function handleSaveForLater() {
    setSavingLater(true);
    try {
      // Merge current edits into the data blob
      let current: Record<string, unknown> = {};
      try { current = JSON.parse(imp?.data ?? "{}") as Record<string, unknown>; } catch { /* ignore */ }
      current.merchant = merchant || null;
      current.date = date || null;
      current.total = total ? parseFloat(total) : null;
      current.notes = notes || null;
      current.categoryId = categoryId || null;

      const res = await fetch(`/api/receipts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: JSON.stringify(current),
          status: "SAVED_FOR_LATER",
        }),
      });
      if (res.ok) {
        toast.success("Saved for later — receipt remains in inbox");
        router.push("/receipts/inbox");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        setSavingLater(false);
      }
    } catch {
      toast.error("Something went wrong");
      setSavingLater(false);
    }
  }

  async function handleDiscard() {
    setDiscarding(true);
    try {
      const res = await fetch(`/api/receipts/${id}/discard`, { method: "POST" });
      if (res.ok) {
        toast.success("Receipt discarded");
        router.push("/receipts/inbox");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to discard");
        setDiscarding(false);
      }
    } catch {
      toast.error("Something went wrong");
      setDiscarding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!imp) return null;

  const isProcessing = imp.status === "PROCESSING" || imp.status === "PENDING";
  const isAlreadyDone = imp.status === "CONFIRMED" || imp.status === "DISCARDED";
  const anyAmbiguous = parsed?.items?.some(
    (item) => item.categorySuggestion?.isAmbiguous && item.categorySuggestion.clarificationQuestion
  );

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Back */}
      <Link
        href="/receipts/inbox"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to inbox
      </Link>

      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Receipt className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">
            {isAlreadyDone ? "Receipt" : "Review Receipt"}
          </h1>
          {imp.receipt?.originalFilename && (
            <p className="text-sm text-muted-foreground">{imp.receipt.originalFilename}</p>
          )}
        </div>
        <Badge
          variant="secondary"
          className={`ml-auto ${
            imp.status === "CONFIRMED"
              ? "text-green-500"
              : imp.status === "DISCARDED"
              ? "text-muted-foreground"
              : imp.status === "NEEDS_REVIEW"
              ? "text-amber-500"
              : ""
          }`}
        >
          {imp.status === "CONFIRMED" ? "Confirmed" :
           imp.status === "DISCARDED" ? "Discarded" :
           imp.status === "NEEDS_REVIEW" ? "Needs review" :
           imp.status === "PROCESSING" ? "Processing..." : imp.status}
        </Badge>
      </div>

      {/* Processing state */}
      {isProcessing && (
        <Alert>
          <Loader2 className="w-4 h-4 animate-spin" />
          <AlertDescription>
            AI is reading your receipt… This usually takes a few seconds.
          </AlertDescription>
        </Alert>
      )}

      {/* AI confidence banner */}
      {parsed && !isProcessing && parsed.confidence && (
        <div className={`flex items-center gap-2 text-sm ${CONFIDENCE_COLORS[parsed.confidence]}`}>
          {parsed.confidence === "high" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : parsed.confidence === "medium" ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          AI confidence:{" "}
          <span className="font-medium capitalize">{parsed.confidence}</span>
          {parsed.error && (
            <span className="text-muted-foreground ml-2">({parsed.error})</span>
          )}
        </div>
      )}

      {/* Duplicate warning */}
      {duplicateWarning && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <AlertDescription>
            <p className="font-medium text-amber-600 dark:text-amber-400 mb-1">
              {duplicateWarning.confidence === "high" ? "Likely duplicate" : "Possible duplicate"}
            </p>
            <p className="text-sm mb-3">{duplicateWarning.reason}</p>
            <div className="flex flex-wrap gap-2">
              {duplicateWarning.resolutionOptions.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={opt.value === "keep_new" ? "default" : "outline"}
                  onClick={() => handleConfirm(opt.value)}
                  disabled={confirming}
                >
                  {confirming && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                  {opt.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDuplicateWarning(null)}
                disabled={confirming}
              >
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Ambiguous category clarification prompts */}
      {anyAmbiguous && !isAlreadyDone && !isProcessing && (
        <Card className="border-amber-500/20 bg-amber-500/3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <HelpCircle className="w-4 h-4" />
              Help categorize these items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {parsed?.items?.map((item, i) => {
              if (!item.categorySuggestion?.isAmbiguous || !item.categorySuggestion.clarificationQuestion) return null;
              return (
                <div key={i} className="space-y-1.5">
                  <p className="text-sm font-medium">{item.categorySuggestion.clarificationQuestion}</p>
                  <p className="text-xs text-muted-foreground">{item.description} — ${item.amount.toFixed(2)}</p>
                  <Select
                    value={clarifications[i] ?? itemCategories[i] ?? ""}
                    onValueChange={(val) => {
                      setClarifications((prev) => ({ ...prev, [i]: val }));
                      setItemCategories((prev) => ({ ...prev, [i]: val }));
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Choose a category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Already done banner */}
      {isAlreadyDone && (
        <Alert className={imp.status === "CONFIRMED" ? "border-green-500/30 bg-green-500/5" : ""}>
          {imp.status === "CONFIRMED" ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          <AlertDescription>
            This receipt has been{" "}
            <strong>{imp.status === "CONFIRMED" ? "confirmed" : "discarded"}</strong>.
          </AlertDescription>
        </Alert>
      )}

      {/* Editable fields */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-muted-foreground" />
            Receipt details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="merchant" className="flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-muted-foreground" />
                Merchant
              </Label>
              <Input
                id="merchant"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. Whole Foods"
                disabled={isAlreadyDone}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date" className="flex items-center gap-1.5 flex-wrap">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                Date
                {!isAlreadyDone && isDateStale(date) && !dateError && (
                  <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3" />
                    Date is from {new Date(date).getFullYear()} — please verify
                  </span>
                )}
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  const val = e.target.value;
                  setDate(val);
                  setDateError(validateDateYear(val));
                }}
                disabled={isAlreadyDone}
                className={dateError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {dateError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {dateError}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="total" className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                Total
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="total"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-7"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  disabled={isAlreadyDone}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                Category (overall)
              </Label>
              <CategoryPicker
                categories={categories as CategoryNode[]}
                value={categoryId || null}
                onChange={(id) => setCategoryId(id ?? "")}
                disabled={isAlreadyDone}
                placeholder="Choose a category…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note…"
              disabled={isAlreadyDone}
            />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      {parsed?.items && parsed.items.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              Line items ({parsed.items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {parsed.items.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="space-y-1.5 pb-3 border-b border-border last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                    </div>
                    {item.quantity > 1 && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        ×{item.quantity}
                      </span>
                    )}
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      ${item.amount.toFixed(2)}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        item.confidence === "high"
                          ? "bg-green-500"
                          : item.confidence === "medium"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                    />
                  </div>
                  {/* Per-item category override */}
                  {!isAlreadyDone && categories.length > 0 && (
                    <Select
                      value={itemCategories[i] ?? "none"}
                      onValueChange={(v) =>
                        setItemCategories((prev) => ({ ...prev, [i]: v === "none" ? "" : v }))
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Assign category…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {isAlreadyDone && item.categorySuggestion?.categoryName && (
                    <p className="text-xs text-muted-foreground">
                      → {item.categorySuggestion.categoryName}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {!isAlreadyDone && !isProcessing && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            className="flex-1"
            onClick={() => handleConfirm()}
            disabled={confirming || discarding || savingLater || !!dateError}
          >
            {confirming ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Confirm & add to budget
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveForLater}
            disabled={confirming || discarding || savingLater}
            title="Save for later"
          >
            {savingLater ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleDiscard}
            disabled={confirming || discarding || savingLater}
            title="Discard receipt"
          >
            {discarding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
