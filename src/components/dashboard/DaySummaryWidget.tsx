"use client";

import { endMs, isActive, isSessionDebt, startMs, sumPrice } from "@/lib/analytics";
import { blockStyle } from "@/lib/block-style";
import { plural } from "@/lib/plural";
import { addDays, fmtDuration, fmtMoney, fmtTime } from "@/lib/time";
import type { SessionDTO } from "@/lib/types";
import { IconArrowRight } from "@/components/ui/icons";
import { SvgIcon, WIDGET_ICONS } from "@/components/ui/app-icons";

interface DaySummaryWidgetProps {
  day: Date;
  sessions: SessionDTO[];
  isToday: boolean;
  now: Date;
  onOpen: () => void;
}

type Tone = "warn" | "bad" | "info" | "ok" | "muted";

const DOT: Record<Tone, string> = {
  warn: "#FF9F0A",
  bad: "#F04452",
  info: "#4A5BF0",
  ok: "#1DB871",
  muted: "#C4CCDD",
};

const sessionsWord = (n: number) => plural(n, "тренировка", "тренировки", "тренировок");
const minutesOf = (list: SessionDTO[]) => list.reduce((acc, s) => acc + s.durationMin, 0);

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[12px] font-medium text-[#5C6B86]">{label}</p>
      <p className="num mt-1 truncate text-[24px] leading-none text-[#0F1C33]">{value}</p>
      <p className="mt-1.5 truncate text-[11px] font-medium text-[#7D8AA6]">{sub}</p>
    </div>
  );
}

// Итоги выбранного дня: сколько тренировок проведено, сколько заработано
// и что требует внимания. Сегодня — ход дня, прошлый день — итог, будущий — план.
export default function DaySummaryWidget({ day, sessions, isToday, now, onOpen }: DaySummaryWidgetProps) {
  const nowMs = now.getTime();
  const isPast = !isToday && addDays(day, 1).getTime() <= nowMs;
  const isFuture = !isToday && !isPast;

  const list = [...sessions].sort((a, b) => startMs(a) - startMs(b));
  const active = list.filter(isActive);
  const done = active.filter((s) => s.status === "done");
  const planned = active.filter((s) => s.status === "planned");
  // Время вышло, а тренировка всё ещё «запланирована» — тренер не отметил её проведённой
  const unmarked = planned.filter((s) => endMs(s) <= nowMs);
  // Ещё не закончились: идёт сейчас или впереди
  const ahead = planned.filter((s) => endMs(s) > nowMs);
  const nextUp = ahead.find((s) => startMs(s) > nowMs);
  const ongoing = ahead.find((s) => startMs(s) <= nowMs);
  const unpaid = sumPrice(done.filter(isSessionDebt));
  const cancelled = list.filter((s) => s.status.startsWith("cancelled")).length;
  const noShow = list.filter((s) => s.status === "no_show").length;

  let left: { label: string; value: string; sub: string };
  let right: { label: string; value: string; sub: string };

  if (isFuture) {
    left = {
      label: "Запланировано",
      value: String(active.length),
      sub: active.length ? `${sessionsWord(active.length)} · ${fmtDuration(minutesOf(active))}` : "тренировок",
    };
    right = { label: "Ожидается", value: fmtMoney(sumPrice(planned)), sub: "за день" };
  } else {
    let leftSub: string;
    if (active.length === 0) leftSub = "тренировок";
    else if (isToday) leftSub = ahead.length ? `ещё ${ahead.length} впереди` : "больше на сегодня нет";
    else {
      const misses = [
        cancelled ? `${cancelled} ${plural(cancelled, "отмена", "отмены", "отмен")}` : null,
        noShow ? `${noShow} ${plural(noShow, "неявка", "неявки", "неявок")}` : null,
      ].filter(Boolean);
      leftSub = misses.length ? misses.join(" · ") : "без отмен";
    }
    left = {
      label: "Проведено",
      value: active.length ? `${done.length} из ${active.length}` : "0",
      sub: leftSub,
    };
    const aheadSum = sumPrice(ahead);
    right = {
      label: "Заработано",
      value: fmtMoney(sumPrice(done)),
      sub:
        isToday && aheadSum > 0
          ? `и ещё ${fmtMoney(aheadSum)} впереди`
          : done.length
            ? `за ${fmtDuration(minutesOf(done))}`
            : isToday
              ? "за сегодня"
              : "за день",
    };
  }

  // Одна строка «на что обратить внимание», по важности
  let note: { tone: Tone; text: string };
  const first = active[0];
  if (unmarked.length > 0) {
    const n = unmarked.length;
    note = {
      tone: "warn",
      text: `${n} ${plural(n, "тренировка прошла", "тренировки прошли", "тренировок прошли")}, но не ${plural(n, "отмечена", "отмечены", "отмечены")}`,
    };
  } else if (unpaid > 0) {
    note = { tone: "bad", text: `Не оплачено: ${fmtMoney(unpaid)}` };
  } else if (isToday && nextUp) {
    note = { tone: "info", text: `Следующая в ${fmtTime(new Date(nextUp.startsAt))} — ${nextUp.clientName}` };
  } else if (isToday && ongoing) {
    note = { tone: "info", text: `Сейчас — ${ongoing.clientName}, до ${fmtTime(new Date(endMs(ongoing)))}` };
  } else if (isFuture && first) {
    note = { tone: "info", text: `Первая в ${fmtTime(new Date(first.startsAt))} — ${first.clientName}` };
  } else if (active.length > 0) {
    note = { tone: "ok", text: "Все тренировки проведены" };
  } else {
    note = { tone: "muted", text: isPast ? "В этот день тренировок не было" : "Свободный день" };
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${isFuture ? "План на день" : "Итоги дня"}: открыть расписание`}
      className="tile card-tint-teal block w-full p-4 text-left"
    >
      <span className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <span className="chip-teal grid h-9 w-9 place-items-center rounded-[13px]">
            <SvgIcon src={WIDGET_ICONS.daySummary} className="h-5 w-5" />
          </span>
          <span className="text-[15px] font-bold text-[#0F1C33]">{isFuture ? "План на день" : "Итоги дня"}</span>
        </span>
        <IconArrowRight className="h-4 w-4 text-[#B5C2D6]" />
      </span>

      <span className="mt-3 grid grid-cols-2 gap-3">
        <Stat {...left} />
        <Stat {...right} />
      </span>

      {/* Тренировки дня по порядку, цветом как блоки на таймлайне */}
      <span className="mt-3 flex h-1.5 gap-[3px]" aria-hidden="true">
        {list.length === 0 ? (
          <span className="block h-full flex-1 rounded-full bg-[#E3E8F4]" />
        ) : (
          list.map((s) => (
            <span key={s.id} className="block h-full flex-1 rounded-full" style={{ background: blockStyle(s).solid }} />
          ))
        )}
      </span>

      <span className="mt-2.5 flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[note.tone] }} />
        <span className="min-w-0 truncate text-[12px] font-medium text-[#5C6B86]">{note.text}</span>
      </span>
    </button>
  );
}
