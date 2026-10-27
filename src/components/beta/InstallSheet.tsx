"use client";

import type { ReactNode } from "react";
import { useHomeScreen, type PhoneBrand } from "@/lib/telegram-actions";
import { haptic } from "@/components/dashboard/TimelineCreator";

// Открывается кнопкой «Установить на телефон» из бота (адрес с ?install=1) и карточкой
// в профиле. Ведёт до иконки на главном экране: на Android подсказывает, какое разрешение
// включить, если телефон молча отказал, на iPhone — что нажать в Safari.
export default function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <InstallSheetBody onClose={onClose} />;
}

interface Guide {
  lead: string;
  steps: string[];
  note?: string;
}

// Телефон не дал добавить иконку. На Xiaomi, Huawei и некоторых других у Telegram
// по умолчанию выключено разрешение на ярлыки — система отказывает без всякого окна.
const ANDROID_HELP: Record<PhoneBrand, Guide> = {
  xiaomi: {
    lead: "На Xiaomi, Redmi и POCO телефон по умолчанию не разрешает Telegram добавлять иконки. Это включается один раз:",
    steps: [
      "Зажмите иконку Telegram на рабочем столе → «О приложении».",
      "«Разрешения» → «Другие разрешения».",
      "«Ярлыки на рабочем столе» → «Всегда разрешать».",
    ],
    note: "На старых MIUI: Настройки → Приложения → Telegram → «Другие разрешения».",
  },
  huawei: {
    lead: "На Huawei и Honor телефон по умолчанию не разрешает Telegram добавлять иконки. Это включается один раз:",
    steps: [
      "Зажмите иконку Telegram на рабочем столе → «О приложении».",
      "Откройте «Права» или «Разрешения».",
      "Разрешите «Ярлыки на рабочем экране».",
    ],
  },
  samsung: {
    lead: "Телефон должен был спросить, добавить ли иконку на главный экран:",
    steps: [
      "Нажмите «Попробовать ещё раз» ниже.",
      "В окне телефона выберите «Добавить».",
      "Если окна нет — в настройках главного экрана выключите блокировку макета.",
    ],
  },
  other: {
    lead: "Скорее всего, телефон не разрешает Telegram добавлять иконки. Это включается один раз:",
    steps: [
      "Зажмите иконку Telegram на рабочем столе → «О приложении».",
      "Откройте «Разрешения».",
      "Если там есть пункт про ярлыки на рабочем столе — разрешите его.",
    ],
  },
};

// На iPhone Telegram открывает Safari со страницей бота, дальше — руками
const IOS_STEPS = [
  "Нажмите «Поделиться» — квадрат со стрелкой. В новых iOS он в меню «•••».",
  "Выберите «На экран „Домой“» → «Добавить».",
];

const PRIMARY =
  "mt-5 w-full rounded-2xl bg-[#4A5BF0] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#4A5BF0]/30 transition active:scale-[0.98] disabled:bg-[#9AA6F5] disabled:shadow-none";
const SECONDARY = "mt-2 w-full rounded-2xl py-3 text-[14px] font-semibold text-[#5C6B86]";
const NEUTRAL =
  "mt-5 w-full rounded-2xl bg-[#F1F3F9] py-3.5 text-[15px] font-bold text-[#0F1C33] transition active:scale-[0.98]";

