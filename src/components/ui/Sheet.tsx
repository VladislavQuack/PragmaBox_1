"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconClose } from "@/components/ui/icons";

// Стек открытых шторок: Escape закрывает только верхнюю, а не все сразу
const openStack: string[] = [];

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  full?: boolean;
  bare?: boolean;
}

// Сколько мс после открытия игнорируем клики по подложке.
// Причина: шторка часто открывается по касанию (pointerup), и следом браузер шлёт «призрачный» click,
// который попадает уже в только что появившуюся подложку и тут же закрывает шторку.
const GHOST_CLICK_MS = 350;

// Шторка снизу. full = на весь экран. bare = без стандартной шапки (свой хедер внутри).
export default function Sheet({ open, onClose, title, children, full = false, bare = false }: SheetProps) {
  const openedAt = useRef(0);
  const closeRef = useRef(onClose);
  const id = useId();

  // Всегда держим свежий onClose, но не пересоздаём подписки при каждом рендере родителя
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    openedAt.current = performance.now();
    openStack.push(id);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Встроенный мастер создания ловит Escape сам — шторка под ним остаётся открытой
      if (document.querySelector(".wizard-surface")) return;
      if (openStack[openStack.length - 1] === id) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      const i = openStack.lastIndexOf(id);
      if (i !== -1) openStack.splice(i, 1);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, id]);

  if (!open) return null;

  const onBackdrop = () => {
    if (performance.now() - openedAt.current < GHOST_CLICK_MS) return;
    onClose();
  };

  if (bare) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center">
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onBackdrop}
          className="absolute inset-0 animate-fade-in bg-slate-900/30 backdrop-blur-[2px]"
        />
        <section
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="animate-sheet-up relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#F1F3F9]"
        >
          {children}
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onBackdrop}
        className="absolute inset-0 animate-fade-in bg-slate-900/30 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex w-full max-w-md flex-col overflow-hidden bg-[#F1F3F9] shadow-2xl animate-sheet-up ${
          full ? "h-dvh rounded-none" : "max-h-[88dvh] rounded-t-[28px]"
        }`}
      >
        {!full && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[#D3D9E8]" />}
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-3">
          <h2 className="truncate text-[19px] font-bold tracking-[-0.02em] text-[#0F1C33]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#5C6B86] shadow-sm"
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
