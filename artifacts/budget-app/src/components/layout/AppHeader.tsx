"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun, Bell, ChevronDown, User, LogOut, Settings } from "lucide-react";
import { type SessionPayload } from "@/lib/auth/types";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  user: SessionPayload;
}

export default function AppHeader({ user }: AppHeaderProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <header className="h-14 flex items-center px-4 gap-3 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
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
        {theme === "dark" ? (
          <Sun className="w-4 h-4" />
        ) : (
          <Moon className="w-4 h-4" />
        )}
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
          <span className="text-sm font-medium hidden sm:block max-w-32 truncate">
            {user.name}
          </span>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform hidden sm:block", menuOpen && "rotate-180")} />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
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