function InstallSheetBody({ onClose }: { onClose: () => void }) {
  const { phase, device, brand, reason, addedNow, add } = useHomeScreen();
  const ios = device === "ios";

  const tryAdd = () => {
    haptic("success");
    add();
  };

  let title = "Установите PragmaBox на телефон";
  let text: string | null = null;
  let guide: Guide | null = null;
  let footnote: string | null = null;
  let actions: ReactNode;

  switch (phase) {
    case "checking":
      text = "Проверяем, что умеет ваш Telegram…";
      actions = (
        <>
          <button type="button" disabled className={PRIMARY}>
            Добавить на главный экран
          </button>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Позже
          </button>
        </>
      );
      break;

    case "ready":
      if (ios) {
        title = "Установите PragmaBox на iPhone";
        guide = { lead: "Telegram откроет Safari — там останется два касания:", steps: IOS_STEPS };
      } else {
        text =
          "Иконка появится на главном экране — запускайте PragmaBox одним касанием, как обычное приложение. Без магазина приложений и лишней памяти.";
      }
      actions = (
        <>
          <button type="button" onClick={tryAdd} className={PRIMARY}>
            {ios ? "Продолжить в Safari" : "Добавить на главный экран"}
          </button>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Позже
          </button>
        </>
      );
      break;

    case "waiting":
      if (ios) {
        title = "Осталось добавить в Safari";
        guide = { lead: "В открывшемся Safari:", steps: IOS_STEPS };
        footnote = "Иконка будет открывать PragmaBox в Telegram.";
        actions = (
          <>
            <button type="button" onClick={onClose} className={PRIMARY}>
              Готово
            </button>
            <button type="button" onClick={tryAdd} className={SECONDARY}>
              Открыть Safari ещё раз
            </button>
          </>
        );
      } else {
        title = "Добавляем иконку…";
        text = "Если телефон спросит, добавить ли иконку на главный экран, — нажмите «Добавить».";
        actions = (
          <>
            <button type="button" disabled className={PRIMARY}>
              Ждём ответ телефона…
            </button>
            <button type="button" onClick={onClose} className={SECONDARY}>
              Закрыть
            </button>
          </>
        );
      }
      break;

    case "help":
      title = "Иконка не появилась?";
      if (ios) {
        text = "Telegram не смог открыть Safari. Обновите Telegram и попробуйте ещё раз.";
      } else {
        guide = ANDROID_HELP[brand];
        footnote = "Иконка могла встать не на первый экран — пролистайте рабочие столы.";
      }
      actions = (
        <>
          <button type="button" onClick={tryAdd} className={PRIMARY}>
            Попробовать ещё раз
          </button>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Закрыть
          </button>
        </>
      );
      break;

    case "added":
      title = "PragmaBox на главном экране";
      text = addedNow
        ? "Готово! Теперь PragmaBox запускается одним касанием прямо с главного экрана."
        : "Иконка уже на главном экране — PragmaBox запускается одним касанием.";
      if (addedNow && !ios) footnote = "Не видите иконку? Пролистайте рабочие столы — она могла встать на последний.";
      actions = (
        <button type="button" onClick={onClose} className={NEUTRAL}>
          Открыть PragmaBox
        </button>
      );
      break;

    case "unsupported":
      if (reason === "desktop") {
        title = "Иконку добавляют с телефона";
        text =
          "На компьютере иконку на главный экран не добавить. Откройте бота в Telegram на телефоне и нажмите «📲 Установить на телефон».";
      } else if (reason === "old-telegram") {
        title = "Нужно обновить Telegram";
        text =
          "Эта версия Telegram не умеет добавлять иконку на главный экран. Обновите Telegram и нажмите «Установить на телефон» в боте ещё раз.";
      } else {
        title = "Иконку пока не добавить";
        text =
          "Telegram на этом телефоне не умеет добавлять иконку на главный экран — так бывает на Android старше 8-й версии. PragmaBox всегда открывается из чата с ботом.";
      }
      actions = (
        <button type="button" onClick={onClose} className={NEUTRAL}>
          Понятно
        </button>
      );
      break;
  }

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
        data-install-phase={phase}
        className="sheet-surface relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-white px-5 pb-[max(var(--safe-bottom),24px)] pt-6 text-center shadow-2xl animate-sheet-up"
      >
        <span className="hero-blue relative mx-auto grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-[22px] text-[30px] font-bold text-white shadow-lg shadow-[#4A5BF0]/30">
          <span className="hero-pattern pointer-events-none absolute inset-0 opacity-60" />
          <span className="relative">{phase === "added" ? "✓" : "P"}</span>
        </span>
        <h2 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-[#0F1C33]">{title}</h2>

        <div aria-live="polite">
          {text && <p className="mx-auto mt-2 max-w-[320px] text-[14px] leading-relaxed text-[#5C6B86]">{text}</p>}

          {guide && (
            <div className="mt-3 text-left">
              <p className="text-[14px] leading-relaxed text-[#5C6B86]">{guide.lead}</p>
              <ol className="mt-3 space-y-2">
                {guide.steps.map((step, i) => (
                  <li key={step} className="flex items-start gap-3 rounded-2xl bg-[#F4F6FB] px-3.5 py-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#4A5BF0] text-[12px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-[14px] leading-snug text-[#0F1C33]">{step}</span>
                  </li>
                ))}
              </ol>
              {guide.note && <p className="mt-2 text-[12px] leading-relaxed text-[#8A96AD]">{guide.note}</p>}
            </div>
          )}

          {footnote && <p className="mx-auto mt-3 max-w-[320px] text-[12px] leading-relaxed text-[#8A96AD]">{footnote}</p>}
        </div>

        {actions}
      </section>
    </div>
  );
}
