"use client";

import { useEffect, useState, useMemo } from "react";
import { IconChevronLeft, IconChevronRight, IconClose } from "@/components/ui/icons";
import { haptic } from "@/components/dashboard/TimelineCreator";

export interface TutorialStep {
  target: string; // CSS selector or data-tutorial attribute
  title: string;
  description: string;
  badge: string;
  tab?: "day" | "finance" | "clients";
}

const STEPS: TutorialStep[] = [
  {
    target: '[data-tutorial="date-switcher"]',
    badge: "Шаг 1 из 7",
    title: "Календарь и рабочий день",
    description:
      "Здесь вы быстро переключаете дни. Стрелки двигают день вперёд-назад, а тап по дате открывает выбор любого числа. Кнопка «Сегодня» возвращает на текущий день.",
    tab: "day",
  },
  {
    target: '[data-tutorial="income-widget"]',
    badge: "Шаг 2 из 7",
    title: "Доход за день и кольцо плана",
    description:
      "Показывает, сколько вы уже заработали за сегодня от проведённых тренировок. Белое кольцо заполняется по мере приближения к дневному плану.",
    tab: "day",
  },
  {
    target: '[data-tutorial="next-window-widget"]',
    badge: "Шаг 3 из 7",
    title: "Ближайшее окно на отдых",
    description:
      "Приложение само считает свободные окна между клиентами и показывает, через сколько у вас будет перерыв, чтобы пообедать или передохнуть.",
    tab: "day",
  },
  {
    target: '[data-tutorial="reminders-widget"]',
    badge: "Шаг 4 из 7",
    title: "Умные напоминания",
    description:
      "Больше не нужно держать в голове, кто не оплатил и у кого кончается абонемент. Синяя стрелка справа позволяет сразу отметить оплату или открыть карточку клиента.",
    tab: "day",
  },
  {
    target: '[data-tutorial="timeline-widget"]',
    badge: "Шаг 5 из 7",
    title: "Интерактивный таймлайн дня",
    description:
      "Ядро приложения! Сверху линии — оплаченные клиенты, снизу — долги и отмены. Красная черта показывает точное время прямо сейчас. Блоки можно двигать долгим зажатием, а тап открывает меню быстрых действий.",
    tab: "day",
  },
  {
    target: '[data-tutorial="timeline-add-btn"]',
    badge: "Шаг 6 из 7",
    title: "Запись клиента в пару касаний",
    description:
      "Нажмите на синий плюс или прямо на пустое время на линии. Таймлайн превратится в пошаговый мастер: клавиатура не нужна, всё выбирается кнопками за 10 секунд!",
    tab: "day",
  },
  {
    target: '[data-tutorial="bottom-nav"]',
    badge: "Шаг 7 из 7",
    title: "Финансы и карточки клиентов",
    description:
      "Снизу три вкладки: «День» (главный экран), «Финансы» (круговая диаграмма, все долги списком) и «Клиенты» (поиск клиентов, абонементы и замеры веса с графиками прогресса).",
  },
];

interface TutorialProps {
  open: boolean;
  onClose: () => void;
  onSwitchTab?: (tab: "day" | "finance" | "clients") => void;
}

export default function AppTutorial({ open, onClose, onSwitchTab }: TutorialProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = STEPS[index];

  // При переходе на шаг при необходимости переключаем вкладку и вычисляем координаты элемента
  useEffect(() => {
    if (!open) return;
    if (step.tab && onSwitchTab) {
      onSwitchTab(step.tab);
    }

    const updateRect = () => {
      const el = document.querySelector(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
        // Мягко скроллим к элементу, если он не в поле зрения
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      } else {
        setRect(null);
      }
    };

    const timer = setTimeout(updateRect, 150);
    window.addEventListener("resize", updateRect);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateRect);
    };
  }, [open, index, step, onSwitchTab]);

  if (!open) return null;

  const next = () => {
    haptic("select");
    if (index < STEPS.length - 1) {
      setIndex((i) => i + 1);
    } else {
      haptic("success");
      onClose();
      setIndex(0);
    }
  };

  const prev = () => {
    haptic("select");
    if (index > 0) {
      setIndex((i) => i - 1);
    }
  };

  const isLast = index === STEPS.length - 1;

  // Рассчитываем положение карточки с подсказкой (сверху или снизу от подсвеченного элемента)
  const isBottomHalf = rect ? rect.top > window.innerHeight * 0.45 : false;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col pointer-events-auto">
      {/* Затемняющий оверлей с вырезанным подсвеченным элементом */}
      <svg className="absolute inset-0 h-full w-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={Math.max(4, rect.left - 6)}
                y={Math.max(4, rect.top - 6)}
                width={rect.width + 12}
                height={rect.height + 12}
                rx="24"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.75)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Светящаяся рамка вокруг целевого элемента */}
      {rect && (
        <div
          className="absolute pointer-events-none transition-all duration-300 rounded-[24px] ring-4 ring-sky-400 ring-offset-2 ring-offset-transparent shadow-[0_0_25px_rgba(56,189,248,0.7)]"
          style={{
            left: Math.max(4, rect.left - 6),
            top: Math.max(4, rect.top - 6),
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Верхний бар с кнопкой пропуска */}
      <div className="relative z-10 flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <span className="rounded-full bg-white/20 backdrop-blur-md px-3 py-1 text-xs font-semibold text-white">
          Интерактивный тур
        </span>
        <button
          type="button"
          onClick={() => {
            haptic("select");
            onClose();
            setIndex(0);
          }}
          className="flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-white transition active:scale-95"
        >
          <span>Пропустить</span>
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Карточка-подсказка */}
      <div
        className={`relative z-10 mx-auto w-full max-w-sm px-4 transition-all duration-300 ${
          isBottomHalf ? "mt-4" : "mt-auto mb-[max(env(safe-area-inset-bottom),20px)]"
        }`}
      >
        <div className="rounded-[28px] bg-white p-5 shadow-2xl ring-1 ring-black/5 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-700">
              {step.badge}
            </span>
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? "w-5 bg-sky-500" : "w-1.5 bg-slate-200"
                  }`}
                />
              ))}
            </div>
          </div>

          <h3 className="mt-2.5 text-lg font-bold text-slate-900 leading-snug">
            {step.title}
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {step.description}
          </p>

          <div className="mt-4 flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700 active:scale-95 transition"
                aria-label="Назад"
              >
                <IconChevronLeft className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/25 active:scale-95 transition"
              style={{ background: "var(--ios-blue)" }}
            >
              <span>{isLast ? "Всё понятно, начать!" : "Дальше"}</span>
              {!isLast && <IconChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
