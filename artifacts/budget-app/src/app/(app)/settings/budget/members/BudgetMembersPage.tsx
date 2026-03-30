"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, UserPlus, Trash2, Shield, Eye, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const ROLE_LABELS: Record<string, string> = {
  VIEWER: "Viewer",
  HELPER: "Helper",
  CO_OWNER: "Co-owner",
};

const ROLE_ICONS: Record<string, typeof Eye> = {
  VIEWER: Eye,
  HELPER: Users,
  CO_OWNER: Shield,
};

export default function BudgetMembersPage({ budget, shares: initialShares, soloShares: initialSolo, availableUsers }: Props) {
  const router = useRouter();
  const [shares, setShares] = useState(initialShares);
  const [soloShares, setSoloShares] = useState(initialSolo);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState(budget.budgetType === "SHARED" ? "MEMBER" : "VIEWER");
  const [adding, setSaving] = useState(false);

  const isShared = budget.budgetType === "SHARED";


  const existingMemberIds = new Set([
    ...shares.map((s) => s.user.id),
    ...soloShares.map((s) => s.userId),
  ]);
  const addableUsers = availableUsers.filter((u) => !existingMemberIds.has(u.id));

  async function handleAddMember() {
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/budgets/${budget.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to add member");
        return;
      }

      toast.success("Member added");
      setShowAddDialog(false);
      setSelectedUserId("");
      setSelectedRole("VIEWER");
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
    if (!confirm("Remove this viewer?")) return;
    try {
      await fetch(`/api/budgets/${budget.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      toast.success("Removed");
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
        {addableUsers.length > 0 && (
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            Add member
          </Button>
        )}
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isShared ? "Shared Budget Members" : "Budget Viewers (Solo)"}
          </CardTitle>
          <CardDescription>
            {isShared
              ? "Members of this shared budget. Co-owners have full access, helpers can add expenses, viewers can only read."
              : "Users who can view this solo budget. Only you (the owner) can edit it."}
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
                  const Icon = ROLE_ICONS[share.role] ?? Eye;
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
                          {ROLE_LABELS[share.role] ?? share.role}
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
                No viewers yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {soloShares.map((share) => (
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
                      <Badge variant="secondary">Viewer</Badge>
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
                ))}
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium">User</label>
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
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isShared ? (
                    <>
                      <SelectItem value="MEMBER">Member — can add expenses</SelectItem>
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
            <Button onClick={handleAddMember} disabled={adding || !selectedUserId}>
              {adding ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
