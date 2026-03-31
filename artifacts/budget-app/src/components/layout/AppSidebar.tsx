"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Receipt,
  BarChart3,
  Settings,
  PiggyBank,
  ChevronRight,
  RefreshCw,
  LineChart,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { type SessionPayload } from "@/lib/auth/types";

interface AppSidebarProps {
  user: SessionPayload;
  onClose?: () => void;
}

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/income", icon: TrendingUp, label: "Income" },
  { href: "/expenses", icon: TrendingDown, label: "Expenses" },
  { href: "/categories", icon: Tag, label: "Categories" },
  { href: "/receipts", icon: Receipt, label: "Receipts" },
  { href: "/recurring", icon: RefreshCw, label: "Recurring" },
  { href: "/savings", icon: PiggyBank, label: "Savings" },
  { href: "/reports", icon: BarChart3, label: "Reports" },
  { href: "/analysis", icon: LineChart, label: "Analysis" },
  { href: "/forecast", icon: Sparkles, label: "Forecast" },
];

export default function AppSidebar({ user, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 h-full",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "h-14 flex items-center border-b border-sidebar-border px-4 gap-3 flex-shrink-0",
          collapsed && "px-3 justify-center"
        )}
      >
        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
          <Image
            src="/logo.png"
            alt="Yosan AI"
            width={32}
            height={32}
            className="w-full h-full object-contain"
            priority
          />
        </div>
        {!collapsed && (
          <span className="font-bold text-sidebar-foreground text-sm tracking-tight">
            Yosan AI
          </span>
        )}

        {/* Mobile close button — only visible on smaller screens */}
        {onClose && !collapsed && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors lg:hidden"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "text-muted-foreground hover:text-foreground transition-colors hidden lg:block",
            !collapsed && "ml-auto",
            collapsed && "ml-0"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronRight
            className={cn(
              "w-4 h-4 transition-transform",
              !collapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? label : undefined}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-lg bg-sidebar-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <motion.span
                className="relative z-10 flex items-center gap-3"
                whileHover={{ x: active ? 0 : 2 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </motion.span>
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <div className="border-t border-sidebar-border p-2 flex-shrink-0">
        <Link
          href="/settings"
          onClick={onClose}
          className={cn(
            "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "text-sidebar-primary-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          {pathname.startsWith("/settings") && (
            <motion.div
              layoutId="sidebar-active-pill"
              className="absolute inset-0 rounded-lg bg-sidebar-primary"
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-3">
            <Settings className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Settings</span>}
          </span>
        </Link>
      </div>

      {/* User info */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-3 border-t border-sidebar-border flex-shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">
                  {user.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
