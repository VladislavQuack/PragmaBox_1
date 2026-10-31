"use client";

import { BETA } from "@/lib/beta";
import { plural } from "@/lib/plural";
import { FREE_CLIENT_LIMIT, daysLeft, fmtUntil, planById, type PremiumInfo } from "@/lib/subscription";
import { haptic } from "@/components/dashboard/TimelineCreator";

// Карточка тарифа в профиле: открывает экран Premium.
// В бете её видит только владелец — чтобы проверить оплату до запуска.
export default function PremiumCard({ premium, onOpen }: { premium: PremiumInfo; onOpen: () => void }) {
  const open = () => {
    haptic("select");
    onOpen();
  };

  if (BETA) {
    if (!premium.isAdmin) return null;
    return (
      <button
        type="button"
        onClick={open}
        className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm transition active:scale-[0.98]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#FFF6E5] text-[18px]">⭐</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#0F1C33]">Premium — проверка оплаты</span>
          <span className="block text-xs text-[#5C6B86]">Видно только вам, пока идёт бета</span>
        </span>
        <span className="text-[13px] font-bold text-[#4A5BF0]">Открыть</span>
      </button>
    );
  }

  const left = premium.until ? daysLeft(premium.until) : 0;
  const month = planById("month");
  const view = premium.lifetime
    ? { badge: "PragmaBox Premium", title: "Навсегда", text: "Клиенты без лимита" }
    : premium.active && premium.until
      ? premium.trial
        ? {
            badge: "Пробный Premium",
            title: `Ещё ${left} ${plural(left, "день", "дня", "дней")}`,
            text: `До ${fmtUntil(premium.until)}. Потом — до ${FREE_CLIENT_LIMIT} клиентов бесплатно или Premium`,
          }
        : { badge: "PragmaBox Premium", title: `До ${fmtUntil(premium.until)}`, text: "Клиенты без лимита. Продлить можно заранее" }
      : premium.available
        ? {
            badge: "PragmaBox Free",
            title: `До ${FREE_CLIENT_LIMIT} клиентов`,
            text: `Premium — клиенты без лимита.${month ? ` Месяц — ${month.stars} ⭐` : ""}`,
          }
        : { badge: "PragmaBox", title: "Клиенты без лимита", text: "Premium вот-вот появится" };

  return (
    <button
      type="button"
      onClick={open}
      className="relative w-full overflow-hidden rounded-[22px] p-4 text-left text-white shadow-lg shadow-[#4A5BF0]/25 transition active:scale-[0.98]"
      style={{ background: "linear-gradient(135deg, #6C82FF 0%, #4A5BF0 55%, #3D4EDB 100%)" }}
    >
      <span className="hero-pattern pointer-events-none absolute inset-0 opacity-50" />
      <span className="relative flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="inline-flex rounded-full bg-white/18 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]">
            {view.badge}
          </span>
          <span className="mt-2 block text-[17px] font-bold">{view.title}</span>
          <span className="mt-1 block text-[12px] leading-relaxed text-white/78">{view.text}</span>
        </span>
        <span className="mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/18 text-lg font-bold">→</span>
      </span>
    </button>
  );
}
