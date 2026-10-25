"use client";

import { useState } from "react";
import { FREE_CLIENT_LIMIT } from "@/lib/subscription";
import { IconCheck, IconClose, IconUsers, IconWallet } from "@/components/ui/icons";
import { haptic } from "@/components/dashboard/TimelineCreator";

interface PremiumOfferProps {
  open: boolean;
  onClose: () => void;
  clientCount: number;
  tier: string;
}

const BENEFITS = [
  "Клиенты без лимита",
  "Расширенная аналитика доходов",
  "Экспорт замеров и истории",
  "Напоминания и новые Premium-функции",
];

// Пока платежи ещё не подключены, но UI готов к Telegram Stars.
export default function PremiumOffer({ open, onClose, clientCount, tier }: PremiumOfferProps) {
  const [requested, setRequested] = useState(false);
  const close = () => {
    setRequested(false);
    onClose();
  };

  if (!open) return null;

  const premium = tier === "premium";

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={close}
        className="absolute inset-0 bg-[#0F1C33]/55 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="PragmaBox Premium"
        className="sheet-surface no-scrollbar relative max-h-[calc(100dvh-var(--app-safe-top)-8px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[30px] bg-white shadow-2xl animate-sheet-up"
      >
        <div className="hero-blue relative overflow-hidden px-5 pb-7 pt-5">
          <div className="hero-pattern pointer-events-none absolute inset-0 opacity-60" />
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/18 text-white transition active:scale-90"
          >
            <IconClose className="h-4 w-4" />
          </button>
          <div className="relative pr-12">
            <span className="inline-flex rounded-full bg-white/18 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
PragmaBox Premium
            </span>
            <h2 className="mt-3 text-[27px] font-bold leading-[1.05] tracking-[-0.04em] text-white">
              Больше клиентов.
              <br />
              Больше контроля.
            </h2>
            <p className="mt-3 max-w-[290px] text-[13px] leading-relaxed text-white/78">
              Для тренеров, которые ведут стабильную базу и хотят держать финансы и прогресс под рукой.
            </p>
          </div>
        </div>

        <div className="px-5 pb-[max(var(--safe-bottom),20px)] pt-5">
          <div className="flex gap-2 rounded-[20px] bg-[#F1F3F9] p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white text-[#4A5BF0] shadow-sm">
              <IconUsers className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-[#5C6B86]">Ваш текущий план</span>
              <span className="block text-[15px] font-bold text-[#0F1C33]">
                {premium ? "Premium" : `Free · ${clientCount} из ${FREE_CLIENT_LIMIT} клиентов`}
              </span>
            </span>
          </div>

          <ul className="mt-4 space-y-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-[14px] font-medium text-[#24324B]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E5F7EC] text-[#1DB871]">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                {benefit}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-end justify-between rounded-[22px] border border-[#E0E5F1] bg-white p-4">
            <span>
              <span className="block text-[12px] font-medium text-[#5C6B86]">Premium-план</span>
              <span className="num mt-1 block text-[25px] leading-none text-[#0F1C33]">
                299 ₽ <span className="text-[13px] font-medium text-[#9AA6BE]">/ месяц</span>
              </span>
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#EEF1FF] text-[#4A5BF0]">
              <IconWallet className="h-5 w-5" />
            </span>
          </div>

          {requested ? (
            <div className="mt-4 rounded-[20px] bg-[#E5F7EC] p-4 text-center">
              <p className="text-[14px] font-bold text-[#0E7A47]">Скоро подключим оплату через Telegram Stars</p>
              <p className="mt-1 text-[12px] text-[#218B58]">Кнопка уже на месте — платежный сценарий добавим следующим шагом.</p>
            </div>
          ) : (
            <button
              type="button"
              disabled={premium}
              onClick={() => {
                haptic("success");
                setRequested(true);
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4A5BF0] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#4A5BF0]/30 transition active:scale-[0.98] disabled:opacity-60"
            >
              {premium ? "Premium уже активен" : "Оформить Premium"}
              {!premium && <span>→</span>}
            </button>
          )}
          <p className="mt-3 text-center text-[10px] leading-relaxed text-[#9AA6BE]">
            В будущем оплата и управление подпиской будут работать через Telegram Stars.
          </p>
        </div>
      </section>
    </div>
  );
}
