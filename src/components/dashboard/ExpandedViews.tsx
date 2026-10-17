"use client";

import { DAILY_GOAL, KINDS, MUSCLE_GROUPS, STATUSES, WORK_END_HOUR, WORK_START_HOUR, isKindKey, isMuscleKey, isStatusKey } from "@/lib/config";
import {
  dailyEarnings,
  dayGaps,
  incomeSummary,
  isActive,
  startMs,
  sumPrice,
  type Gap,
  type Reminder,
} from "@/lib/analytics";

import { atMinute, fmtDuration, fmtMinute, fmtMoney, fmtShortDate, fmtTime, startOfMonth } from "@/lib/time";
import type { SessionDTO } from "@/lib/types";

const card = "rounded-3xl bg-white p-4 shadow-sm";

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bad" | "good" }) {
  const color = tone === "bad" ? "text-rose-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className={card}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

// ───────── Таймлайн: вертикальный список дня с окнами ─────────
interface TimelineExpandedProps {
  day: Date;
  sessions: SessionDTO[];
  isToday: boolean;
  now: Date;
  onOpen: (s: SessionDTO) => void;
  onEmpty: (at: Date) => void;
}

type Row = { kind: "session"; at: number; s: SessionDTO } | { kind: "gap"; at: number; gap: Gap };

