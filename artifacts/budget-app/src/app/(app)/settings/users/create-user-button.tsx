"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function CreateUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [emailError, setEmailError] = useState<string | null>(null);

  function openDialog() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("USER");
    setEmailError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);

    if (!name.trim() || !email.trim() || !password.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setEmailError("An account with this email already exists.");
        } else {
          toast.error(data.error ?? "Failed to create user");
        }
        return;
      }

      const { user } = await res.json();
      toast.success(`Account created for ${user.name}`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = name.trim() && email.trim() && password.trim() && !saving;

  return (
    <>
      <Button size="sm" onClick={openDialog}>
        <UserPlus className="w-3.5 h-3.5 mr-1.5" />
        Create user
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create user account</DialogTitle>
            <DialogDescription>
              Create a new Yosan AI account. The user can log in immediately with the password you set.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="cu-name">Name</Label>
              <Input
                id="cu-name"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cu-email">Email</Label>
              <Input
                id="cu-email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                autoComplete="off"
                required
              />
              {emailError && (
                <p className="text-xs text-destructive">{emailError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cu-password">Password</Label>
              <Input
                id="cu-password"
                type="password"
                placeholder="Set a temporary password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cu-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "USER" | "ADMIN")}>
                <SelectTrigger id="cu-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">User — standard access</SelectItem>
                  <SelectItem value="ADMIN">Admin — full instance access</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
