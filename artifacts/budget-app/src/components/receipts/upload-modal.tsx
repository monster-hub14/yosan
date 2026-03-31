"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, X, FileImage, CheckCircle2, AlertCircle, Receipt,
  Camera, Type, Image, ArrowLeft,
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
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  budgetId?: string;
}

type CaptureMode = "choose" | "upload" | "camera" | "screenshot" | "manual";
type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

function ScanAnimation({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Receipt + scan line */}
      <div className="relative w-28 h-36 flex items-center justify-center">
        {/* Receipt silhouette */}
        <div className="absolute inset-x-4 inset-y-0 rounded-lg bg-primary/8 border border-primary/20 flex flex-col items-center justify-center gap-2 overflow-hidden">
          {/* Receipt lines */}
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="h-px rounded-full bg-primary/25"
              style={{ width: `${60 - i * 8}%` }}
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.2 + i * 0.07, duration: 0.3 }}
            />
          ))}
          {/* Total line */}
          <motion.div
            className="h-0.5 rounded-full bg-primary/40"
            style={{ width: "65%" }}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          />
        </div>

        {/* Sweep scan line */}
        <motion.div
          className="absolute inset-x-2 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)",
            boxShadow: "0 0 8px 1px hsl(var(--primary) / 0.5)",
          }}
          animate={{ top: ["12%", "88%", "12%"] }}
          transition={{ duration: 2.0, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="text-center">
        <p className="font-semibold text-base">{label}</p>
        <p className="text-sm text-muted-foreground mt-1">{sublabel}</p>
      </div>

      {/* Pulsing dots */}
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-primary/60"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.15, 0.85] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

export function UploadReceiptModal({ open, onClose, budgetId }: UploadModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [captureMode, setCaptureMode] = useState<CaptureMode>("choose");
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [manual, setManual] = useState({ merchant: "", date: "", total: "" });

  function resetState() {
    setCaptureMode("choose");
    setUploadState("idle");
    setSelectedFile(null);
    setPreview(null);
    setManual({ merchant: "", date: "", total: "" });
    setDragActive(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleSkip() {
    handleClose();
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

  async function uploadFile(file: File) {
    setUploadState("uploading");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = budgetId ? `/api/receipts/upload?budgetId=${budgetId}` : "/api/receipts/upload";
      const res = await fetch(url, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      const importId = (data as { pendingImport?: { id: string } }).pendingImport?.id;
      setUploadState("processing");
      await pollUntilReady(importId ?? "");
    } catch (err) {
      setUploadState("error");
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleUploadFile() {
    if (!selectedFile) return;
    await uploadFile(selectedFile);
  }

  async function handleManualEntry() {
    setUploadState("uploading");
    try {
      const formData = new FormData();
      formData.append("manual", JSON.stringify(manual));
      const url = budgetId ? `/api/receipts/upload?budgetId=${budgetId}` : "/api/receipts/upload";
      const res = await fetch(url, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to create entry");
      }
      const data = await res.json();
      const importId = (data as { pendingImport?: { id: string } }).pendingImport?.id;
      setUploadState("done");
      toast.success("Receipt added to inbox");
      setTimeout(() => {
        handleClose();
        if (importId) router.push(`/receipts/${importId}/review`);
        else router.push("/receipts/inbox");
      }, 1000);
    } catch (err) {
      setUploadState("error");
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function pollUntilReady(id: string, attempts = 0) {
    if (!id || attempts > 20) {
      setUploadState("done");
      setTimeout(() => { handleClose(); router.push(`/receipts/${id}/review`); }, 800);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`/api/receipts/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const status = (data as { import?: { status: string } }).import?.status;
      if (status === "NEEDS_REVIEW" || status === "FAILED") {
        setUploadState("done");
        setTimeout(() => { handleClose(); router.push(`/receipts/${id}/review`); }, 800);
      } else {
        await pollUntilReady(id, attempts + 1);
      }
    } catch {
      await pollUntilReady(id, attempts + 1);
    }
  }

  const CAPTURE_OPTIONS = [
    {
      mode: "upload" as CaptureMode,
      icon: Upload,
      label: "Upload photo or file",
      desc: "JPEG, PNG, WEBP, HEIC, PDF up to 20MB",
    },
    {
      mode: "camera" as CaptureMode,
      icon: Camera,
      label: "Take a photo",
      desc: "Use your device camera to capture the receipt",
    },
    {
      mode: "screenshot" as CaptureMode,
      icon: Image,
      label: "Upload screenshot",
      desc: "Select a screenshot or screen capture",
    },
    {
      mode: "manual" as CaptureMode,
      icon: Type,
      label: "Enter manually",
      desc: "Type in the merchant, date and total",
    },
  ];

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
          {/* === CHOOSE MODE === */}
          {uploadState === "idle" && captureMode === "choose" && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-3 py-1"
            >
              {CAPTURE_OPTIONS.map(({ mode, icon: Icon, label, desc }, i) => (
                <motion.button
                  key={mode}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => {
                    if (mode === "camera") {
                      setCaptureMode("camera");
                      setTimeout(() => cameraInputRef.current?.click(), 50);
                    } else if (mode === "screenshot") {
                      setCaptureMode("screenshot");
                      setTimeout(() => screenshotInputRef.current?.click(), 50);
                    } else {
                      setCaptureMode(mode);
                    }
                  }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center gap-4 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </motion.button>
              ))}

              {/* Hidden file inputs for camera and screenshot */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { handleFileSelect(f); }
                }}
              />
              <input
                ref={screenshotInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { handleFileSelect(f); }
                }}
              />

              <div className="flex justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  Skip for now
                </Button>
              </div>
            </motion.div>
          )}

          {/* === FILE/CAMERA/SCREENSHOT UPLOAD === */}
          {uploadState === "idle" && (captureMode === "upload" || captureMode === "camera" || captureMode === "screenshot") && (
            <motion.div
              key="file"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <button
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setCaptureMode("choose"); setSelectedFile(null); setPreview(null); }}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

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
                      {captureMode === "camera" ? (
                        <Camera className="w-6 h-6 text-primary" />
                      ) : captureMode === "screenshot" ? (
                        <Image className="w-6 h-6 text-primary" />
                      ) : (
                        <Upload className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {captureMode === "camera"
                          ? "Tap to open camera"
                          : captureMode === "screenshot"
                          ? "Drop screenshot or click to browse"
                          : "Drop receipt here or click to browse"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {captureMode === "camera"
                          ? "Take a photo of your receipt"
                          : "JPEG, PNG, WEBP, HEIC or PDF • up to 20MB"}
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={captureMode === "camera" ? "image/*" : "image/*,.pdf"}
                    capture={captureMode === "camera" ? "environment" : undefined}
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
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}

          {/* === MANUAL ENTRY === */}
          {uploadState === "idle" && captureMode === "manual" && (
            <motion.div
              key="manual"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <button
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setCaptureMode("choose")}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

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
            </motion.div>
          )}

          {/* === UPLOADING === */}
          {uploadState === "uploading" && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <ScanAnimation
                label="Uploading receipt…"
                sublabel="Sending to server"
              />
            </motion.div>
          )}

          {/* === PROCESSING === */}
          {uploadState === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <ScanAnimation
                label="Reading your receipt…"
                sublabel="Extracting merchant, items, and amounts"
              />
            </motion.div>
          )}

          {/* === DONE === */}
          {uploadState === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <motion.div
                className="p-4 rounded-full bg-green-500/10"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 350, damping: 20, delay: 0.1 }}
              >
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </motion.div>
              <div className="text-center">
                <p className="font-semibold text-base">Receipt ready for review</p>
                <p className="text-sm text-muted-foreground mt-1">Taking you there now…</p>
              </div>
            </motion.div>
          )}

          {/* === ERROR === */}
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
                <p className="font-semibold">Something went wrong</p>
                <p className="text-sm text-muted-foreground mt-1">Check the error above and try again</p>
              </div>
              <Button variant="outline" onClick={resetState}>Try again</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
