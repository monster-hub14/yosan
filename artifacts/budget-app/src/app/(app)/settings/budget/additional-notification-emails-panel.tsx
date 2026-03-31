"use client";

import { useState } from "react";
import { X, Plus, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
  budgetId: string;
  initialEmails: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdditionalNotificationEmailsPanel({ budgetId, initialEmails }: Props) {
  const [emails, setEmails] = useState<string[]>(initialEmails);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function persist(updated: string[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/budgets/${budgetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalNotificationEmails: updated }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save. Please try again.");
        return false;
      }
      return true;
    } catch {
      toast.error("Network error. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function validate(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return "Email is required.";
    if (!EMAIL_REGEX.test(trimmed)) return "Enter a valid email address.";
    if (emails.includes(trimmed)) return "This email is already in the list.";
    return null;
  }

  async function handleAdd() {
    const trimmed = input.trim().toLowerCase();
    const err = validate(trimmed);
    if (err) {
      setInputError(err);
      return;
    }
    setInputError(null);
    const updated = [...emails, trimmed];
    const ok = await persist(updated);
    if (ok) {
      setEmails(updated);
      setInput("");
      toast.success("Email added.");
    }
  }

  async function handleRemove(email: string) {
    const updated = emails.filter((e) => e !== email);
    const ok = await persist(updated);
    if (ok) {
      setEmails(updated);
      toast.success("Email removed.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Additional Notification Emails</CardTitle>
            <CardDescription>
              These addresses receive all budget notifications. No account required.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing email chips */}
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {emails.map((email) => (
              <Badge
                key={email}
                variant="secondary"
                className="flex items-center gap-1.5 pr-1 text-sm font-normal"
              >
                {email}
                <button
                  type="button"
                  onClick={() => handleRemove(email)}
                  disabled={saving}
                  className="rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed"
                  aria-label={`Remove ${email}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {emails.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No additional recipients yet. Add email addresses below.
          </p>
        )}

        {/* Add new email */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="someone@example.com"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (inputError) setInputError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={saving}
              className="flex-1"
              aria-label="New notification email"
            />
            <Button
              type="button"
              onClick={handleAdd}
              disabled={saving || !input.trim()}
              size="default"
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
          {inputError && (
            <p className="text-xs text-destructive">{inputError}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
