"use client";

/**
 * LoginReceiptPrompt — shows a dismissible receipt capture prompt once per browser session.
 *
 * Rendered inside the (app) layout. Uses sessionStorage so it only fires once per login,
 * not on every navigation. Dismissed state persists until the browser tab/session closes.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadReceiptModal } from "@/components/receipts/upload-modal";
import { Button } from "@/components/ui/button";
import { Receipt, Upload, X } from "lucide-react";

const SESSION_KEY = "budget:receipt-prompt-shown";

export function LoginReceiptPrompt() {
  const [show, setShow] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SESSION_KEY)) {
        // Small delay so the page feels settled before we show the prompt
        const t = setTimeout(() => setShow(true), 800);
        return () => clearTimeout(t);
      }
    } catch {
      // sessionStorage may be unavailable (e.g. private browsing restrictions)
    }
  }, []);

  function dismiss() {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  }

  function handleUpload() {
    dismiss();
    setUploadOpen(true);
  }

  return (
    <>
      <UploadReceiptModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
          >
            <div className="rounded-2xl border border-border bg-card shadow-xl backdrop-blur-sm p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-primary/10 shrink-0 mt-0.5">
                <Receipt className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-tight">
                  Got a receipt to log?
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Upload a photo, forward an email, or enter it manually — AI handles the rest.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" className="h-7 text-xs" onClick={handleUpload}>
                    <Upload className="w-3 h-3 mr-1.5" />
                    Add receipt
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={dismiss}>
                    Not now
                  </Button>
                </div>
              </div>
              <button
                onClick={dismiss}
                className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
