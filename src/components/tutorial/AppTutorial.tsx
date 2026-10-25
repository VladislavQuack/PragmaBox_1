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
      "Лента недели листается пальцем, тап по числу переключает день. Тап по большой дате открывает календарь, а кнопка «Сегодня» возвращает на текущий день. Точки под числом — сколько в этот день клиентов.",
    tab: "day",
  },
  {
    target: '[data-tutorial="income-widget"]',
    badge: "Шаг 2 из 7",
    title: "Доход за месяц и прогресс цели",
    description:
      "Показывает фактический доход за текущий месяц и полоску прогресса к вашей цели. Тап открывает экран финансов: графики, долги и экспорты.",
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
    title: "Напоминания-ссылки",
    description:
      "Каждое напоминание ведёт сразу туда, где нужно действовать: долг по тренировке — на экран «Финансы» с нужным должником, а абонемент или остаток занятий — в карточку клиента.",
    tab: "day",
  },
  {
    target: '[data-tutorial="timeline-widget"]',
    badge: "Шаг 5 из 7",
    title: "Интерактивный таймлайн дня",
    description:
      "Ядро приложения! Цвет блока — это статус: синий — запланировано, зелёный — проведено, жёлтый — ждёт оплаты, красный — долг. Синяя линия — время прямо сейчас. Блок можно перенести долгим зажатием, а кнопка в углу открывает большой вертикальный календарь с часами, неделей и быстрым добавлением записи.",
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

  // Пока тур открыт — прокрутка страницы и дашборда заблокирована,
  // иначе даже микро-скролл уводит элемент из-под маски.
  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const main = document.querySelector("main > div.no-scrollbar, main > div.overflow-hidden");
    if (main) main.scrollTo({ top: 0, behavior: "auto" });
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open ]);

  // Шаг тура: переключаем вкладку, подводим элемент БЕЗ анимации
  // (иначе маска меряется по старым координатам) и дальше просто держим подсветку
  // приклеенной: прямоугольник пересчитывается каждый кадр, поэтому любая
  // прокрутка контейнера — внутренняя или страницы — не сбивает маску.
  useEffect(() => {
    if (!open) return;
    if (step.tab && onSwitchTab) onSwitchTab(step.tab);

    const el = document.querySelector(step.target);
    if (el) el.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });

    let raf = 0;
    let last: DOMRect | null = null;
    const tick = () => {
      const node = document.querySelector(step.target);
      if (node) {
        const r = node.getBoundingClientRect();
        if (
          !last ||
          Math.abs(last.left - r.left) > 0.5 ||
          Math.abs(last.top - r.top) > 0.5 ||
          Math.abs(last.width - r.width) > 0.5 ||
          Math.abs(last.height - r.height) > 0.5
        ) {
          last = r;
          setRect(r);
        }
      } else if (last !== null) {
        last = null;
        setRect(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", tick);
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
          className="absolute pointer-events-none transition-all duration-300 rounded-[24px] ring-4 ring-[#4A5BF0] ring-offset-2 ring-offset-transparent shadow-[0_0_25px_rgba(56,189,248,0.7)]"
          style={{
            left: Math.max(4, rect.left - 6),
            top: Math.max(4, rect.top - 6),
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Карточка-подсказка (кнопка закрытия перенесена внутрь, чтобы не перекрывать шапку с датой) */}
      <div
        className={`relative z-10 mx-auto w-full max-w-sm px-4 transition-all duration-300 ${
          isBottomHalf ? "mt-4" : "mt-auto mb-[max(env(safe-area-inset-bottom),20px)]"
        }`}
      >
        <div className="rounded-[28px] bg-white p-5 shadow-2xl ring-1 ring-black/5 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[#EEF1FF] px-2.5 py-0.5 text-[11px] font-bold text-[#4A5BF0]">
              {step.badge}
            </span>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === index ? "w-5 bg-[#4A5BF0]" : "w-1.5 bg-[#E7EAF3]"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  haptic("select");
                  onClose();
                  setIndex(0);
                }}
                aria-label="Закрыть тур"
                className="grid h-7 w-7 place-items-center rounded-full bg-[#F1F3F9] text-[#5C6B86] hover:text-[#0F1C33] transition active:scale-90"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <h3 className="mt-2.5 text-lg font-bold text-[#0F1C33] leading-snug">
            {step.title}
          </h3>
          <p className="mt-1.5 text-sm text-[#5C6B86] leading-relaxed">
            {step.description}
          </p>

          <div className="mt-4 flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="grid h-11 w-11 place-items-center rounded-2xl bg-[#F1F3F9] text-[#5C6B86] active:scale-95 transition"
                aria-label="Назад"
              >
                <IconChevronLeft className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={next}
              aria-label={isLast ? "Всё понятно, начать" : "Дальше"}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-bold text-white shadow-lg shadow-[#4A5BF0]/25 active:scale-95 transition"
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
