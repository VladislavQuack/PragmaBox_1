"use client";

import { useMemo, useState } from "react";
import { patch } from "@/lib/client-api";
import { dailyEarnings, incomeSummary, startMs, sumPrice } from "@/lib/analytics";
import { fmtMoney, fmtShortDate, startOfMonth } from "@/lib/time";
import type { ClientDTO, SessionDTO } from "@/lib/types";
import { DonutChart, type Slice } from "@/components/charts/Charts";

type Range = "month" | "all";

interface Debtor {
  clientId: number;
  name: string;
  sessions: number;
  sessionSum: number;
  packageSum: number;
  total: number;
  oldest: string | null;
}

// Долги: неоплаченные проведённые тренировки + неоплаченные абонементы
export function collectDebtors(history: SessionDTO[], clients: ClientDTO[]): Debtor[] {
  const map = new Map<number, Debtor>();
  const touch = (clientId: number, name: string) => {
    let d = map.get(clientId);
    if (!d) {
      d = { clientId, name, sessions: 0, sessionSum: 0, packageSum: 0, total: 0, oldest: null };
      map.set(clientId, d);
    }
    return d;
  };

  for (const s of history) {
    if (s.status !== "done" || s.paid || s.price <= 0) continue;
    const d = touch(s.clientId, s.clientName);
    d.sessions += 1;
    d.sessionSum += s.price;
    const day = s.startsAt.slice(0, 10);
    if (!d.oldest || day < d.oldest) d.oldest = day;
  }

  for (const c of clients) {
    const pkg = c.packages[c.packages.length - 1];
    if (!pkg || pkg.paid || pkg.price <= 0 || pkg.remainingSessions <= 0) continue;
    touch(c.id, c.name).packageSum += pkg.price;
  }

  return [...map.values()]
    .map((d) => ({ ...d, total: d.sessionSum + d.packageSum }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);
}

export default function FinanceTab({
  history,
  clients,
  now,
  onReload,
  onToast,
}: {
  history: SessionDTO[];
  clients: ClientDTO[];
  now: Date;
  onReload: () => void;
  onToast: (msg: string) => void;
}) {
  const [range, setRange] = useState<Range>("month");
  const [busyId, setBusyId] = useState<number | null>(null);

  const monthStart = startOfMonth(now);
  const sum = useMemo(() => incomeSummary(history, monthStart, now), [history, monthStart, now]);
  const debtors = useMemo(() => collectDebtors(history, clients), [history, clients]);
  const series = useMemo(() => dailyEarnings(history, now, 14), [history, now]);

  const scoped = useMemo(() => {
    if (range === "all") return history;
    const from = monthStart.getTime();
    return history.filter((s) => startMs(s) >= from);
  }, [history, range, monthStart]);

  const done = scoped.filter((s) => s.status === "done");
  const received = sumPrice(done.filter((s) => s.paid));
  const owedSessions = sumPrice(done.filter((s) => !s.paid && s.price > 0));
  const owedPackages = debtors.reduce((acc, d) => acc + d.packageSum, 0);

  const slices: Slice[] = [
    { label: "Получено", value: received, color: "#10B981" },
    { label: "Долг за тренировки", value: owedSessions, color: "#F43F5E" },
    { label: "Неоплаченные абонементы", value: owedPackages, color: "#F59E0B" },
  ];
  const totalMoney = received + owedSessions + owedPackages;
  const collectedPct = totalMoney > 0 ? Math.round((received / totalMoney) * 100) : 100;
  const maxBar = Math.max(1, ...series.map((x) => x.sum));

  const payOff = async (d: Debtor) => {
    const unpaid = history.filter(
      (s) => s.clientId === d.clientId && s.status === "done" && !s.paid && s.price > 0,
    );
    if (unpaid.length === 0) return;
    setBusyId(d.clientId);
    try {
      await Promise.all(unpaid.map((s) => patch(`/api/sessions/${s.id}`, { paid: true })));
      onToast(`${d.name}: отмечено ${fmtMoney(d.sessionSum)}`);
      onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3 pb-2">
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className="tile p-3.5 text-white"
          style={{ background: "var(--ios-green)", ["--tile-shadow" as string]: "rgba(52,199,89,0.4)" }}
        >
          <p className="text-[11px] font-semibold opacity-90">Заработано за месяц</p>
          <p className="num mt-1 text-[22px] leading-none">{fmtMoney(sum.earned)}</p>
          <p className="mt-1.5 text-[11px] opacity-90">получено {fmtMoney(sum.received)}</p>
        </div>
        <div
          className={`tile p-3.5 ${sum.unpaid + owedPackages > 0 ? "text-white" : "text-black"}`}
          style={
            sum.unpaid + owedPackages > 0
              ? { background: "var(--ios-red)", ["--tile-shadow" as string]: "rgba(255,59,48,0.4)" }
              : { background: "#fff" }
          }
        >
          <p className="text-[11px] font-semibold opacity-90">Должны сейчас</p>
          <p className="num mt-1 text-[22px] leading-none">{fmtMoney(sum.unpaid + owedPackages)}</p>
          <p className="mt-1.5 text-[11px] opacity-90">
            {debtors.length === 0 ? "все рассчитались" : `${debtors.length} чел.`}
          </p>
        </div>
      </div>

      <section className="rounded-[22px] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Структура денег</h2>
          <div className="flex rounded-full bg-slate-100 p-0.5">
            {(["month", "all"] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {r === "month" ? "Месяц" : "Всё время"}
              </button>
            ))}
          </div>
        </div>
        {totalMoney === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Пока нет проведённых тренировок</p>
        ) : (
          <DonutChart
            slices={slices}
            centerTop={`${collectedPct}%`}
            centerBottom="собрано"
          />
        )}
      </section>

      <section className="rounded-[22px] bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-900">Доход за 14 дней</h2>
        <div className="flex h-28 items-end gap-1">
          {series.map((x) => (
            <div key={x.label} className="flex h-full flex-1 flex-col justify-end" title={`${x.label}: ${fmtMoney(x.sum)}`}>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-emerald-300"
                style={{ height: `${Math.max(3, (x.sum / maxBar) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1">
          {series.map((x, i) => (
            <span key={x.label} className="flex-1 text-center text-[8px] text-slate-400">
              {i % 2 === 0 ? x.label : ""}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-slate-900">Кто должен</h2>
        {debtors.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Долгов нет 👌</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {debtors.map((d) => (
              <li key={d.clientId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{d.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {d.sessions > 0 && `${d.sessions} трен. · ${fmtMoney(d.sessionSum)}`}
                    {d.sessions > 0 && d.packageSum > 0 && " · "}
                    {d.packageSum > 0 && `абонемент ${fmtMoney(d.packageSum)}`}
                    {d.oldest && ` · с ${fmtShortDate(new Date(d.oldest))}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-rose-600">
                  {fmtMoney(d.total)}
                </span>
                {d.sessionSum > 0 && (
                  <button
                    type="button"
                    disabled={busyId === d.clientId}
                    onClick={() => payOff(d)}
                    className="shrink-0 rounded-full bg-emerald-500 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    Оплачено
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Ожидается</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Запланировано до конца месяца</span>
          <span className="font-bold tabular-nums text-slate-900">{fmtMoney(sum.planned)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-slate-600">Всего проведено тренировок</span>
          <span className="font-bold tabular-nums text-slate-900">
            {history.filter((s) => s.status === "done").length}
          </span>
        </div>
      </section>
    </div>
  );
}
