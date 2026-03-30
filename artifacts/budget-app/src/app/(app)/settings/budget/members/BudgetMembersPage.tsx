"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, UserPlus, Trash2, Shield, Eye, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface User {
  id: string;
  name: string;
  email: string;
}

interface Share {
  id: string;
  role: string;
  user: User;
}

interface SoloShare {
  id: string;
  userId: string;
  role: string;
  user: User;
}

interface Budget {
  id: string;
  name: string;
  budgetType: string;
  ownerId: string;
}

interface Props {
  budget: Budget;
  shares: Share[];
  soloShares: SoloShare[];
  availableUsers: User[];
}

const SHARED_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MEMBER: "Member",
};

const SHARED_ROLE_ICONS: Record<string, typeof Eye> = {
  ADMIN: Shield,
  MEMBER: Users,
};

const SOLO_ROLE_LABELS: Record<string, string> = {
  VIEWER: "Viewer",
  HELPER: "Helper",
  CO_OWNER: "Co-owner",
};

const SOLO_ROLE_ICONS: Record<string, typeof Eye> = {
  VIEWER: Eye,
  HELPER: Users,
  CO_OWNER: Shield,
};

export default function BudgetMembersPage({ budget, shares: initialShares, soloShares: initialSolo, availableUsers }: Props) {
  const router = useRouter();
  const [shares, setShares] = useState(initialShares);
  const [soloShares, setSoloShares] = useState(initialSolo);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState(budget.budgetType === "SHARED" ? "MEMBER" : "VIEWER");
  const [useEmail, setUseEmail] = useState(false);
  const [adding, setSaving] = useState(false);

  const isShared = budget.budgetType === "SHARED";

  const existingMemberIds = new Set([
    ...shares.map((s) => s.user.id),
    ...soloShares.map((s) => s.userId),
  ]);
  const addableUsers = availableUsers.filter((u) => !existingMemberIds.has(u.id));

  function openAddDialog() {
    setInviteEmail("");
    setSelectedUserId("");
    setSelectedRole(isShared ? "MEMBER" : "VIEWER");
    setUseEmail(addableUsers.length === 0);
    setShowAddDialog(true);
  }

  async function handleAddMember() {
    const payload: Record<string, string> = { role: selectedRole };

    if (useEmail) {
      if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
        toast.error("Please enter a valid email address");
        return;
      }
      payload.email = inviteEmail.trim().toLowerCase();
    } else {
      if (!selectedUserId) {
        toast.error("Please select a user");
        return;
      }
      payload.userId = selectedUserId;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/budgets/${budget.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to add member");
        return;
      }

      toast.success("Member added");
      setShowAddDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to add member");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(share: Share) {
    if (!confirm("Remove this member?")) return;
    try {
      await fetch(`/api/budgets/${budget.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: share.user.id }),
      });
      toast.success("Member removed");
      setShares((prev) => prev.filter((s) => s.id !== share.id));
      router.refresh();
    } catch {
      toast.error("Failed to remove");
    }
  }

  async function handleRemoveSoloShare(shareId: string) {
    if (!confirm("Remove this user's access?")) return;
    try {
      await fetch(`/api/budgets/${budget.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      toast.success("Access removed");
      setSoloShares((prev) => prev.filter((s) => s.id !== shareId));
      router.refresh();
    } catch {
      toast.error("Failed to remove");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budget Members</h1>
          <p className="text-muted-foreground text-sm">
            Manage who can access <strong>{budget.name}</strong>
          </p>
        </div>
        <Button size="sm" onClick={openAddDialog}>
          <UserPlus className="w-3.5 h-3.5 mr-1" />
          Add member
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isShared ? "Shared Budget Members" : "Solo Budget Access"}
          </CardTitle>
          <CardDescription>
            {isShared
              ? "Members of this shared budget. Admins have full access; members can view and edit budget data."
              : "Users with access to this solo budget. Co-owners have full access, helpers can add data, viewers can only read."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isShared ? (
            shares.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No members yet. Add a member to share this budget.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {shares.map((share) => {
                  const Icon = SHARED_ROLE_ICONS[share.role] ?? Users;
                  return (
                    <div key={share.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-semibold text-primary">
                            {share.user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{share.user.name}</p>
                          <p className="text-xs text-muted-foreground">{share.user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Icon className="w-3 h-3" />
                          {SHARED_ROLE_LABELS[share.role] ?? share.role}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveMember(share)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            soloShares.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No shared access yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {soloShares.map((share) => {
                  const Icon = SOLO_ROLE_ICONS[share.role] ?? Eye;
                  return (
                    <div key={share.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-semibold text-primary">
                            {share.user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{share.user.name}</p>
                          <p className="text-xs text-muted-foreground">{share.user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Icon className="w-3 h-3" />
                          {SOLO_ROLE_LABELS[share.role] ?? share.role}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveSoloShare(share.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={!useEmail ? "default" : "outline"}
                className="flex-1"
                onClick={() => setUseEmail(false)}
                disabled={addableUsers.length === 0}
              >
                Select user
              </Button>
              <Button
                type="button"
                size="sm"
                variant={useEmail ? "default" : "outline"}
                className="flex-1"
                onClick={() => setUseEmail(true)}
              >
                <Mail className="w-3.5 h-3.5 mr-1" />
                By email
              </Button>
            </div>

            {useEmail ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email address</label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The user must already have an account.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">User</label>
                {addableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    All users already have access. Use the email option to add by address.
                  </p>
                ) : (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isShared ? (
                    <>
                      <SelectItem value="MEMBER">Member — can view &amp; edit data</SelectItem>
                      <SelectItem value="ADMIN">Admin — full access</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="VIEWER">Viewer — read-only access</SelectItem>
                      <SelectItem value="HELPER">Helper — can add expenses</SelectItem>
                      <SelectItem value="CO_OWNER">Co-owner — full access</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAddMember}
              disabled={adding || (useEmail ? !inviteEmail.trim() : !selectedUserId)}
            >
              {adding ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
