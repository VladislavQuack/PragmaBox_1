"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { del, patch, post } from "@/lib/client-api";
import { downloadFile } from "@/lib/telegram-actions";
import { startMs } from "@/lib/analytics";
import {
  METRICS,
  PERIODS,
  buildSeries,
  deltaTone,
  fmtDelta,
  fmtMetric,
  latestWithDelta,
  metricDef,
  type MetricKey,
  type Period,
} from "@/lib/metrics";
import { addDays, dayKey, fmtMoney, fmtShortDate, parseDayKey } from "@/lib/time";
import type { ClientDTO, MeasurementDTO, SessionDTO } from "@/lib/types";
import { LineChart } from "@/components/charts/Charts";
import { IconPlus, IconRuler } from "@/components/ui/icons";
import { haptic } from "@/components/dashboard/TimelineCreator";
import MeasurementForm from "./MeasurementForm";
import { avatarColor, initials } from "./ClientsTab";

type View = "stats" | "history" | "visits";

export default function ClientDetail({
  client,
  history,
  measurements,
  now,
  isLastClient = false,
  onReload,
  onToast,
  onDeleted,
}: {
  client: ClientDTO;
  history: SessionDTO[];
  measurements: MeasurementDTO[];
  now: Date;
  // Последний клиент в базе: после удаления приложение откроет онбординг
  isLastClient?: boolean;
  onReload: () => void;
  onToast: (msg: string) => void;
  onDeleted: (clientId: number, remainingClients: number) => void;
}) {
  const [view, setView] = useState<View>("stats");
  const [metric, setMetric] = useState<MetricKey>("weight");
  const [period, setPeriod] = useState<Period>("weeks");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmRef = useRef<HTMLElement>(null);

  // Подтверждение появляется внизу карточки — докручиваем, чтобы кнопки были видны
  useEffect(() => {
    if (confirmDelete) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [confirmDelete]);

  const mine = useMemo(
    () => measurements.filter((m) => m.clientId === client.id),
    [measurements, client.id],
  );
  const sessions = useMemo(
    () => history.filter((s) => s.clientId === client.id).sort((a, b) => startMs(b) - startMs(a)),
    [history, client.id],
  );

  const pkg = client.packages[client.packages.length - 1] ?? null;
  const done = sessions.filter((s) => s.status === "done");
  const debt = done
    .filter((s) => !s.paid && s.price > 0)
    .reduce((acc, s) => acc + s.price, 0);

  const def = metricDef(metric);
  const series = useMemo(() => buildSeries(mine, metric, period), [mine, metric, period]);
  const filled = METRICS.filter((m) => mine.some((x) => x[m.key] !== null));

  // Файл собирает сервер, а скачивает сам Telegram: встроенный браузер Telegram
  // не умеет скачивать файлы, созданные прямо на странице (раньше кнопка молчала).
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { url, fileName } = await post<{ url: string; fileName: string }>(
        `/api/clients/${client.id}/export`,
        {},
      );
      downloadFile(url, fileName, (result) => {
        if (result === "telegram") onToast("Таблица сохраняется");
        else if (result === "browser") onToast("Таблица выгружена");
      });
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Не удалось выгрузить таблицу");
    } finally {
      setExporting(false);
    }
  };

  const removeMeasurement = async (id: number) => {
    if (!window.confirm("Удалить этот замер?")) return;
    setBusy(true);
    try {
      await del(`/api/measurements/${id}`);
      onToast("Замер удалён");
      onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const addPackage = async () => {
    setBusy(true);
    try {
      await post("/api/packages", {
        clientId: client.id,
        title: "Абонемент 8 занятий",
        totalSessions: 8,
        price: 9600,
        paid: false,
        expiresAt: dayKey(addDays(now, 30)),
      });
      onToast("Абонемент создан");
      onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const togglePkgPaid = async () => {
    if (!pkg) return;
    setBusy(true);
    try {
      await patch(`/api/packages/${pkg.id}`, { paid: !pkg.paid });
      onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const askDelete = () => {
    haptic("warn");
    setConfirmDelete(true);
  };

  const removeClient = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await del<{ ok: boolean; remainingClients: number }>(`/api/clients/${client.id}`);
      haptic("success");
      onToast("Клиент удалён");
      onDeleted(client.id, res.remainingClients);
    } catch (e) {
      haptic("warn");
      onToast(e instanceof Error ? e.message : "Не удалось удалить клиента");
      setDeleting(false);
    }
  };

  if (adding) {
    return (
      <MeasurementForm
        clientId={client.id}
        history={mine}
        today={now}
        onSaved={(msg) => {
          setAdding(false);
          onToast(msg);
          onReload();
        }}
        onCancel={() => setAdding(false)}
        onToast={onToast}
      />
    );
  }

  return (
    <div className="space-y-3 pb-3">
      <header className="flex items-center gap-3 rounded-[22px] bg-white p-4 shadow-sm">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: avatarColor(client.id) }}
        >
          {initials(client.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-[#0F1C33]">{client.name}</p>
          {client.phone && <p className="truncate text-xs text-[#5C6B86]">{client.phone}</p>}
          <p className="mt-1 text-[11px] text-[#5C6B86]">
            Проведено {done.length} · {mine.length} замеров
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[20px] bg-white p-3.5 shadow-sm">
          <p className="text-[11px] text-[#5C6B86]">Абонемент</p>
          {pkg ? (
            <>
              <p className="mt-1 text-lg font-bold tabular-nums text-[#0F1C33]">
                {pkg.remainingSessions}
                <span className="text-sm font-medium text-[#9AA6BE]"> из {pkg.totalSessions}</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F1F3F9]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#4A5BF0] to-[#4A5BF0]"
                  style={{
                    width: `${Math.round(((pkg.totalSessions - pkg.remainingSessions) / pkg.totalSessions) * 100)}%`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={togglePkgPaid}
                disabled={busy}
                className={`mt-2 w-full rounded-lg px-2 py-1 text-[11px] font-semibold ${
                  pkg.paid ? "bg-[#E5F7EC] text-[#0E7A47]" : "bg-[#FDECEF] text-[#B4232E]"
                }`}
              >
                {pkg.paid ? "Оплачен ✓" : "Не оплачен"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={addPackage}
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-[#4A5BF0] py-1.5 text-[11px] font-semibold text-white"
            >
              + Абонемент
            </button>
          )}
        </div>

        <div className="rounded-[20px] bg-white p-3.5 shadow-sm">
          <p className="text-[11px] text-[#5C6B86]">Долг</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${debt > 0 ? "text-[#F04452]" : "text-[#0F1C33]"}`}
          >
            {debt > 0 ? fmtMoney(debt) : "нет"}
          </p>
          {pkg?.expiresAt && (
            <p className="mt-2 text-[11px] text-[#5C6B86]">
              Абонемент до {fmtShortDate(parseDayKey(pkg.expiresAt))}
            </p>
          )}
        </div>
      </div>

      <div className="flex rounded-[18px] bg-[#E7EAF3] p-0.5">
        {(
          [
            ["stats", "Показатели"],
            ["history", "Замеры"],
            ["visits", "Тренировки"],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`flex-1 rounded-[16px] py-2 text-xs font-semibold transition ${
              view === key ? "bg-white text-[#0F1C33] shadow-sm" : "text-[#5C6B86]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "stats" && (
        <>
          {mine.length === 0 ? (
            <div className="rounded-[22px] bg-white p-6 text-center shadow-sm">
              <IconRuler className="mx-auto h-7 w-7 text-[#C4CCDD]" />
              <p className="mt-2 text-sm font-semibold text-[#0F1C33]">Замеров ещё нет</p>
              <p className="mt-1 text-xs text-[#5C6B86]">
                Добавь первый — и здесь появятся графики прогресса
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {filled.map((m) => {
                  const info = latestWithDelta(mine, m.key);
                  if (!info) return null;
                  const tone = info.delta === null ? "flat" : deltaTone(info.delta, m);
                  const active = metric === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMetric(m.key)}
                      className={`rounded-[18px] bg-white p-3 text-left shadow-sm transition ${
                        active ? "ring-2" : ""
                      }`}
                      style={active ? { boxShadow: `0 0 0 2px ${m.color}` } : undefined}
                    >
                      <p className="flex items-center gap-1.5 text-[11px] text-[#5C6B86]">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                        {m.label}
                      </p>
                      <p className="mt-1 text-[17px] font-bold tabular-nums text-[#0F1C33]">
                        {fmtMetric(info.value, m)}
                      </p>
                      {info.delta !== null && (
                        <p
                          className={`text-[11px] font-semibold tabular-nums ${
                            tone === "good"
                              ? "text-[#1DB871]"
                              : tone === "bad"
                                ? "text-[#F04452]"
                                : "text-[#9AA6BE]"
                          }`}
                        >
                          {fmtDelta(info.delta, m)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              <section className="rounded-[22px] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-bold text-[#0F1C33]">{def.label}</h3>
                  <div className="flex shrink-0 rounded-full bg-[#F1F3F9] p-0.5">
                    {PERIODS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPeriod(p.key)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                          period === p.key ? "bg-white text-[#0F1C33] shadow-sm" : "text-[#5C6B86]"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <LineChart points={series} color={def.color} unit={def.unit} />
              </section>
            </>
          )}
        </>
      )}

      {view === "history" && (
        <section className="rounded-[22px] bg-white p-4 shadow-sm">
          {mine.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#5C6B86]">Замеров ещё нет</p>
          ) : (
            <ul className="divide-y divide-[#EFF1F6]">
              {[...mine]
                .sort((a, b) => b.takenOn.localeCompare(a.takenOn))
                .map((m) => (
                  <li key={m.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#0F1C33]">
                        {fmtShortDate(parseDayKey(m.takenOn))}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeMeasurement(m.id)}
                        className="text-[11px] font-medium text-[#9AA6BE]"
                      >
                        удалить
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {METRICS.filter((d) => m[d.key] !== null).map((d) => (
                        <span key={d.key} className="text-[11px] tabular-nums text-[#5C6B86]">
                          {d.short} <b className="text-[#0F1C33]">{m[d.key]}</b> {d.unit}
                        </span>
                      ))}
                    </div>
                    {m.note && <p className="mt-1 text-[11px] text-[#5C6B86]">{m.note}</p>}
                  </li>
                ))}
            </ul>
          )}
          {mine.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting}
              className="mt-3 w-full rounded-xl bg-[#F1F3F9] py-2.5 text-xs font-semibold text-[#5C6B86] disabled:opacity-60"
            >
              {exporting ? "Готовим таблицу…" : "Выгрузить таблицей (CSV)"}
            </button>
          )}
        </section>
      )}

      {view === "visits" && (
        <section className="rounded-[22px] bg-white p-4 shadow-sm">
          {sessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#5C6B86]">Тренировок пока нет</p>
          ) : (
            <ul className="divide-y divide-[#EFF1F6]">
              {sessions.slice(0, 40).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0F1C33]">
                      {fmtShortDate(new Date(s.startsAt))}
                    </p>
                    <p className="text-[11px] text-[#5C6B86]">
                      {s.status === "done"
                        ? "проведена"
                        : s.status === "planned"
                          ? "запланирована"
                          : s.status === "no_show"
                            ? "неявка"
                            : "отменена"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${
                      s.price === 0 ? "text-[#9AA6BE]" : s.paid ? "text-[#1DB871]" : "text-[#F04452]"
                    }`}
                  >
                    {s.price === 0 ? "—" : fmtMoney(s.price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition active:scale-[0.98]"
        style={{ background: "var(--ios-blue)", boxShadow: "0 8px 20px -8px rgba(0,122,255,0.7)" }}
      >
        <IconPlus className="h-4 w-4" />
        Добавить замер
      </button>

      {/* Удаление необратимо, поэтому сначала явное подтверждение прямо в карточке */}
      {confirmDelete ? (
        <section
          ref={confirmRef}
          role="alertdialog"
          aria-label={`Удалить клиента ${client.name}`}
          className="animate-fade-in scroll-mb-[max(var(--safe-bottom),24px)] rounded-[22px] border border-[#F3C2C7] bg-[#FDECEF] p-4"
        >
          <p className="text-[15px] font-bold text-[#B4232E]">Удалить клиента «{client.name}»?</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#8F2A33]">
            Вместе с ним удалятся все его тренировки, абонементы и замеры — они пропадут из
            расписания и статистики доходов. Отменить это нельзя.
          </p>
          {isLastClient && (
            <p className="mt-2 rounded-xl bg-white/70 p-2.5 text-[12px] leading-relaxed text-[#5C6B86]">
              Это последний клиент: после удаления приложение заново откроет первичную настройку.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-xl bg-white py-2.5 text-sm font-semibold text-[#5C6B86] transition active:scale-[0.98] disabled:opacity-60"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={removeClient}
              disabled={deleting}
              className="rounded-xl bg-[#F04452] py-2.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {deleting ? "Удаляю…" : "Удалить"}
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={askDelete}
          className="w-full rounded-2xl bg-white py-3.5 text-sm font-semibold text-[#F04452] shadow-sm transition active:scale-[0.98]"
        >
          Удалить клиента
        </button>
      )}
    </div>
  );
}