export function TimelineExpanded({ day, sessions, onOpen, onEmpty }: TimelineExpandedProps) {
  const dayStart = atMinute(day, WORK_START_HOUR * 60);
  const dayEnd = atMinute(day, WORK_END_HOUR * 60);
  const gaps = dayGaps(sessions, dayStart, dayEnd);
  const active = sessions.filter(isActive);

  const rows: Row[] = [
    ...sessions.map((s): Row => ({ kind: "session", at: startMs(s), s })),
    ...gaps.map((gap): Row => ({ kind: "gap", at: gap.start.getTime(), gap })),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="space-y-4 pb-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Клиентов" value={String(active.length)} />
        <Stat label="Окон" value={String(gaps.length)} />
        <Stat label="Сумма" value={fmtMoney(sumPrice(active))} />
      </div>

      {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">На этот день ничего не записано</p>}

      <ul className="space-y-2">
        {rows.map((row) =>
          row.kind === "session" ? (
            <li key={`s-${row.s.id}`}>
              <button
                type="button"
                onClick={() => onOpen(row.s)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition active:scale-[0.99]"
              >
                <div className="w-12 shrink-0 text-center">
                  <p className="text-sm font-bold tabular-nums">{fmtTime(new Date(row.s.startsAt))}</p>
                  <p className="text-[10px] text-slate-500">{row.s.durationMin} мин</p>
                </div>
                <span
                  className="h-10 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: isMuscleKey(row.s.muscleGroup) ? MUSCLE_GROUPS[row.s.muscleGroup].color : "#8B7CF6" }}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold ${row.s.status.startsWith("cancelled") ? "line-through text-slate-400" : ""}`}>
                    {row.s.clientName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {isMuscleKey(row.s.muscleGroup) ? MUSCLE_GROUPS[row.s.muscleGroup].label : ""}
                    {isKindKey(row.s.kind) ? ` · ${KINDS[row.s.kind]}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {isStatusKey(row.s.status) ? STATUSES[row.s.status] : row.s.status}
                  </span>
                  <span className={`text-[10px] font-semibold ${row.s.paid ? "text-emerald-600" : "text-rose-600"}`}>
                    {row.s.price > 0 ? (row.s.paid ? "оплачено" : "не оплачено") : "бесплатно"}
                  </span>
                </div>
              </button>
            </li>
          ) : (
            <li
              key={`g-${row.gap.start.getTime()}`}
              className="flex items-center justify-between rounded-2xl border border-dashed border-sky-300 bg-sky-50/70 px-3 py-2.5"
            >
              <span className="text-sm text-sky-900">
                Окно · {fmtTime(row.gap.start)}–{fmtTime(row.gap.end)} · <b>{fmtDuration(row.gap.minutes)}</b>
              </span>
              <button
                type="button"
                onClick={() => onEmpty(row.gap.start)}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm"
              >
                + Записать
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

// ───────── Доход: сводка, график за 14 дней, долги ─────────
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
    <div className="space-y-4 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Заработано за месяц" value={fmtMoney(sum.earned)} tone="good" />
        <Stat label="Получено" value={fmtMoney(sum.received)} />
        <Stat label="Ожидается" value={fmtMoney(sum.planned)} />
        <Stat label="Долги" value={fmtMoney(sum.unpaid)} tone={sum.unpaid > 0 ? "bad" : "default"} />
      </div>

      <section className={card}>
        <h3 className="mb-3 text-sm font-semibold">Доход за 14 дней</h3>
        <div className="flex h-36 items-end gap-1.5">
          {series.map((x) => (
            <div key={x.label} className="flex h-full flex-1 flex-col justify-end">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-emerald-300"
                style={{ height: `${Math.max(2, (x.sum / max) * 100)}%` }}
                title={`${x.label}: ${fmtMoney(x.sum)}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {series.map((x, i) => (
            <span key={x.label} className="flex-1 text-center text-[8px] text-slate-400">
              {i % 2 === 0 ? x.label : ""}
            </span>
          ))}
        </div>
      </section>

      <section className={card}>
        <h3 className="mb-3 text-sm font-semibold">Не оплачено</h3>
        {sum.unpaidList.length === 0 ? (
          <p className="text-sm text-slate-500">Долгов нет 👌</p>
        ) : (
          <ul className="space-y-2">
            {sum.unpaidList.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-2xl bg-rose-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-rose-900">{s.clientName}</p>
                  <p className="text-xs text-rose-700">
                    {fmtShortDate(new Date(s.startsAt))} · {fmtMoney(s.price)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onPay(s.id)}
                  className="shrink-0 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
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

// ───────── Окна: все перерывы дня ─────────
interface NextExpandedProps {
  day: Date;
  sessions: SessionDTO[];
  now: Date;
  isToday: boolean;
}

export function NextExpanded({ day, sessions, now, isToday }: NextExpandedProps) {
  const from = isToday ? now : atMinute(day, WORK_START_HOUR * 60);
  const to = atMinute(day, WORK_END_HOUR * 60);
  const gaps = dayGaps(sessions, from, to);
  const busyNow = isToday ? sessions.some((s) => isActive(s) && startMs(s) <= now.getTime() && now.getTime() < startMs(s) + s.durationMin * 60_000) : false;

  return (
    <div className="space-y-4 pb-2">
      <div className={card}>
        <p className="text-xs font-medium text-slate-500">Сейчас</p>
        <p className="mt-1 font-semibold">{!isToday ? "Смотришь другой день" : busyNow ? "Клиент на тренировке" : "Свободен"}</p>
        <p className="mt-1 text-xs text-slate-500">
          Рабочий день {fmtMinute(WORK_START_HOUR * 60)}–{fmtMinute(WORK_END_HOUR * 60)}
        </p>
      </div>

      <h3 className="px-1 text-sm font-semibold text-slate-700">Окна впереди</h3>
      {gaps.length === 0 ? (
        <p className="rounded-3xl bg-white p-4 text-sm text-slate-500 shadow-sm">Окон не осталось. День забит 💪</p>
      ) : (
        <ul className="space-y-2">
          {gaps.map((g) => (
            <li key={g.start.getTime()} className={card}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold tabular-nums">
                  {fmtTime(g.start)} – {fmtTime(g.end)}
                </p>
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  {fmtDuration(g.minutes)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600">
                {g.minutes >= 60 ? "Хороший перерыв: можно поесть и отдохнуть 🍽" : g.minutes >= 30 ? "Хватит на обед или перекус 🥗" : "Короткое окно: вода и заметки клиентов"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────── Напоминания: полный список ─────────
interface RemindersExpandedProps {
  reminders: Reminder[];
  onAction: (r: Reminder) => void;
}

export function RemindersExpanded({ reminders, onAction }: RemindersExpandedProps) {
  if (reminders.length === 0) {
    return <p className="rounded-3xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Всё под контролем ✨</p>;
  }
  return (
    <ul className="space-y-2 pb-4">
      {reminders.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onAction(r)}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-sm active:scale-[0.99]"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.tone === "bad" ? "bg-rose-500" : "bg-amber-500"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{r.title}</p>
              <p className="truncate text-xs text-slate-500">{r.sub}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-sky-700">
              {r.kind === "unpaid" || r.kind === "pkg-unpaid" ? "Оплачено" : "Клиент →"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

