"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  isDefault: boolean;
  sortOrder: number;
  children?: Category[];
}

const PRESET_COLORS = [
  "#6366f1", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#0ea5e9",
  "#22c55e", "#6b7280",
];

interface CategoryDialogProps {
  open: boolean;
  onClose: () => void;
  budgetId: string;
  existing?: Category | null;
  parents: Category[];
  onSaved: () => void;
}

function CategoryDialog({ open, onClose, budgetId, existing, parents, onSaved }: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [parentId, setParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setColor(existing?.color ?? "#6b7280");
      setParentId(existing?.parentId ?? null);
      setError(null);
    }
  }, [open, existing]);

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), color, parentId: parentId || undefined, budgetId };
      let res;
      if (existing) {
        res = await fetch(`/api/categories/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Category" : "New Category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fishing & Boating" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                  style={{ backgroundColor: c, borderColor: color === c ? "white" : "transparent", outline: color === c ? `2px solid ${c}` : "none" }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Parent Category <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Select value={parentId ?? "none"} onValueChange={(v) => setParentId(v === "none" ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Top-level category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Top-level (no parent)</SelectItem>
                {parents.filter((p) => !p.parentId && p.id !== existing?.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {existing?.children && existing.children.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Note: this category has {existing.children.length} sub-categor{existing.children.length === 1 ? "y" : "ies"} — reparenting it will move it with its children.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (existing ? "Save" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CategoriesClientProps {
  budgetId: string;
  isAdmin: boolean;
}

export function CategoriesClient({ budgetId, isAdmin }: CategoriesClientProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/categories?budgetId=${budgetId}`)
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [budgetId]);

  useEffect(() => { load(); }, [load]);

  const topLevel = categories.filter((c) => !c.parentId);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/categories/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setDeleteError(data.error ?? "Failed to delete"); return; }
      setDeleteTarget(null);
      load();
    } catch {
      setDeleteError("Network error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{topLevel.length} top-level categories</p>
        <Button size="sm" onClick={() => { setEditCat(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Category
        </Button>
      </div>

      <div className="space-y-1">
        {topLevel.map((parent) => {
          const expanded = expandedIds.has(parent.id);
          const children = parent.children ?? [];
          return (
            <div key={parent.id} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-card hover:bg-muted/50 transition-colors">
                {children.length > 0 ? (
                  <button onClick={() => setExpandedIds((prev) => {
                    const next = new Set(prev);
                    next.has(parent.id) ? next.delete(parent.id) : next.add(parent.id);
                    return next;
                  })} className="text-muted-foreground">
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : <div className="w-4" />}

                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: parent.color ?? "#6b7280" }} />
                <span className="flex-1 font-medium text-sm">{parent.name}</span>
                {parent.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                {children.length > 0 && <span className="text-xs text-muted-foreground">{children.length} sub</span>}

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditCat(parent); setDialogOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => { setDeleteTarget(parent); setDeleteError(null); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {expanded && children.map((child) => (
                <div key={child.id} className="flex items-center gap-2 px-3 py-2 pl-9 bg-muted/30 border-t border-border">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: child.color ?? parent.color ?? "#6b7280" }} />
                  <span className="flex-1 text-sm">{child.name}</span>
                  {child.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditCat(child); setDialogOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => { setDeleteTarget(child); setDeleteError(null); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <CategoryDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditCat(null); }}
        budgetId={budgetId}
        existing={editCat}
        parents={topLevel}
        onSaved={load}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This category will be permanently deleted. Expenses using it will become uncategorized.
              {deleteError && <span className="block mt-2 text-destructive">{deleteError}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
