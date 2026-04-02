"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Moon, Sun, Bell, ChevronDown, User, LogOut, Settings,
  Check, Wallet, Plus, ChevronRight, Menu, BellOff,
} from "lucide-react";
import { type SessionPayload } from "@/lib/auth/types";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface AppHeaderProps {
  user: SessionPayload;
  activeBudgetId?: string | null;
  onMobileMenuToggle?: () => void;
}

interface BudgetOption {
  id: string;
  name: string;
  currency: string;
  budgetType: string;
  ownerId: string;
}

interface InAppNotification {
  id: string;
  event: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  budgetId?: string | null;
}

export default function AppHeader({ user, activeBudgetId, onMobileMenuToggle }: AppHeaderProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [budgetMenuOpen, setBudgetMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [currentBudget, setCurrentBudget] = useState<BudgetOption | null>(null);
  const [switching, setSwitching] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch("/api/budgets")
      .then((r) => r.json())
      .then((data) => {
        const list: BudgetOption[] = data.budgets ?? [];
        setBudgets(list);
        const active = list.find((b) => b.id === activeBudgetId) ?? list[0] ?? null;
        setCurrentBudget(active);
      })
      .catch(() => {});
  }, [activeBudgetId]);

  const fetchNotifications = useCallback(() => {
    fetch("/api/notifications/inbox")
      .then((r) => r.json())
      .then((data) => {
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  async function handleLogout() {
    setLoggingOut(true);
    setMenuOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Failed to sign out");
      setLoggingOut(false);
    }
  }

  async function handleSwitchBudget(budget: BudgetOption) {
    if (budget.id === currentBudget?.id) {
      setBudgetMenuOpen(false);
      return;
    }
    setSwitching(true);
    setBudgetMenuOpen(false);
    try {
      const res = await fetch("/api/budgets/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetId: budget.id }),
      });
      if (res.ok) {
        setCurrentBudget(budget);
        router.refresh();
      } else {
        toast.error("Failed to switch budget");
      }
    } catch {
      toast.error("Failed to switch budget");
    } finally {
      setSwitching(false);
    }
  }

  async function markRead(id: string) {
    // Optimistic local update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    try {
      const res = await fetch("/api/notifications/inbox/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.unreadCount === "number") {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch {
      // keep optimistic update on error
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/inbox/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      } else {
        setUnreadCount(0);
      }
    } catch {
      toast.error("Failed to mark all as read");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <header className="h-14 flex items-center px-4 gap-3 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
      {/* Mobile hamburger */}
      {onMobileMenuToggle && (
        <button
          onClick={onMobileMenuToggle}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {budgets.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setBudgetMenuOpen(!budgetMenuOpen)}
            disabled={switching}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              "border border-border hover:bg-muted",
              budgetMenuOpen && "bg-muted",
              switching && "opacity-50 cursor-not-allowed"
            )}
          >
            <Wallet className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="max-w-28 sm:max-w-36 truncate">
              {currentBudget?.name ?? "Select budget"}
            </span>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", budgetMenuOpen && "rotate-180")} />
          </button>

          {budgetMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setBudgetMenuOpen(false)} aria-hidden />
              <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover shadow-lg z-50 py-1">
                <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Your budgets
                </p>
                {budgets.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleSwitchBudget(b)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Wallet className="w-3 h-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{b.budgetType === "SOLO" ? "Solo" : "Shared"} · {b.currency}</p>
                    </div>
                    {b.id === currentBudget?.id && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                  </button>
                ))}
                {user.role === "ADMIN" && (
                  <>
                    <div className="border-t border-border mt-1 pt-1">
                      <Link
                        href="/budgets/new"
                        onClick={() => setBudgetMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-muted-foreground"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        New budget
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1" />

      {user.role === "ADMIN" && (
        <Badge variant="secondary" className="text-xs hidden sm:flex">
          Admin
        </Badge>
      )}

      <button
        suppressHydrationWarning
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Toggle theme"
      >
        {mounted ? (theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />) : <span className="w-4 h-4 block" />}
      </button>

      {/* Bell / Notifications */}
      <div className="relative" ref={bellRef}>
        <button
          onClick={() => {
            const opening = !bellOpen;
            setBellOpen(opening);
            setMenuOpen(false);
            setBudgetMenuOpen(false);
            if (opening) fetchNotifications();
          }}
          className={cn(
            "relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
            bellOpen && "bg-muted text-foreground"
          )}
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
          )}
        </button>

        {bellOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} aria-hidden />
            <div className="absolute right-0 top-full mt-1 w-80 rounded-lg border border-border bg-popover shadow-xl z-50 flex flex-col max-h-[480px]">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center text-xs font-bold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] px-1">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={markingAll}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    Mark all as read
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="overflow-y-auto flex-1">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                    <BellOff className="w-8 h-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No new notifications</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Alerts will appear here when triggered</p>
                  </div>
                ) : (
                  notifications.map((n, idx) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (!n.isRead) markRead(n.id);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-muted/60",
                        idx < notifications.length - 1 && "border-b border-border/60",
                        !n.isRead && "bg-blue-50/40 dark:bg-blue-950/20"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 w-2 h-2 rounded-full flex-shrink-0",
                        !n.isRead ? "bg-blue-500" : "bg-transparent"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm leading-snug truncate", !n.isRead && "font-medium")}>
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {n.body}
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-border px-4 py-2.5 flex-shrink-0">
                <Link
                  href="/settings/notifications"
                  onClick={() => setBellOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Settings className="w-3 h-3" />
                  Notification preferences
                </Link>
              </div>
            </div>
          </>
        )}
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => {
            setMenuOpen(!menuOpen);
            setBellOpen(false);
          }}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-muted",
            menuOpen && "bg-muted text-foreground"
          )}
          aria-label="User menu"
          aria-expanded={menuOpen}
        >
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-sm font-medium hidden sm:block max-w-32 truncate">{user.name}</span>
          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform hidden sm:block", menuOpen && "rotate-90")} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg z-50 py-1">
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <Link
                href="/settings/account"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <User className="w-4 h-4 text-muted-foreground" />
                Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                Settings
              </Link>
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4" />
                  {loggingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
