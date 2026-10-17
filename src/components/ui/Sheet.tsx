"use client";

import { useEffect, type ReactNode } from "react";
import { IconClose } from "@/components/ui/icons";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  full?: boolean;
}

// Шторка снизу. full = на весь экран (расширенные виджеты).
export default function Sheet({ open, onClose, title, children, full = false }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-slate-900/25 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex w-full max-w-md flex-col overflow-hidden bg-[var(--fill-1)] shadow-2xl animate-sheet-up ${
          full ? "h-dvh rounded-none" : "max-h-[88dvh] rounded-t-[32px]"
        }`}
      >
        {!full && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300" />}
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-3">
          <h2 className="truncate text-[19px] font-bold tracking-[-0.02em] text-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200/80 text-slate-600"
          >
            <IconClose />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),24px)]">
          {children}
        </div>
      </section>
    </div>
  );
}
