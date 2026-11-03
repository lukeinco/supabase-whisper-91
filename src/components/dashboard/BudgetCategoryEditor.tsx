import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BudgetCat } from "@/lib/budget";

export function BudgetCategoryEditor({ category, onRename, onDelete, onOver, onDrop }: {
  category: BudgetCat;
  onRename: (name: string) => void;
  onDelete: () => void;
  onOver: (id: string, overId: string) => void;
  onDrop: () => void;
}) {
  const [name, setName] = useState(category.name);
  const dragging = useRef(false);
  const moved = useRef(false);
  useEffect(() => setName(category.name), [category.name]);
  const pending = category.id.startsWith("tmp-");
  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== category.name) onRename(trimmed);
    else setName(category.name);
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <Button
        variant="ghost" size="icon" disabled={pending}
        aria-label={`reorder ${category.name}`} title="Drag to reorder"
        className="size-11 shrink-0 touch-none text-muted hover:bg-muted/10 hover:text-foreground"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          moved.current = false;
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (!dragging.current) return;
          e.preventDefault();
          const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-budget-category-id]");
          const overId = row?.dataset["budgetCategoryId"];
          if (overId && overId !== category.id) {
            moved.current = true;
            onOver(category.id, overId);
          }
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          dragging.current = false;
          if (moved.current) onDrop();
        }}
        onPointerCancel={() => {
          dragging.current = false;
          if (moved.current) onDrop();
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const row = e.currentTarget.closest("li");
          const next = e.key === "ArrowUp" ? row?.previousElementSibling : row?.nextElementSibling;
          const id = next instanceof HTMLElement ? next.dataset["budgetCategoryId"] : null;
          if (id) { onOver(category.id, id); onDrop(); }
        }}
      ><Menu className="size-5" /></Button>
      <textarea
        aria-label={`category name ${category.name}`}
        rows={2} value={name} disabled={pending}
        onChange={(e) => setName(e.target.value)} onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitName(); }
          if (e.key === "Escape") setName(category.name);
        }}
        className="min-w-0 flex-1 resize-none border-0 border-b border-muted bg-transparent py-1 font-sans text-[15px] text-foreground outline-none"
      />
      <Button variant="ghost" size="icon" disabled={pending} onClick={onDelete}
        aria-label={`delete ${category.name}`} title="Delete category"
        className="size-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:size-6"
      ><X /></Button>
    </div>
  );
}