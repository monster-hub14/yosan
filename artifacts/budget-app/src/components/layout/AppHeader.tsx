"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type SessionPayload } from "@/lib/auth/types";
import { Badge } from "@/components/ui/badge";

interface AppHeaderProps {
  user: SessionPayload;
}

export default function AppHeader({ user }: AppHeaderProps) {
  const { theme, setTheme } = useTheme();

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
    </header>
  );
}
