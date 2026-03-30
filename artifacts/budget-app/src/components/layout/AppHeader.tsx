"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Moon, Sun, Bell, ChevronDown, User, LogOut, Settings,
  Check, Wallet, Plus, ChevronRight
} from "lucide-react";
import { type SessionPayload } from "@/lib/auth/types";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  user: SessionPayload;
  activeBudgetId?: string | null;
}

interface BudgetOption {
  id: string;
  name: string;
  currency: string;
  budgetType: string;
  ownerId: string;
}

export default function AppHeader({ user, activeBudgetId }: AppHeaderProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [budgetMenuOpen, setBudgetMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [currentBudget, setCurrentBudget] = useState<BudgetOption | null>(null);
  const [switching, setSwitching] = useState(false);

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

  return (
    <header className="h-14 flex items-center px-4 gap-3 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
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
            <span className="max-w-36 truncate">
              {currentBudget?.name ?? "Select budget"}
            </span>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", budgetMenuOpen && "rotate-180")} />
          </button>

          {budgetMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setBudgetMenuOpen(false)} aria-hidden />
              <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover shadow-lg z-20 py-1">
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
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <button
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
      </button>

      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-muted",
            menuOpen && "bg-muted text-foreground"
          )}
          aria-label="User menu"
          aria-expanded={menuOpen}
        >
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-sm font-medium hidden sm:block max-w-32 truncate">{user.name}</span>
          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform hidden sm:block", menuOpen && "rotate-90")} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg z-20 py-1">
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
