"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const CURRENCIES = [
  { code: "USD", label: "US Dollar (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "CAD", label: "Canadian Dollar (CAD)" },
  { code: "AUD", label: "Australian Dollar (AUD)" },
  { code: "JPY", label: "Japanese Yen (JPY)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "NZD", label: "New Zealand Dollar (NZD)" },
  { code: "SEK", label: "Swedish Krona (SEK)" },
  { code: "NOK", label: "Norwegian Krone (NOK)" },
];

export default function NewBudgetForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    currency: "USD",
    budgetType: "SOLO",
    description: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Budget name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          currency: form.currency,
          budgetType: form.budgetType,
          description: form.description || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to create budget");
        return;
      }

      const { budget } = await res.json();

      await fetch("/api/budgets/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetId: budget.id }),
      });

      toast.success("Budget created!");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Failed to create budget");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Budget name</Label>
            <Input
              id="name"
              placeholder="e.g. Household Budget, Personal Finance"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budgetType">Budget type</Label>
            <Select value={form.budgetType} onValueChange={(v) => setForm({ ...form, budgetType: v })}>
              <SelectTrigger id="budgetType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SOLO">Solo — just for me</SelectItem>
                <SelectItem value="SHARED">Shared — household or partner budget</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {form.budgetType === "SHARED"
                ? "Shared budgets pool income from multiple members."
                : "Solo budgets are private to you."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="A short description of this budget"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create budget"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
