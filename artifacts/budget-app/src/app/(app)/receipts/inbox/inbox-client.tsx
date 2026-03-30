"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox, Loader2, Clock, CheckCircle2, XCircle, AlertCircle, Upload,
  RefreshCw, Receipt, ChevronRight, Filter, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UploadReceiptModal } from "@/components/receipts/upload-modal";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  CONFIRMED: { label: "Confirmed", color: "text-green-500", icon: CheckCircle2 },
  DISCARDED: { label: "Discarded", color: "text-muted-foreground", icon: XCircle },
  FAILED: { label: "Failed", color: "text-destructive", icon: XCircle },
};

const ALL_STATUSES = "PENDING,PROCESSING,NEEDS_REVIEW,CONFIRMED,DISCARDED,FAILED";
const INBOX_STATUSES = "PENDING,PROCESSING,NEEDS_REVIEW";

export function InboxClient() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "needs-review";

  const [filter, setFilter] = useState<string>(initialStatus);
  const [imports, setImports] = useState<PendingImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);

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

  const reviewableImports = imports.filter((i) => i.status === "NEEDS_REVIEW");

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

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="needs-review">Needs review</SelectItem>
            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
            <SelectItem value="DISCARDED">Discarded</SelectItem>
            <SelectItem value="all">All receipts</SelectItem>
          </SelectContent>
        </Select>

        {/* Bulk actions — only show when viewing reviewable items */}
        {reviewableImports.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
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
          </div>
        )}
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
              const clickable = imp.status === "NEEDS_REVIEW" || imp.status === "CONFIRMED";

              const inner = (
                <motion.div
                  key={imp.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-xl border border-border bg-card p-4 flex items-center gap-4 ${
                    clickable ? "hover:border-primary/40 transition-colors cursor-pointer" : ""
                  }`}
                >
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
                  {clickable && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </motion.div>
              );

              return clickable ? (
                <Link key={imp.id} href={`/receipts/${imp.id}`}>
                  {inner}
                </Link>
              ) : (
                <div key={imp.id}>{inner}</div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
