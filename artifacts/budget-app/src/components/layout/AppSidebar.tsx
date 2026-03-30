"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Receipt,
  BarChart3,
  Settings,
  Wallet,
  PiggyBank,
  ChevronRight,
  RefreshCw,
  LineChart,
  Sparkles,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type SessionPayload } from "@/lib/auth/types";

interface AppSidebarProps {
  user: SessionPayload;
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

export default function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div
        className={cn(
          "h-14 flex items-center border-b border-sidebar-border px-4 gap-3",
          collapsed && "px-3 justify-center"
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Wallet className="w-4 h-4 text-primary" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sidebar-foreground text-sm">
            Budget
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "ml-auto text-muted-foreground hover:text-foreground transition-colors",
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

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>

      {!collapsed && (
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {user.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
