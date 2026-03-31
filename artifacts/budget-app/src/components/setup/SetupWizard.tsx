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
  Loader2,
  ChevronRight,
  RefreshCw,
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

type Step = {
  id: string;
  label: string;
  icon: React.ElementType;
  optional?: boolean;
};

const steps: Step[] = [
  { id: "account", label: "Admin Account", icon: UserRound },
  { id: "income", label: "Income", icon: TrendingUp },
  { id: "savings", label: "Savings Goal", icon: PiggyBank, optional: true },
  { id: "recurring", label: "Recurring Bills", icon: RefreshCw, optional: true },
  { id: "ai", label: "AI Provider", icon: Bot, optional: true },
  { id: "email", label: "Email / SMTP", icon: Mail, optional: true },
  { id: "done", label: "All Done", icon: CheckCircle2 },
];

const PAY_FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "SEMIMONTHLY", label: "Twice a month" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
];
const EXPENSE_FREQUENCIES = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
];

export default function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [accountData, setAccountData] = useState({
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
    budgetName: "",
    currency: "USD",
  });
  const [incomeData, setIncomeData] = useState({
    name: "Primary Income",
    amount: "",
    frequency: "BIWEEKLY",
    nextPayDate: "",
  });
  const [savingsData, setSavingsData] = useState({ name: "", targetAmount: "" });
  const [recurringData, setRecurringData] = useState({
    name: "",
    amount: "",
    frequency: "MONTHLY",
  });
  const [aiData, setAiData] = useState({
    provider: "OPENAI",
    model: "gpt-4o-mini",
    apiKey: "",
    baseUrl: "",
  });
  const [emailData, setEmailData] = useState({
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    fromAddress: "",
    fromName: "Budget App",
  });

  const step = steps[currentStep];

  async function handleNext() {
    setLoading(true);
    try {
      if (step.id === "account") {
        if (!accountData.email || !accountData.name) {
          toast.error("Name and email are required");
          return;
        }
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
            budgetName: accountData.budgetName || undefined,
            currency: accountData.currency,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
      }

      if (step.id === "income") {
        if (!incomeData.name || !incomeData.amount) {
          toast.error("Income source name and amount are required");
          return;
        }
        const res = await fetch("/api/setup/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(incomeData),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
      }

      if (step.id === "savings" && savingsData.name && savingsData.targetAmount) {
        const res = await fetch("/api/setup/savings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: savingsData.name,
            targetAmount: parseFloat(savingsData.targetAmount),
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
      }

      if (step.id === "recurring" && recurringData.name && recurringData.amount) {
        const res = await fetch("/api/setup/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: recurringData.name,
            amount: parseFloat(recurringData.amount),
            frequency: recurringData.frequency,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
      }

      if (step.id === "ai" && aiData.apiKey) {
        const res = await fetch("/api/setup/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(aiData),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
      }

      if (step.id === "email" && emailData.smtpHost) {
        const res = await fetch("/api/setup/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            smtpHost: emailData.smtpHost,
            smtpPort: parseInt(emailData.smtpPort),
            smtpUser: emailData.smtpUser,
            smtpPass: emailData.smtpPass,
            fromAddress: emailData.fromAddress,
            fromName: emailData.fromName,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
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
        <div className="flex items-center justify-center mx-auto">
          <img src="/logo.png" alt="Budget Logo" className="w-24 h-24" />
        </div>
        <h1 className="text-2xl font-bold">Welcome to Budget</h1>
        <p className="text-muted-foreground text-sm">
          Let&apos;s set up your self-hosted budget tracker in a few steps.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2 py-2">
        <p className="text-xs text-muted-foreground font-medium tabular-nums">
          Step {currentStep + 1} of {steps.length}
        </p>
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -6 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex flex-col items-center gap-2"
          >
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
              <step.icon className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-foreground">{step.label}</p>
          </motion.div>
        </AnimatePresence>
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
                    <CardDescription>
                      Optional — you can set this up later in Settings
                    </CardDescription>
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
                      onChange={(e) =>
                        setAccountData((d) => ({ ...d, name: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setAccountData((d) => ({ ...d, email: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setAccountData((d) => ({ ...d, password: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setAccountData((d) => ({
                          ...d,
                          confirmPassword: e.target.value,
                        }))
                      }
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="border-t border-border pt-4 mt-2 space-y-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Budget (optional)
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="budgetName">Budget name</Label>
                      <Input
                        id="budgetName"
                        value={accountData.budgetName}
                        onChange={(e) =>
                          setAccountData((d) => ({
                            ...d,
                            budgetName: e.target.value,
                          }))
                        }
                        placeholder="My Budget"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select
                        value={accountData.currency}
                        onValueChange={(v) =>
                          setAccountData((d) => ({ ...d, currency: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "USD",
                            "EUR",
                            "GBP",
                            "CAD",
                            "AUD",
                            "JPY",
                            "CHF",
                            "SEK",
                            "NOK",
                            "DKK",
                          ].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                      onChange={(e) =>
                        setIncomeData((d) => ({ ...d, name: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setIncomeData((d) => ({ ...d, amount: e.target.value }))
                      }
                      placeholder="3000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pay frequency</Label>
                    <Select
                      value={incomeData.frequency}
                      onValueChange={(v) =>
                        setIncomeData((d) => ({ ...d, frequency: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAY_FREQUENCIES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
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
                      onChange={(e) =>
                        setIncomeData((d) => ({
                          ...d,
                          nextPayDate: e.target.value,
                        }))
                      }
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
                      onChange={(e) =>
                        setSavingsData((d) => ({ ...d, name: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setSavingsData((d) => ({
                          ...d,
                          targetAmount: e.target.value,
                        }))
                      }
                      placeholder="10000"
                    />
                  </div>
                </>
              )}

              {step.id === "recurring" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Add a recurring bill (rent, subscriptions, etc.). You can add
                    more in Settings.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="recurringName">Bill name</Label>
                    <Input
                      id="recurringName"
                      value={recurringData.name}
                      onChange={(e) =>
                        setRecurringData((d) => ({
                          ...d,
                          name: e.target.value,
                        }))
                      }
                      placeholder="Rent / Mortgage"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recurringAmount">Amount</Label>
                    <Input
                      id="recurringAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={recurringData.amount}
                      onChange={(e) =>
                        setRecurringData((d) => ({
                          ...d,
                          amount: e.target.value,
                        }))
                      }
                      placeholder="1500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select
                      value={recurringData.frequency}
                      onValueChange={(v) =>
                        setRecurringData((d) => ({ ...d, frequency: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_FREQUENCIES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {step.id === "ai" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Configure an AI provider for receipt parsing and smart
                    categorization. You can set this up later in Settings &rsaquo; AI
                    Provider.
                  </p>
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={aiData.provider}
                      onValueChange={(v) =>
                        setAiData((d) => ({ ...d, provider: v }))
                      }
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
                    <Label htmlFor="aiModel">Model</Label>
                    <Input
                      id="aiModel"
                      value={aiData.model}
                      onChange={(e) =>
                        setAiData((d) => ({ ...d, model: e.target.value }))
                      }
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aiKey">API key</Label>
                    <Input
                      id="aiKey"
                      type="password"
                      value={aiData.apiKey}
                      onChange={(e) =>
                        setAiData((d) => ({ ...d, apiKey: e.target.value }))
                      }
                      placeholder="sk-..."
                      autoComplete="off"
                    />
                  </div>
                  {(aiData.provider === "OLLAMA" ||
                    aiData.provider === "CUSTOM") && (
                    <div className="space-y-2">
                      <Label htmlFor="aiBaseUrl">Base URL</Label>
                      <Input
                        id="aiBaseUrl"
                        value={aiData.baseUrl}
                        onChange={(e) =>
                          setAiData((d) => ({ ...d, baseUrl: e.target.value }))
                        }
                        placeholder="http://localhost:11434"
                      />
                    </div>
                  )}
                </>
              )}

              {step.id === "email" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Configure SMTP for email notifications and receipt forwarding.
                    You can set this up later in Settings &rsaquo; Email.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label htmlFor="smtpHost">SMTP host</Label>
                      <Input
                        id="smtpHost"
                        value={emailData.smtpHost}
                        onChange={(e) =>
                          setEmailData((d) => ({
                            ...d,
                            smtpHost: e.target.value,
                          }))
                        }
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label htmlFor="smtpPort">Port</Label>
                      <Input
                        id="smtpPort"
                        type="number"
                        value={emailData.smtpPort}
                        onChange={(e) =>
                          setEmailData((d) => ({
                            ...d,
                            smtpPort: e.target.value,
                          }))
                        }
                        placeholder="587"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpUser">SMTP username</Label>
                    <Input
                      id="smtpUser"
                      value={emailData.smtpUser}
                      onChange={(e) =>
                        setEmailData((d) => ({
                          ...d,
                          smtpUser: e.target.value,
                        }))
                      }
                      placeholder="user@example.com"
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPass">SMTP password</Label>
                    <Input
                      id="smtpPass"
                      type="password"
                      value={emailData.smtpPass}
                      onChange={(e) =>
                        setEmailData((d) => ({
                          ...d,
                          smtpPass: e.target.value,
                        }))
                      }
                      placeholder="App password or SMTP password"
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromAddress">From address</Label>
                    <Input
                      id="fromAddress"
                      type="email"
                      value={emailData.fromAddress}
                      onChange={(e) =>
                        setEmailData((d) => ({
                          ...d,
                          fromAddress: e.target.value,
                        }))
                      }
                      placeholder="budget@example.com"
                    />
                  </div>
                </>
              )}

              {step.id === "done" && (
                <div className="text-center py-4 space-y-3">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">You&apos;re all set!</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      Your Budget instance is configured and ready to use. Click
                      below to go to the login page.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between items-center">
        {step.optional ? (
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={loading}
            className="text-muted-foreground"
          >
            Skip for now
          </Button>
        ) : (
          <div />
        )}
        <Button onClick={handleNext} disabled={loading} className="gap-2 min-w-28">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : step.id === "done" ? (
            "Go to Login"
          ) : (
            <>
              Continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
