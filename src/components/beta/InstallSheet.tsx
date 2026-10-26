"use client";

import { useHomeScreen } from "@/lib/telegram-actions";
import { haptic } from "@/components/dashboard/TimelineCreator";

// Открывается кнопкой «Установить на телефон» из бота (адрес с ?install=1):
// одно касание — и Telegram предлагает добавить иконку на главный экран.
export default function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <InstallSheetBody onClose={onClose} />;
}

function InstallSheetBody({ onClose }: { onClose: () => void }) {
  const { status, add, canAdd } = useHomeScreen();

  const title =
    status === "added"
      ? "PragmaBox на главном экране"
      : status === "unsupported"
        ? "Иконку пока не добавить"
        : "Установите PragmaBox на телефон";
  const text =
    status === "added"
      ? "Готово! Теперь PragmaBox запускается одним касанием прямо с главного экрана."
      : status === "unsupported"
        ? "Эта версия Telegram не умеет добавлять иконку на главный экран. Обновите Telegram на телефоне и нажмите «Установить на телефон» в боте ещё раз."
        : "Иконка появится на главном экране — запускайте PragmaBox одним касанием, как обычное приложение. Без магазина приложений и лишней памяти.";

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-[#0F1C33]/55 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-surface relative w-full max-w-md rounded-t-[30px] bg-white px-5 pb-[max(var(--safe-bottom),24px)] pt-6 text-center shadow-2xl animate-sheet-up"
      >
        <span className="hero-blue relative mx-auto grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-[22px] text-[30px] font-bold text-white shadow-lg shadow-[#4A5BF0]/30">
          <span className="hero-pattern pointer-events-none absolute inset-0 opacity-60" />
          <span className="relative">{status === "added" ? "✓" : "P"}</span>
        </span>
        <h2 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-[#0F1C33]">{title}</h2>
        <p className="mx-auto mt-2 max-w-[320px] text-[14px] leading-relaxed text-[#5C6B86]">
          {status === null ? "Проверяем, что умеет ваш Telegram…" : text}
        </p>

        {canAdd ? (
          <>
            <button
              type="button"
              onClick={() => {
                haptic("success");
                add();
              }}
              className="mt-5 w-full rounded-2xl bg-[#4A5BF0] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#4A5BF0]/30 transition active:scale-[0.98]"
            >
              Добавить на главный экран
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-2xl py-3 text-[14px] font-semibold text-[#5C6B86]"
            >
              Позже
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onClose}
            disabled={status === null}
            className="mt-5 w-full rounded-2xl bg-[#F1F3F9] py-3.5 text-[15px] font-bold text-[#0F1C33] transition active:scale-[0.98] disabled:opacity-60"
          >
            {status === "added" ? "Открыть PragmaBox" : "Понятно"}
          </button>
        )}
      </section>
    </div>
  );
}
