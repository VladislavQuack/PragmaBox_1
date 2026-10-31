"use client";

import { isActive, startMs, sumPrice } from "@/lib/analytics";
import { plural } from "@/lib/plural";
import { addDays, dayKey, fmtDayLong, fmtMoney, startOfWeek } from "@/lib/time";
import type { SessionDTO } from "@/lib/types";
import { SvgIcon, WIDGET_ICONS } from "@/components/ui/app-icons";
import { haptic } from "./TimelineCreator";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
// Высота самого высокого столбика, px
const BAR_MAX = 56;

interface WeekWidgetProps {
  // Выбранный день: показываем его неделю и подсвечиваем его столбик
  day: Date;
  todayKey: string;
  history: SessionDTO[];
  now: Date;
  onPickDay: (key: string) => void;
}

// «27 окт – 2 нояб» или «4–10 мая». Месяц берём вместе с числом: так он в родительном
// падеже («мая», а не «май»)
function fmtRange(from: Date, to: Date): string {
  const dayMonth = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(/\.$/, "");
  if (from.getMonth() === to.getMonth()) return `${from.getDate()}–${dayMonth(to)}`;
  return `${dayMonth(from)} – ${dayMonth(to)}`;
}

// Неделя выбранного дня: сколько тренировок по дням и как это соотносится с прошлой неделей.
// Тап по столбику открывает этот день — как лента дней в шапке.
export default function WeekWidget({ day, todayKey, history, now, onPickDay }: WeekWidgetProps) {
  const start = startOfWeek(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const from = start.getTime();
  const to = addDays(start, 7).getTime();
  const prevFrom = addDays(start, -7).getTime();
  const between = (s: SessionDTO, a: number, b: number) => {
    const t = startMs(s);
    return t >= a && t < b;
  };

  const week = history.filter((s) => isActive(s) && between(s, from, to));
  const prevCount = history.filter((s) => isActive(s) && between(s, prevFrom, from)).length;
  const counts = days.map((d) => week.filter((s) => between(s, d.getTime(), addDays(d, 1).getTime())).length);
  const total = week.length;
  const diff = total - prevCount;
  // Мелкие значения не растягиваем на всю высоту: одна тренировка — невысокий столбик
  const scale = Math.max(4, ...counts);
  const selectedKey = dayKey(day);

  const earned = sumPrice(week.filter((s) => s.status === "done"));
  const expected = sumPrice(week.filter((s) => s.status === "planned" && startMs(s) >= now.getTime()));
  const money = [
    earned > 0 ? { label: "заработано", value: fmtMoney(earned) } : null,
    expected > 0 ? { label: "ожидается", value: fmtMoney(expected) } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  const delta =
    total === 0 && prevCount === 0
      ? null
      : diff > 0
        ? { text: `+${diff} к прошлой`, className: "bg-[#E2F8EC] text-[#12985B]" }
        : diff < 0
          ? { text: `−${-diff} к прошлой`, className: "bg-[#EEF1F7] text-[#5C6B86]" }
          : { text: "как на прошлой", className: "bg-[#EEF1F7] text-[#5C6B86]" };

  return (
    <section className="card-tint-violet rounded-[22px] border border-[#E6EAF3] p-4 shadow-[var(--card-shadow)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="chip-violet grid h-9 w-9 shrink-0 place-items-center rounded-[13px]">
            <SvgIcon src={WIDGET_ICONS.week} className="h-5 w-5" />
          </span>
          <h3 className="text-[15px] font-bold text-[#0F1C33]">Неделя</h3>
        </div>
        <span className="shrink-0 text-[12px] font-medium text-[#9AA6BE]">{fmtRange(days[0], days[6])}</span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="min-w-0 truncate">
          <span className="num text-[26px] leading-none text-[#0F1C33]">{total}</span>{" "}
          <span className="text-[13px] font-semibold text-[#5C6B86]">
            {plural(total, "тренировка", "тренировки", "тренировок")}
          </span>
        </p>
        {delta && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${delta.className}`}>{delta.text}</span>
        )}
      </div>

      <div className="mt-3 flex gap-1">
        {days.map((d, i) => {
          const key = dayKey(d);
          const count = counts[i];
          const selected = key === selectedKey;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              aria-label={`${WEEKDAYS[i]}, ${fmtDayLong(d)}: ${count} ${plural(count, "тренировка", "тренировки", "тренировок")}`}
              onClick={() => {
                if (!selected) haptic("select");
                onPickDay(key);
              }}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl py-1 transition active:scale-95"
            >
              <span
                className={`num text-[12px] leading-none ${
                  selected ? "text-[#4A5BF0]" : count ? "text-[#5C6B86]" : "text-[#C4CCDD]"
                }`}
              >
                {count || "–"}
              </span>
              <span className="flex w-full items-end justify-center" style={{ height: BAR_MAX }}>
                <span
                  className={`block w-full max-w-[28px] rounded-[8px] ${selected ? "bar-grad" : ""}`}
                  style={{
                    height: count ? Math.max(8, Math.round((count / scale) * BAR_MAX)) : 4,
                    background: selected ? undefined : count ? "#D3D9F8" : "#E6EAF5",
                  }}
                />
              </span>
              <span
                className={`text-[11px] leading-none ${selected ? "font-bold text-[#4A5BF0]" : "font-medium text-[#9AA6BE]"}`}
              >
                {WEEKDAYS[i]}
              </span>
              {/* Точка — сегодня */}
              <span className={`h-1 w-1 rounded-full ${isToday ? "bg-[#4A5BF0]" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      <p className="mt-2 truncate border-t border-[#ECEFF7] pt-2.5 text-[12px] font-medium text-[#7D8AA6]">
        {total === 0
          ? "Тренировок на неделе нет"
          : money.length === 0
            ? "Отметьте проведённые — посчитаем доход"
            : money.map((m, i) => (
              <span key={m.label}>
                {i > 0 && " · "}
                {m.label} <span className="font-bold text-[#0F1C33]">{m.value}</span>
              </span>
            ))}
      </p>
    </section>
  );
}
