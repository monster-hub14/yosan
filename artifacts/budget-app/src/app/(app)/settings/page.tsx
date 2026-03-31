import { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import {
  User,
  Bell,
  Wallet,
  Users,
  Tags,
  Bot,
  Mail,
  UsersRound,
  ChevronRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Settings | Yosan AI",
};

interface SettingItem {
  href: string;
  icon: React.ElementType;
  label: string;
  description: string;
}

const userItems: SettingItem[] = [
  {
    href: "/settings/account",
    icon: User,
    label: "Account",
    description: "Update your profile and change your password",
  },
  {
    href: "/settings/notifications",
    icon: Bell,
    label: "Notifications",
    description: "Configure how and when you receive notifications",
  },
];

const budgetItems: SettingItem[] = [
  {
    href: "/settings/budget",
    icon: Wallet,
    label: "Budget",
    description: "Manage budgets, currency, and sharing settings",
  },
  {
    href: "/settings/budget/members",
    icon: Users,
    label: "Members",
    description: "Invite and manage people with access to your budgets",
  },
  {
    href: "/settings/budget/categories",
    icon: Tags,
    label: "Categories",
    description: "Organise expenses with custom categories and icons",
  },
];

const instanceItems: SettingItem[] = [
  {
    href: "/settings/users",
    icon: UsersRound,
    label: "Users",
    description: "Manage all user accounts on this instance",
  },
  {
    href: "/settings/ai",
    icon: Bot,
    label: "AI Provider",
    description: "Configure the AI model used for receipt parsing and analysis",
  },
  {
    href: "/settings/email",
    icon: Mail,
    label: "Email / SMTP",
    description: "Set up email delivery and receipt forwarding addresses",
  },
];

function SettingCard({ item }: { item: SettingItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors group"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{item.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {item.description}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
    </Link>
  );
}

function Section({ title, items }: { title: string; items: SettingItem[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h2>
      <div className="space-y-1.5">
        {items.map((item) => (
          <SettingCard key={item.href} item={item} />
        ))}
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin
            ? "Manage your account, budgets, and instance configuration."
            : "Manage your account preferences."}
        </p>
      </div>

      <Section title="User" items={userItems} />

      {isAdmin && <Section title="Budget" items={budgetItems} />}

      {isAdmin && <Section title="Instance" items={instanceItems} />}
    </div>
  );
}
