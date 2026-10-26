"use client";

import { useHomeScreen } from "@/lib/telegram-actions";
import { haptic } from "@/components/dashboard/TimelineCreator";

// Карточка «Установить на главный экран». Где Telegram не умеет добавлять иконку
// (компьютер, старые версии) — не показываем вовсе.
export default function InstallCard() {
  const { status, add, canAdd } = useHomeScreen();

  if (status === "added") {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#E5F7EC] text-[18px]">📲</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#0F1C33]">PragmaBox на главном экране</span>
          <span className="block text-xs text-[#5C6B86]">Запускайте одним касанием, как обычное приложение</span>
        </span>
      </div>
    );
  }
  if (!canAdd) return null;

  return (
    <button
      type="button"
      onClick={() => {
        haptic("select");
        add();
      }}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm transition active:scale-[0.98]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#EEF1FF] text-[18px]">📲</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#0F1C33]">Установить на главный экран</span>
        <span className="block text-xs text-[#5C6B86]">Иконка PragmaBox — как у обычного приложения</span>
      </span>
      <span className="text-[13px] font-bold text-[#4A5BF0]">Добавить</span>
    </button>
  );
}
