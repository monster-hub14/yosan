"use client";

import { useState, useEffect } from "react";
import { UploadReceiptModal } from "@/components/receipts/upload-modal";

const SESSION_KEY = "budget:receipt-prompt-shown";

export function LoginReceiptPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SESSION_KEY)) {
        sessionStorage.setItem(SESSION_KEY, "1");
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      // sessionStorage unavailable — skip
    }
  }, []);

  return (
    <UploadReceiptModal open={open} onClose={() => setOpen(false)} />
  );
}
