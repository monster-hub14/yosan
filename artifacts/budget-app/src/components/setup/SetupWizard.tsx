"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Wallet,
  UserRound,
  TrendingUp,
  PiggyBank,
  Bot,
  Mail,
  ArrowRight,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  label: string;
  icon: React.ElementType;
  optional?: boolean;
};

const steps: Step[] = [
  { id: "account", label: "Admin Account", icon: UserRound },
  { id: "budget", label: "First Budget", icon: Wallet },
  { id: "income", label: "Income", icon: TrendingUp, optional: true },
  { id: "savings", label: "Savings Goal", icon: PiggyBank, optional: true },
  { id: "ai", label: "AI Provider", icon: Bot, optional: true },
  { id: "done", label: "All Done", icon: CheckCircle2 },
];

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "DKK"];
const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "SEMIMONTHLY", label: "Twice a month" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
];

export default function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [accountData, setAccountData] = useState({ email: "", name: "", password: "", confirmPassword: "" });
  const [budgetData, setBudgetData] = useState({ name: "My Budget", currency: "USD" });
  const [incomeData, setIncomeData] = useState({ name: "Primary Income", amount: "", frequency: "BIWEEKLY", nextPayDate: "" });
  const [savingsData, setSavingsData] = useState({ name: "", targetAmount: "" });
  const [aiData, setAiData] = useState({ provider: "OPENAI", model: "gpt-4o-mini", apiKey: "", baseUrl: "" });

  const step = steps[currentStep];

  async function handleNext() {
    setLoading(true);
    try {
      if (step.id === "account") {
        if (accountData.password !== accountData.confirmPassword) {
          toast.error("Passwords don't match");
          return;
        }
        if (accountData.password.length < 8) {
          toast.error("Password must be at least 8 characters");
          return;
        }
        const res = await fetch("/api/setup/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: accountData.email,
            name: accountData.name,
            password: accountData.password,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
      }

      if (step.id === "budget") {
        const res = await fetch("/api/setup/budget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(budgetData),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
      }

      if (step.id === "income" && incomeData.amount) {
        const res = await fetch("/api/setup/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(incomeData),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
      }

      if (step.id === "savings" && savingsData.name && savingsData.targetAmount) {
        const budget = await fetch("/api/setup/status").then((r) => r.json());
        if (budget.progress?.firstBudgetCreated) {
          await fetch("/api/savings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: savingsData.name, targetAmount: parseFloat(savingsData.targetAmount) }),
          });
        }
      }

      if (step.id === "ai" && aiData.apiKey) {
        await fetch("/api/settings/ai", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...aiData, isEnabled: true }),
        });
      }

      if (step.id === "done") {
        const res = await fetch("/api/setup/complete", { method: "POST" });
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error);
          return;
        }
        router.push("/login");
        return;
      }

      setCurrentStep((s) => s + 1);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    setCurrentStep((s) => s + 1);
  }

  const progress = (currentStep / (steps.length - 1)) * 100;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mx-auto">
          <Wallet className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold">Welcome to Budget</h1>
        <p className="text-muted-foreground text-sm">
          Let&apos;s set up your self-hosted budget tracker in a few steps.
        </p>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={s.id} className="flex items-center gap-1 min-w-0">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full border-2 transition-colors flex-shrink-0",
                  done
                    ? "bg-primary border-primary text-primary-foreground"
                    : active
                    ? "border-primary text-primary bg-primary/10"
                    : "border-muted-foreground/30 text-muted-foreground/30"
                )}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden sm:block",
                  active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground/40"
                )}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <ChevronRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0 mx-0.5" />
              )}
            </div>
          );
        })}
      </div>

      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="border-border shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <step.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>{step.label}</CardTitle>
                  {step.optional && (
                    <CardDescription>Optional — you can set this up later</CardDescription>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {step.id === "account" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="adminName">Full name</Label>
                    <Input
                      id="adminName"
                      value={accountData.name}
                      onChange={(e) => setAccountData((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Jane Smith"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminEmail">Email address</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      value={accountData.email}
                      onChange={(e) => setAccountData((d) => ({ ...d, email: e.target.value }))}
                      placeholder="admin@example.com"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminPassword">Password</Label>
                    <Input
                      id="adminPassword"
                      type="password"
                      value={accountData.password}
                      onChange={(e) => setAccountData((d) => ({ ...d, password: e.target.value }))}
                      placeholder="Minimum 8 characters"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminConfirm">Confirm password</Label>
                    <Input
                      id="adminConfirm"
                      type="password"
                      value={accountData.confirmPassword}
                      onChange={(e) => setAccountData((d) => ({ ...d, confirmPassword: e.target.value }))}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}

              {step.id === "budget" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="budgetName">Budget name</Label>
                    <Input
                      id="budgetName"
                      value={budgetData.name}
                      onChange={(e) => setBudgetData((d) => ({ ...d, name: e.target.value }))}
                      placeholder="My Budget"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select
                      value={budgetData.currency}
                      onValueChange={(v) => setBudgetData((d) => ({ ...d, currency: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {step.id === "income" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="incomeName">Income source name</Label>
                    <Input
                      id="incomeName"
                      value={incomeData.name}
                      onChange={(e) => setIncomeData((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Primary Job"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="incomeAmount">Amount per period</Label>
                    <Input
                      id="incomeAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={incomeData.amount}
                      onChange={(e) => setIncomeData((d) => ({ ...d, amount: e.target.value }))}
                      placeholder="3000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pay frequency</Label>
                    <Select
                      value={incomeData.frequency}
                      onValueChange={(v) => setIncomeData((d) => ({ ...d, frequency: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nextPayDate">Next pay date (optional)</Label>
                    <Input
                      id="nextPayDate"
                      type="date"
                      value={incomeData.nextPayDate}
                      onChange={(e) => setIncomeData((d) => ({ ...d, nextPayDate: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {step.id === "savings" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="savingsName">Goal name</Label>
                    <Input
                      id="savingsName"
                      value={savingsData.name}
                      onChange={(e) => setSavingsData((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Emergency Fund"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="savingsTarget">Target amount</Label>
                    <Input
                      id="savingsTarget"
                      type="number"
                      min="0"
                      value={savingsData.targetAmount}
                      onChange={(e) => setSavingsData((d) => ({ ...d, targetAmount: e.target.value }))}
                      placeholder="10000"
                    />
                  </div>
                </>
              )}

              {step.id === "ai" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Configure an AI provider to enable receipt parsing and smart categorization. You can set this up later in Settings.
                  </p>
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={aiData.provider}
                      onValueChange={(v) => setAiData((d) => ({ ...d, provider: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPENAI">OpenAI</SelectItem>
                        <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                        <SelectItem value="GOOGLE">Google Gemini</SelectItem>
                        <SelectItem value="OLLAMA">Ollama (Local)</SelectItem>
                        <SelectItem value="CUSTOM">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aiKey">API Key</Label>
                    <Input
                      id="aiKey"
                      type="password"
                      value={aiData.apiKey}
                      onChange={(e) => setAiData((d) => ({ ...d, apiKey: e.target.value }))}
                      placeholder="sk-..."
                    />
                  </div>
                </>
              )}

              {step.id === "done" && (
                <div className="text-center py-6 space-y-4">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-primary" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">You&apos;re all set!</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your budget app is ready to use. Sign in with your admin account to get started.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                {step.optional && step.id !== "done" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSkip}
                    disabled={loading}
                    size="sm"
                  >
                    Skip for now
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="ml-auto"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {step.id === "done" ? "Go to login" : "Continue"}
                  {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
