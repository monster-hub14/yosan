"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Receipt, X } from "lucide-react";
import { UploadReceiptModal } from "./upload-modal";

/**
 * Global floating action button for uploading receipts.
 * Renders fixed bottom-right on all main app screens.
 */
export function UploadFAB() {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <UploadReceiptModal open={open} onClose={() => setOpen(false)} />

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col-reverse items-end gap-3">
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              className="flex flex-col-reverse gap-2"
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setOpen(true);
                }}
                className="flex items-center gap-2.5 bg-card border border-border shadow-lg rounded-full px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Receipt className="w-4 h-4 text-primary" />
                Add receipt
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            // If no menu needed, directly open
            setOpen(true);
            setMenuOpen(false);
          }}
          className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center hover:bg-primary/90 transition-colors relative"
          aria-label="Upload receipt"
        >
          <AnimatePresence mode="wait">
            {menuOpen ? (
              <motion.div
                key="x"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                <X className="w-6 h-6" />
              </motion.div>
            ) : (
              <motion.div
                key="plus"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
              >
                <Plus className="w-6 h-6" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  );
}
