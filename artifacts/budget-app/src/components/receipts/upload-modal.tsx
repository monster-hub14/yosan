"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, X, FileImage, Loader2, CheckCircle2, AlertCircle, Receipt,
  Camera, Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  budgetId?: string;
}

type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

export function UploadReceiptModal({ open, onClose, budgetId }: UploadModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Manual entry state
  const [manual, setManual] = useState({ merchant: "", date: "", total: "" });

  function resetState() {
    setUploadState("idle");
    setSelectedFile(null);
    setPreview(null);
    setPendingId(null);
    setManual({ merchant: "", date: "", total: "" });
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleFileSelect(file: File) {
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  async function handleUploadFile() {
    if (!selectedFile) return;
    setUploadState("uploading");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const url = budgetId
        ? `/api/receipts/upload?budgetId=${budgetId}`
        : "/api/receipts/upload";

      const res = await fetch(url, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setPendingId(data.pendingImport?.id);
      setUploadState("processing");

      // Poll until AI is done
      await pollUntilReady(data.pendingImport?.id);
    } catch (err) {
      setUploadState("error");
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleManualEntry() {
    setUploadState("uploading");
    try {
      const formData = new FormData();
      formData.append("manual", JSON.stringify(manual));

      const url = budgetId
        ? `/api/receipts/upload?budgetId=${budgetId}`
        : "/api/receipts/upload";

      const res = await fetch(url, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create entry");
      }

      const data = await res.json();
      setPendingId(data.pendingImport?.id);
      setUploadState("done");
      toast.success("Receipt added to inbox");
      setTimeout(() => {
        handleClose();
        router.push("/receipts/inbox");
      }, 1200);
    } catch (err) {
      setUploadState("error");
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function pollUntilReady(id: string, attempts = 0) {
    if (!id || attempts > 20) {
      setUploadState("done");
      navigateToReview(id);
      return;
    }

    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`/api/receipts/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const status = data.import?.status;
      if (status === "NEEDS_REVIEW" || status === "COMPLETED" || status === "FAILED") {
        setUploadState("done");
        setTimeout(() => {
          handleClose();
          navigateToReview(id);
        }, 800);
      } else {
        await pollUntilReady(id, attempts + 1);
      }
    } catch {
      await pollUntilReady(id, attempts + 1);
    }
  }

  function navigateToReview(id: string) {
    router.push(`/receipts/${id}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            Add Receipt
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {uploadState === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <Tabs defaultValue="upload" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="upload" className="flex-1">
                    <Camera className="w-4 h-4 mr-2" />
                    Upload receipt
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="flex-1">
                    <Type className="w-4 h-4 mr-2" />
                    Enter manually
                  </TabsTrigger>
                </TabsList>

                {/* Upload tab */}
                <TabsContent value="upload" className="mt-4 space-y-4">
                  {!selectedFile ? (
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                        dragActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted/30"
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={onDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 rounded-full bg-primary/10">
                          <Upload className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Drop receipt here or click to browse</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            JPEG, PNG, WEBP, HEIC or PDF • up to 20MB
                          </p>
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileSelect(f);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
                        {preview ? (
                          <img
                            src={preview}
                            alt="Receipt preview"
                            className="w-full max-h-48 object-contain"
                          />
                        ) : (
                          <div className="flex items-center gap-3 p-4">
                            <FileImage className="w-8 h-8 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-sm">{selectedFile.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                              </p>
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => { setSelectedFile(null); setPreview(null); }}
                          className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background border border-border"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <Button className="w-full" onClick={handleUploadFile}>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload & process with AI
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* Manual tab */}
                <TabsContent value="manual" className="mt-4 space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="m-merchant">Merchant (optional)</Label>
                      <Input
                        id="m-merchant"
                        placeholder="e.g. Whole Foods"
                        value={manual.merchant}
                        onChange={(e) => setManual((m) => ({ ...m, merchant: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="m-date">Date</Label>
                      <Input
                        id="m-date"
                        type="date"
                        value={manual.date}
                        onChange={(e) => setManual((m) => ({ ...m, date: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="m-total">Total amount</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          id="m-total"
                          type="number"
                          step="0.01"
                          min="0"
                          className="pl-7"
                          placeholder="0.00"
                          value={manual.total}
                          onChange={(e) => setManual((m) => ({ ...m, total: e.target.value }))}
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleManualEntry}
                      disabled={!manual.total}
                    >
                      Add to inbox
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}

          {(uploadState === "uploading" || uploadState === "processing") && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <div className="relative">
                <div className="p-4 rounded-full bg-primary/10">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium">
                  {uploadState === "uploading" ? "Uploading receipt…" : "AI is reading your receipt…"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {uploadState === "processing"
                    ? "Extracting items, amounts, and merchant details"
                    : "Sending to server"}
                </p>
              </div>
            </motion.div>
          )}

          {uploadState === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <div className="p-4 rounded-full bg-green-500/10">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <div className="text-center">
                <p className="font-medium">Receipt ready for review</p>
                <p className="text-sm text-muted-foreground mt-1">Taking you to the review screen…</p>
              </div>
            </motion.div>
          )}

          {uploadState === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <div className="p-4 rounded-full bg-destructive/10">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <div className="text-center">
                <p className="font-medium">Upload failed</p>
                <p className="text-sm text-muted-foreground mt-1">Check the error and try again</p>
              </div>
              <Button variant="outline" onClick={resetState}>Try again</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
