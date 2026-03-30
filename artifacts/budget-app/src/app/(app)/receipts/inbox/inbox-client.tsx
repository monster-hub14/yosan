"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox, Loader2, Clock, CheckCircle2, XCircle, AlertCircle, Upload,
  RefreshCw, Receipt, ChevronRight, Filter, Trash2, Save, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UploadReceiptModal } from "@/components/receipts/upload-modal";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

interface PendingImport {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  data: string;
  error?: string;
  receipt?: {
    id: string;
    originalFilename: string;
    mimeType: string;
    uploadedAt: string;
  } | null;
  user?: { id: string; name: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: "Pending", color: "text-muted-foreground", icon: Clock },
  PROCESSING: { label: "Processing", color: "text-blue-500", icon: Loader2 },
  NEEDS_REVIEW: { label: "Needs review", color: "text-amber-500", icon: AlertCircle },
  SAVED_FOR_LATER: { label: "Saved for later", color: "text-blue-400", icon: Clock },
  CONFIRMED: { label: "Confirmed", color: "text-green-500", icon: CheckCircle2 },
  DISCARDED: { label: "Discarded", color: "text-muted-foreground", icon: XCircle },
  FAILED: { label: "Failed", color: "text-destructive", icon: XCircle },
};

const ALL_STATUSES = "PENDING,PROCESSING,NEEDS_REVIEW,SAVED_FOR_LATER,CONFIRMED,DISCARDED,FAILED";
const INBOX_STATUSES = "PENDING,PROCESSING,NEEDS_REVIEW,SAVED_FOR_LATER";

