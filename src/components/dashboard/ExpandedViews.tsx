"use client";

import { DAILY_GOAL, WORK_END_HOUR, WORK_START_HOUR } from "@/lib/config";
import {
  dailyEarnings,
  dayGaps,
  incomeSummary,
  isActive,
  startMs,
  type Gap,
  type Reminder,
} from "@/lib/analytics";
import { atMinute, fmtDuration, fmtMinute, fmtMoney, fmtShortDate, fmtTime, startOfMonth } from "@/lib/time";
import type { SessionDTO } from "@/lib/types";
import { IconArrowRight } from "@/components/ui/icons";

const card = "rounded-[22px] border border-[#E6EAF3] bg-white p-4 shadow-sm";

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bad" | "good" }) {
  const color = tone === "bad" ? "text-[#F04452]" : tone === "good" ? "text-[#1DB871]" : "text-[#0F1C33]";
  return (
    <div className={card}>
      <p className="text-[12px] font-medium text-[#5C6B86]">{label}</p>
      <p className={`num mt-1 text-[20px] ${color}`}>{value}</p>
    </div>
  );
}

interface IncomeExpandedProps {
  history: SessionDTO[];
  now: Date;
  onPay: (sessionId: number) => void;
}

export function IncomeExpanded({ history, now, onPay }: IncomeExpandedProps) {
  const sum = incomeSummary(history, startOfMonth(now), now);
  const series = dailyEarnings(history, now, 14);
  const max = Math.max(DAILY_GOAL / 2, ...series.map((x) => x.sum));

  return (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Заработано за месяц" value={fmtMoney(sum.earned)} tone="good" />
        <Stat label="Получено" value={fmtMoney(sum.received)} />
        <Stat label="Ожидается" value={fmtMoney(sum.planned)} />
        <Stat label="Долги" value={fmtMoney(sum.unpaid)} tone={sum.unpaid > 0 ? "bad" : "default"} />
      </div>

      <section className={card}>
        <h3 className="mb-3 text-[15px] font-bold text-[#0F1C33]">Доход за 14 дней</h3>
        <div className="flex h-36 items-end gap-1.5">
          {series.map((x) => (
            <div key={x.label} className="flex h-full flex-1 flex-col justify-end">
              <div
                className="bar-grad w-full rounded-t-[6px]"
                style={{ height: `${Math.max(2, (x.sum / max) * 100)}%`, opacity: x.sum > 0 ? 1 : 0.15 }}
                title={`${x.label}: ${fmtMoney(x.sum)}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {series.map((x, i) => (
            <span key={x.label} className="flex-1 text-center text-[8px] text-[#9AA6BE]">
              {i % 2 === 0 ? x.label : ""}
            </span>
          ))}
        </div>
      </section>

      <section className={card}>
        <h3 className="mb-3 text-[15px] font-bold text-[#0F1C33]">Не оплачено</h3>
        {sum.unpaidList.length === 0 ? (
          <p className="text-sm text-[#9AA6BE]">Долгов нет</p>
        ) : (
          <ul className="space-y-2">
            {sum.unpaidList.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-2xl bg-[#FDECEF] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0F1C33]">{s.clientName}</p>
                  <p className="text-xs text-[#5C6B86]">
                    {fmtShortDate(new Date(s.startsAt))} · {fmtMoney(s.price)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onPay(s.id)}
                  className="shrink-0 rounded-full bg-[#1DB871] px-3 py-1.5 text-xs font-bold text-white"
                >
                  Оплачено
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface NextExpandedProps {
  day: Date;
  sessions: SessionDTO[];
  now: Date;
  isToday: boolean;
}

export function NextExpanded({ day, sessions, now, isToday }: NextExpandedProps) {
  const from = isToday ? now : atMinute(day, WORK_START_HOUR * 60);
  const to = atMinute(day, WORK_END_HOUR * 60);
  const gaps: Gap[] = dayGaps(sessions, from, to);
  const busyNow = isToday
    ? sessions.some((s) => isActive(s) && startMs(s) <= now.getTime() && now.getTime() < startMs(s) + s.durationMin * 60_000)
    : false;

  return (
    <div className="space-y-3 pb-2">
      <div className={card}>
        <p className="text-[12px] font-medium text-[#5C6B86]">Сейчас</p>
        <p className="mt-1 font-bold text-[#0F1C33]">{!isToday ? "Смотришь другой день" : busyNow ? "Клиент на тренировке" : "Свободен"}</p>
        <p className="mt-1 text-xs text-[#9AA6BE]">
          Рабочий день {fmtMinute(WORK_START_HOUR * 60)}–{fmtMinute(WORK_END_HOUR * 60)}
        </p>
      </div>

      <h3 className="px-1 text-sm font-bold text-[#0F1C33]">Окна впереди</h3>
      {gaps.length === 0 ? (
        <p className="rounded-[22px] border border-[#E6EAF3] bg-white p-4 text-sm text-[#9AA6BE]">Окон не осталось. День забит.</p>
      ) : (
        <ul className="space-y-2">
          {gaps.map((g) => (
            <li key={g.start.getTime()} className={card}>
              <div className="flex items-center justify-between">
                <p className="num text-[18px] text-[#0F1C33]">
                  {fmtTime(g.start)} – {fmtTime(g.end)}
                </p>
                <span className="rounded-full bg-[#EEF1FF] px-2.5 py-1 text-xs font-bold text-[#4A5BF0]">
                  {fmtDuration(g.minutes)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-[#5C6B86]">
                {g.minutes >= 60 ? "Хороший перерыв: можно поесть и отдохнуть" : g.minutes >= 30 ? "Хватит на обед или перекус" : "Короткое окно: вода и заметки"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RemindersExpandedProps {
  reminders: Reminder[];
  onAction: (r: Reminder) => void;
}

export function RemindersExpanded({ reminders, onAction }: RemindersExpandedProps) {
  if (reminders.length === 0) {
    return <p className="rounded-[22px] border border-[#E6EAF3] bg-white p-6 text-center text-sm text-[#9AA6BE]">Всё под контролем</p>;
  }
  return (
    <ul className="space-y-2 pb-4">
      {reminders.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onAction(r)}
            className="flex w-full items-center gap-3 rounded-[20px] border border-[#E6EAF3] bg-white p-3.5 text-left active:scale-[0.99]"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: r.tone === "bad" ? "#F04452" : r.tone === "warn" ? "#FF9F0A" : "#C4CCDD" }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#0F1C33]">{r.title}</p>
              <p className="truncate text-xs text-[#9AA6BE]">{r.sub}</p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EEF1FF] text-[#4A5BF0]">
              <IconArrowRight className="h-4 w-4" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
