import { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Settings | Budget",
};

const userLinks = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/notifications", label: "Notifications" },
];

const adminLinks = [
  { href: "/settings/users", label: "Users" },
  { href: "/settings/ai", label: "AI Provider" },
  { href: "/settings/email", label: "Email / SMTP" },
];

const budgetLinks = [
  { href: "/settings/budget", label: "Budget" },
  { href: "/settings/budget/members", label: "Members" },
  { href: "/settings/budget/categories", label: "Categories" },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your account, budget, and instance preferences.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-52 flex-shrink-0 space-y-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Account
            </p>
            <div className="space-y-0.5">
              {userLinks.map((link) => (
                <SettingsNavLink key={link.href} href={link.href}>
                  {link.label}
                </SettingsNavLink>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Budget
            </p>
            <div className="space-y-0.5">
              {budgetLinks.map((link) => (
                <SettingsNavLink key={link.href} href={link.href}>
                  {link.label}
                </SettingsNavLink>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Instance
              </p>
              <div className="space-y-0.5">
                {adminLinks.map((link) => (
                  <SettingsNavLink key={link.href} href={link.href}>
                    {link.label}
                  </SettingsNavLink>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function SettingsNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block px-3 py-2 text-sm rounded-lg transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      )}
    >
      {children}
    </Link>
  );
}
