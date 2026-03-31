"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, TrendingDown, Receipt, PiggyBank, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/expenses", icon: TrendingDown, label: "Expenses" },
  { href: "/receipts", icon: Receipt, label: "Receipts" },
  { href: "/savings", icon: PiggyBank, label: "Savings" },
  { href: "/forecast", icon: Sparkles, label: "Forecast" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 flex lg:hidden border-t border-border bg-card/95 backdrop-blur-md safe-area-pb">
      {mobileNavItems.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2.5 px-1 text-xs font-medium transition-colors relative",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            {active && (
              <motion.div
                layoutId="mobile-nav-indicator"
                className="absolute top-0 inset-x-2 h-0.5 bg-primary rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            )}
            <motion.div
              animate={active ? { scale: 1.1 } : { scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Icon className="w-5 h-5" />
            </motion.div>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
