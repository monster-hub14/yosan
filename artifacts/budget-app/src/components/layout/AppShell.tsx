"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";
import MobileNav from "./MobileNav";
import { UploadFAB } from "@/components/receipts/upload-fab";
import { type SessionPayload } from "@/lib/auth/types";

interface AppShellProps {
  user: SessionPayload;
  activeBudgetId?: string | null;
  children: React.ReactNode;
}

export default function AppShell({ user, activeBudgetId, children }: AppShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);
  const toggleMobileSidebar = useCallback(() => setMobileSidebarOpen((v) => !v), []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={closeMobileSidebar}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* Sidebar — always visible on lg+; slide-in drawer on smaller screens */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 lg:relative lg:flex lg:z-auto lg:translate-x-0 transition-transform duration-200",
          mobileSidebarOpen ? "flex translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
        style={{ willChange: "transform" }}
      >
        <AppSidebar user={user} onClose={closeMobileSidebar} />
      </div>

      {/* Main column */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <AppHeader
          user={user}
          activeBudgetId={activeBudgetId}
          onMobileMenuToggle={toggleMobileSidebar}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      <UploadFAB />
    </div>
  );
}
