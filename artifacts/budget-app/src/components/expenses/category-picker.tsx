"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface CategoryNode {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  children?: CategoryNode[];
}

interface CategoryPickerProps {
  categories: CategoryNode[];
  value: string | null;
  onChange: (id: string | null, name: string, color: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  disabled = false,
  placeholder = "Select category…",
  className,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const selectedNode = findNode(categories, value);
  const selectedName = selectedNode?.name ?? "";
  const selectedColor = selectedNode?.color ?? null;

  const isLeaf = (cat: CategoryNode) => !cat.children || cat.children.length === 0;

  const handleSelect = (cat: CategoryNode) => {
    if (!isLeaf(cat)) {
      setExpandedParents((p) => {
        const next = new Set(p);
        next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
        return next;
      });
      return;
    }
    onChange(cat.id, cat.name, cat.color ?? null);
    setOpen(false);
    setSearch("");
  };

  const filterCategories = useCallback((cats: CategoryNode[], q: string): CategoryNode[] => {
    if (!q) return cats;
    const lower = q.toLowerCase();
    return cats.flatMap((c) => {
      const matches = c.name.toLowerCase().includes(lower);
      const matchingChildren = (c.children ?? []).filter((ch) => ch.name.toLowerCase().includes(lower));
      if (matches || matchingChildren.length > 0) {
        return [{ ...c, children: matches ? (c.children ?? []) : matchingChildren }];
      }
      return [];
    });
  }, []);

  const filtered = filterCategories(categories, search);

  return (
    <Popover open={open && !disabled} onOpenChange={(v) => { if (!disabled) setOpen(v); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between font-normal ${className ?? ""}`}
          disabled={disabled}
        >
          {value ? (
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedColor ?? "#6b7280" }} />
              {selectedName}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="h-56 overflow-y-auto overscroll-contain">
          <div className="space-y-0.5">
            {filtered.map((parent) => {
              const hasChildren = (parent.children?.length ?? 0) > 0;
              const isExpanded = expandedParents.has(parent.id) || !!search;
              return (
                <div key={parent.id}>
                  <div className="flex items-center gap-1">
                    {hasChildren && !search ? (
                      <button
                        className="p-0.5 rounded hover:bg-muted"
                        onClick={() =>
                          setExpandedParents((p) => {
                            const next = new Set(p);
                            next.has(parent.id) ? next.delete(parent.id) : next.add(parent.id);
                            return next;
                          })
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : (
                      <div className="w-5" />
                    )}
                    <button
                      className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left ${
                        hasChildren
                          ? "text-muted-foreground cursor-default hover:bg-muted/50"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => handleSelect(parent)}
                      title={hasChildren ? "Select a sub-category" : undefined}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: parent.color ?? "#6b7280" }}
                      />
                      <span
                        className={
                          hasChildren
                            ? "font-semibold text-xs uppercase tracking-wide"
                            : "font-medium"
                        }
                      >
                        {parent.name}
                      </span>
                      {!hasChildren && value === parent.id && (
                        <Check className="h-3.5 w-3.5 ml-auto text-primary" />
                      )}
                      {hasChildren && (
                        <ChevronRight className="h-3 w-3 ml-auto opacity-40" />
                      )}
                    </button>
                  </div>
                  {isExpanded &&
                    (parent.children ?? []).map((child) => (
                      <button
                        key={child.id}
                        className="w-full flex items-center gap-2 pl-9 pr-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                        onClick={() => handleSelect(child)}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: child.color ?? parent.color ?? "#6b7280" }}
                        />
                        {child.name}
                        {value === child.id && (
                          <Check className="h-3.5 w-3.5 ml-auto text-primary" />
                        )}
                      </button>
                    ))}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-3 text-center">
                No categories found
              </p>
            )}
          </div>
        </div>
        {value && (
          <div className="pt-2 border-t mt-2">
            <button
              className="text-xs text-muted-foreground hover:text-foreground w-full text-left px-1"
              onClick={() => {
                onChange(null, "", null);
                setOpen(false);
              }}
            >
              Clear selection
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function findNode(cats: CategoryNode[], id: string | null): CategoryNode | null {
  if (!id) return null;
  for (const c of cats) {
    if (c.id === id) return c;
    if (c.children) {
      const found = findNode(c.children, id);
      if (found) return found;
    }
  }
  return null;
}