export function InboxClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialStatus = searchParams.get("status") ?? "needs-review";

  const [filter, setFilter] = useState<string>(initialStatus);
  const [imports, setImports] = useState<PendingImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [cardWorking, setCardWorking] = useState<Record<string, string>>({});

  const statusQuery = filter === "needs-review"
    ? INBOX_STATUSES
    : filter === "all"
    ? ALL_STATUSES
    : filter.toUpperCase();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/receipts/inbox?status=${statusQuery}`);
      if (res.ok) {
        const data = await res.json();
        setImports(data.imports ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusQuery]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh when there are processing items
  useEffect(() => {
    const hasProcessing = imports.some((i) => i.status === "PROCESSING" || i.status === "PENDING");
    if (!hasProcessing) return;
    const t = setTimeout(() => load(), 3000);
    return () => clearTimeout(t);
  }, [imports, load]);

  const reviewableImports = imports.filter(
    (i) => i.status === "NEEDS_REVIEW" || i.status === "SAVED_FOR_LATER"
  );

  async function handleBulkDiscard() {
    if (reviewableImports.length === 0) return;
    setBulkWorking(true);
    let failed = 0;
    await Promise.all(
      reviewableImports.map(async (imp) => {
        const res = await fetch(`/api/receipts/${imp.id}/discard`, { method: "POST" });
        if (!res.ok) failed++;
      })
    );
    setBulkWorking(false);
    if (failed > 0) {
      toast.error(`${failed} receipt(s) could not be discarded`);
    } else {
      toast.success(`${reviewableImports.length} receipt(s) discarded`);
    }
    await load();
  }

  const highConfidenceImports = imports.filter((imp) => {
    if (imp.status !== "NEEDS_REVIEW") return false;
    const d = getParsedData(imp);
    return d.confidence === "high" && d.total != null;
  });

  async function handleBulkConfirmHighConfidence() {
    if (highConfidenceImports.length === 0) return;
    setBulkWorking(true);
    let succeeded = 0;
    let failed = 0;
    await Promise.all(
      highConfidenceImports.map(async (imp) => {
        const d = getParsedData(imp);
        const res = await fetch(`/api/receipts/${imp.id}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchant: d.merchant ?? null,
            date: d.date ?? null,
            total: d.total ?? null,
            items: (d.items ?? []).map((it: { description: string; amount: number; quantity?: number; categorySuggestion?: { categoryId?: string | null } | null }) => ({
              description: it.description,
              amount: it.amount,
              quantity: it.quantity ?? 1,
              categoryId: it.categorySuggestion?.categoryId ?? null,
            })),
          }),
        });
        if (res.ok) succeeded++;
        else failed++;
      })
    );
    setBulkWorking(false);
    if (succeeded > 0) toast.success(`${succeeded} high-confidence receipt(s) confirmed`);
    if (failed > 0) toast.error(`${failed} receipt(s) could not be confirmed`);
    await load();
  }

  async function handleCardDiscard(id: string) {
    setCardWorking((prev) => ({ ...prev, [id]: "discard" }));
    const res = await fetch(`/api/receipts/${id}/discard`, { method: "POST" });
    if (res.ok) {
      toast.success("Receipt discarded");
      await load();
    } else {
      toast.error("Failed to discard");
    }
    setCardWorking((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function handleCardSaveForLater(id: string, currentData: string) {
    setCardWorking((prev) => ({ ...prev, [id]: "save" }));
    const res = await fetch(`/api/receipts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: currentData, status: "SAVED_FOR_LATER" }),
    });
    if (res.ok) {
      toast.success("Saved for later");
      await load();
    } else {
      toast.error("Failed to save");
    }
    setCardWorking((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function handleCardQuickConfirm(id: string) {
    router.push(`/receipts/${id}`);
  }

  function getParsedData(imp: PendingImport) {
    try { return JSON.parse(imp.data); } catch { return {}; }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <UploadReceiptModal open={uploadOpen} onClose={() => { setUploadOpen(false); load(); }} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Inbox className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Receipt Inbox</h1>
            <p className="text-sm text-muted-foreground">
              {imports.length} {imports.length === 1 ? "receipt" : "receipts"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
        </div>
      </div>

      {/* Filter + Bulk actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="needs-review">Inbox (active)</SelectItem>
            <SelectItem value="SAVED_FOR_LATER">Saved for later</SelectItem>
            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
            <SelectItem value="DISCARDED">Discarded</SelectItem>
            <SelectItem value="all">All receipts</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {highConfidenceImports.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkConfirmHighConfidence}
              disabled={bulkWorking}
              className="text-green-600 border-green-500/30 hover:bg-green-500/10"
            >
              {bulkWorking ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3 mr-1.5" />
              )}
              Confirm high-confidence ({highConfidenceImports.length})
            </Button>
          )}
          {reviewableImports.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkDiscard}
              disabled={bulkWorking}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {bulkWorking ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3 mr-1.5" />
              )}
              Discard all ({reviewableImports.length})
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : imports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-2xl bg-muted/40">
            <Receipt className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <div>
            <p className="font-medium">No receipts here</p>
            <p className="text-sm text-muted-foreground">
              {filter === "needs-review"
                ? "Upload a receipt to get started"
                : "Nothing to show for this filter"}
            </p>
          </div>
          {filter === "needs-review" && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload receipt
            </Button>
          )}
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div className="space-y-2">
            {imports.map((imp) => {
              const parsed = getParsedData(imp);
              const meta = STATUS_LABELS[imp.status] ?? STATUS_LABELS.FAILED;
              const StatusIcon = meta.icon;
              const isProcessing = imp.status === "PROCESSING" || imp.status === "PENDING";
              const isActionable = imp.status === "NEEDS_REVIEW" || imp.status === "SAVED_FOR_LATER";
              const clickable = isActionable || imp.status === "CONFIRMED";
              const working = cardWorking[imp.id];

              return (
                <motion.div
                  key={imp.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-border bg-card"
                >
                  {/* Main card row */}
                  <div className="p-4 flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-muted/50 shrink-0">
                      <Receipt className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {parsed.merchant || imp.receipt?.originalFilename || "Unknown receipt"}
                        </p>
                        {parsed.total != null && (
                          <span className="text-sm font-semibold text-primary shrink-0">
                            ${Number(parsed.total).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="secondary"
                          className={`text-xs gap-1 ${meta.color}`}
                        >
                          <StatusIcon className={`w-3 h-3 ${isProcessing ? "animate-spin" : ""}`} />
                          {meta.label}
                        </Badge>
                        {parsed.date && (
                          <span className="text-xs text-muted-foreground">
                            {parsed.date}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(imp.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      {imp.error && (
                        <p className="text-xs text-destructive mt-1 truncate">{imp.error}</p>
                      )}
                    </div>
                    {clickable && (
                      <Link href={`/receipts/${imp.id}`}>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Link>
                    )}
                  </div>

                  {/* Per-card quick actions for actionable items */}
                  {isActionable && (
                    <div className="flex items-center gap-1.5 px-4 pb-3 border-t border-border pt-3">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        onClick={() => handleCardQuickConfirm(imp.id)}
                        disabled={!!working}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Review
                      </Button>
                      {imp.status !== "SAVED_FOR_LATER" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleCardSaveForLater(imp.id, imp.data)}
                          disabled={!!working}
                        >
                          {working === "save" ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3 mr-1" />
                          )}
                          Save for later
                        </Button>
                      )}
                      {imp.status === "SAVED_FOR_LATER" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={async () => {
                            setCardWorking((prev) => ({ ...prev, [imp.id]: "unsave" }));
                            const res = await fetch(`/api/receipts/${imp.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "NEEDS_REVIEW" }),
                            });
                            if (res.ok) { toast.success("Moved back to inbox"); await load(); }
                            else toast.error("Failed");
                            setCardWorking((prev) => { const n = { ...prev }; delete n[imp.id]; return n; });
                          }}
                          disabled={!!working}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Return to inbox
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleCardDiscard(imp.id)}
                        disabled={!!working}
                      >
                        {working === "discard" ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        Discard
                      </Button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
