"use client";

import { useEffect, useMemo, useState } from "react";
import { patch } from "@/lib/client-api";
import {
  dailyEarnings,
  debtSummary,
  debtorDetails,
  incomeSummary,
  isPackageDebt,
  isSessionDebt,
  startMs,
  sumPrice,
  type Debtor,
} from "@/lib/analytics";
import { fmtMoney, fmtShortDate, startOfMonth } from "@/lib/time";
import type { ClientDTO, PackageDTO, SessionDTO } from "@/lib/types";
import { DonutChart, type Slice } from "@/components/charts/Charts";

type Range = "month" | "all";

export default function FinanceTab({
  history,
  clients,
  now,
  onReload,
  onToast,
  focusClientId,
  onOptimisticSessionUpdate,
  onOptimisticPackageUpdate,
}: {
  history: SessionDTO[];
  clients: ClientDTO[];
  now: Date;
  onReload: () => void;
  onToast: (msg: string) => void;
  focusClientId?: number | null;
  onOptimisticSessionUpdate?: (id: number, updates: Partial<SessionDTO>) => void;
  onOptimisticPackageUpdate?: (id: number, updates: Partial<PackageDTO>) => void;
}) {
  const [range, setRange] = useState<Range>("month");
  const [busyId, setBusyId] = useState<number | null>(null);

  const monthStart = startOfMonth(now);
  const sum = useMemo(() => incomeSummary(history, monthStart, now), [history, monthStart, now]);
  const debts = useMemo(() => debtSummary(history, clients), [history, clients]);
  const debtors = debts.debtors;
  const series = useMemo(() => dailyEarnings(history, now, 14), [history, now]);

  // Структура денег за период: получено, долги за разовые тренировки, неоплаченные абонементы
  const from = range === "month" ? monthStart.getTime() : Number.NEGATIVE_INFINITY;
  const scoped = history.filter((s) => startMs(s) >= from);
  const received = sumPrice(scoped.filter((s) => s.status === "done" && s.paid));
  const owedSessions = sumPrice(scoped.filter(isSessionDebt));
  const owedPackages = clients
    .flatMap((c) => c.packages)
    .filter((p) => isPackageDebt(p) && new Date(p.createdAt).getTime() >= from)
    .reduce((acc, p) => acc + p.price, 0);

  const slices: Slice[] = [
    { label: "Получено", value: received, color: "#1DB871" },
    { label: "Долг за тренировки", value: owedSessions, color: "#F04452" },
    { label: "Неоплаченные абонементы", value: owedPackages, color: "#FF9F0A" },
  ];
  const totalMoney = received + owedSessions + owedPackages;
  const collectedPct = totalMoney > 0 ? Math.round((received / totalMoney) * 100) : 100;
  const maxBar = Math.max(1, ...series.map((x) => x.sum));

  useEffect(() => {
    if (!focusClientId) return;
    const id = window.setTimeout(() => {
      document.querySelector(`[data-debtor-id="${focusClientId}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
    return () => window.clearTimeout(id);
  }, [focusClientId, debtors]);

  // «Оплачено» закрывает весь долг клиента: разовые тренировки и неоплаченные абонементы
  const payOff = async (d: Debtor) => {
    if (busyId !== null) return;
    d.sessions.forEach((s) => onOptimisticSessionUpdate?.(s.id, { paid: true }));
    d.packages.forEach((p) => onOptimisticPackageUpdate?.(p.id, { paid: true }));
    onToast(`${d.name}: отмечено ${fmtMoney(d.total)}`);

    setBusyId(d.clientId);
    try {
      await Promise.all([
        ...d.sessions.map((s) => patch(`/api/sessions/${s.id}`, { paid: true })),
        ...d.packages.map((p) => patch(`/api/packages/${p.id}`, { paid: true })),
      ]);
      // Занятия по абонементу тоже станут оплаченными — обновляем данные целиком
      if (d.packages.length > 0) onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка сохранения оплаты");
      onReload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3 pb-2">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="tile bg-white p-4">
          <p className="text-[12px] font-medium text-[#5C6B86]">Заработано за месяц</p>
          <p className="num mt-1.5 text-[22px] leading-none text-[#0F1C33]">{fmtMoney(sum.earned)}</p>
          <p className="mt-1.5 text-[11px] font-medium text-[#1DB871]">получено {fmtMoney(sum.received)}</p>
        </div>
        <div className="tile bg-white p-4">
          <p className="text-[12px] font-medium text-[#5C6B86]">Должны сейчас</p>
          <p
            className={`num mt-1.5 text-[22px] leading-none ${debts.total > 0 ? "text-[#F04452]" : "text-[#0F1C33]"}`}
          >
            {fmtMoney(debts.total)}
          </p>
          <p className="mt-1.5 text-[11px] font-medium text-[#9AA6BE]">
            {debtors.length === 0 ? "все рассчитались" : `${debtors.length} чел.`}
          </p>
        </div>
      </div>

      <section className="rounded-[22px] border border-[#E6EAF3] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-[#0F1C33]">Структура денег</h2>
          <div className="flex rounded-full bg-[#F1F3F9] p-0.5">
            {(["month", "all"] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  range === r ? "bg-white text-[#0F1C33] shadow-sm" : "text-[#9AA6BE]"
                }`}
              >
                {r === "month" ? "Месяц" : "Всё время"}
              </button>
            ))}
          </div>
        </div>
        {totalMoney === 0 ? (
          <p className="py-6 text-center text-sm text-[#9AA6BE]">Пока нет проведённых тренировок</p>
        ) : (
          <DonutChart
            slices={slices}
            centerTop={`${collectedPct}%`}
            centerBottom="собрано"
            size={148}
            formatValue={fmtMoney}
          />
        )}
      </section>

      <section className="rounded-[22px] border border-[#E6EAF3] bg-white p-4">
        <h2 className="mb-3 text-[15px] font-bold text-[#0F1C33]">Доход за 14 дней</h2>
        <div className="flex h-28 items-end gap-1">
          {series.map((x) => (
            <div key={x.label} className="flex h-full flex-1 flex-col justify-end" title={`${x.label}: ${fmtMoney(x.sum)}`}>
              <div
                className="bar-grad w-full rounded-t-[5px]"
                style={{ height: `${Math.max(3, (x.sum / maxBar) * 100)}%`, opacity: x.sum > 0 ? 1 : 0.12 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1">
          {series.map((x, i) => (
            <span key={x.label} className="flex-1 text-center text-[8px] text-[#9AA6BE]">
              {i % 2 === 0 ? x.label : ""}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-[#E6EAF3] bg-white p-4">
        <h2 className="mb-1 text-[15px] font-bold text-[#0F1C33]">Кто должен</h2>
        {debtors.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#9AA6BE]">Долгов нет</p>
        ) : (
          <ul className="divide-y divide-[#EFF1F6]">
            {debtors.map((d) => (
              <li
                key={d.clientId}
                data-debtor-id={d.clientId}
                className={`flex items-center gap-3 rounded-xl px-2 py-2.5 transition ${
                  focusClientId === d.clientId ? "bg-[#FDECEF] ring-1 ring-[#F04452]/25" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0F1C33]">{d.name}</p>
                  <p className="truncate text-[11px] text-[#9AA6BE]">
                    {debtorDetails(d)}
                    {d.oldest && ` · с ${fmtShortDate(new Date(d.oldest))}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-[#F04452]">{fmtMoney(d.total)}</span>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => payOff(d)}
                  className="shrink-0 rounded-full bg-[#1DB871] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                >
                  Оплачено
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] border border-[#E6EAF3] bg-white p-4">
        <h2 className="mb-2 text-[15px] font-bold text-[#0F1C33]">Ожидается</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#5C6B86]">Запланировано до конца месяца</span>
          <span className="font-bold tabular-nums text-[#0F1C33]">{fmtMoney(sum.planned)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-[#5C6B86]">Всего проведено тренировок</span>
          <span className="font-bold tabular-nums text-[#0F1C33]">
            {history.filter((s) => s.status === "done").length}
          </span>
        </div>
      </section>
    </div>
  );
}
