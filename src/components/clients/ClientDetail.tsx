"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { del, patch, post } from "@/lib/client-api";
import { confirmAction, downloadFile } from "@/lib/telegram-actions";
import { useBackButton } from "@/lib/back-button";
import { debtSummary, debtorDetails, startMs } from "@/lib/analytics";
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
import { currentPackage, isExpired, packageTitle, sessionsLabel } from "@/lib/packages";
import { fmtMoney, fmtShortDate, parseDayKey } from "@/lib/time";
import type { ClientDTO, MeasurementDTO, PackageDTO, SessionDTO } from "@/lib/types";
import { LineChart } from "@/components/charts/Charts";
import { IconChevronRight, IconPencil, IconPlus, IconRuler } from "@/components/ui/icons";
import { haptic } from "@/components/dashboard/TimelineCreator";
import MeasurementForm from "./MeasurementForm";
import ClientForm from "./ClientForm";
import PackageForm, { type PackageFormMode } from "./PackageForm";
import { avatarColor, initials } from "./ClientsTab";

type View = "stats" | "history" | "visits";

// Что показано в карточке: сама карточка или одна из форм вместо неё
type Mode =
  | { kind: "view" }
  | { kind: "measure" }
  | { kind: "edit" }
  | { kind: "package"; action: PackageFormMode; pkg: PackageDTO | null };

export default function ClientDetail({
  client,
  history,
  measurements,
  now,
  defaultPrice,
  isLastClient = false,
  onReload,
  onToast,
  onDeleted,
}: {
  client: ClientDTO;
  history: SessionDTO[];
  measurements: MeasurementDTO[];
  now: Date;
  // Обычная цена тренировки из профиля — от неё считается цена нового абонемента
  defaultPrice: number;
  // Последний клиент в базе: после удаления приложение откроет онбординг
  isLastClient?: boolean;
  onReload: () => void;
  onToast: (msg: string) => void;
  onDeleted: (clientId: number, remainingClients: number) => void;
}) {
  const [view, setView] = useState<View>("stats");
  const [metric, setMetric] = useState<MetricKey>("weight");
  const [period, setPeriod] = useState<Period>("weeks");
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<boolean | null>(null);
  const confirmRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // «Назад» сначала закрывает форму или подтверждение удаления, потом — саму карточку
  useBackButton(mode.kind !== "view", () => setMode({ kind: "view" }));
  useBackButton(confirmDelete && !deleting, () => setConfirmDelete(false));

  // Форма открывается вместо карточки — показываем её с начала, а не с середины
  useEffect(() => {
    let el = rootRef.current?.parentElement ?? null;
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
    el?.scrollTo({ top: 0 });
  }, [mode.kind]);

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

  const pkg = currentPackage(client);
  const pastPackages = client.packages.filter((p) => p.id !== pkg?.id).reverse();
  const done = sessions.filter((s) => s.status === "done");
  // Долг считаем так же, как на вкладке «Финансы»
  const debtor = useMemo(
    () => debtSummary(history, [client]).byClient.get(client.id) ?? null,
    [history, client],
  );
  const debt = debtor && debtor.total > 0 ? debtor : null;
  // Если весь долг — это неоплаченный текущий абонемент, хватает его карточки с кнопкой оплаты
  const showDebtCard =
    debt !== null && (debt.sessions.length > 0 || debt.packages.some((p) => p.id !== pkg?.id));

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
    const ok = await confirmAction("Значения этого дня пропадут из графиков.", {
      title: "Удалить замер?",
      okText: "Удалить",
      destructive: true,
    });
    if (!ok) return;
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

  const markPackagePaid = async (p: PackageDTO) => {
    setBusy(true);
    try {
      await patch(`/api/packages/${p.id}`, { paid: true });
      haptic("success");
      onToast("Абонемент оплачен");
      onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  // «Оплачено» в карточке долга закрывает всё: разовые тренировки и абонементы
  const settleDebt = async () => {
    if (!debt) return;
    setBusy(true);
    try {
      await Promise.all([
        ...debt.sessions.map((s) => patch(`/api/sessions/${s.id}`, { paid: true })),
        ...debt.packages.map((p) => patch(`/api/packages/${p.id}`, { paid: true })),
      ]);
      haptic("success");
      onToast(`Отмечено ${fmtMoney(debt.total)}`);
      onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка сохранения оплаты");
      onReload();
    } finally {
      setBusy(false);
    }
  };

  const closeForm = (msg?: string) => {
    setMode({ kind: "view" });
    if (msg) {
      onToast(msg);
      onReload();
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

  if (mode.kind === "measure") {
    return (
      <div ref={rootRef}>
        <MeasurementForm
          clientId={client.id}
          history={mine}
          today={now}
          onSaved={(msg) => closeForm(msg)}
          onCancel={() => closeForm()}
          onToast={onToast}
        />
      </div>
    );
  }

  if (mode.kind === "edit") {
    return (
      <div ref={rootRef}>
        <ClientForm client={client} onSaved={(msg) => closeForm(msg)} onCancel={() => closeForm()} onToast={onToast} />
      </div>
    );
  }

  if (mode.kind === "package") {
    return (
      <div ref={rootRef}>
        <PackageForm
          mode={mode.action}
          clientId={client.id}
          pkg={mode.pkg}
          defaultPrice={defaultPrice}
          today={now}
          onSaved={(msg) => closeForm(msg)}
          onCancel={() => closeForm()}
          onToast={onToast}
        />
      </div>
    );
  }

  const showHistory = historyOpen ?? pastPackages.some((p) => !p.paid && p.price > 0);

  return (
    <div ref={rootRef} className="space-y-3 pb-3">
      <header className="flex items-start gap-3 rounded-[22px] bg-white p-4 shadow-sm">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: avatarColor(client.id) }}
        >
          {initials(client.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-[#0F1C33]">{client.name}</p>
          {client.phone && (
            <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="block truncate text-xs font-medium text-[#4A5BF0]">
              {client.phone}
            </a>
          )}
          <p className="mt-1 text-[11px] text-[#5C6B86]">
            Проведено {done.length} · {mine.length} замеров
          </p>
          {client.note && (
            <p className="mt-2 line-clamp-3 whitespace-pre-line rounded-xl bg-[#F6F7FB] px-2.5 py-2 text-[12px] leading-relaxed text-[#5C6B86]">
              {client.note}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMode({ kind: "edit" })}
          aria-label="Изменить данные клиента"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F1F3F9] text-[#5C6B86] transition active:scale-90"
        >
          <IconPencil className="h-4 w-4" />
        </button>
      </header>

      {debt && showDebtCard && (
        <section className="flex items-center gap-3 rounded-[22px] border border-[#F3C2C7] bg-[#FDECEF] p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#B4232E]/70">Долг</p>
            <p className="mt-0.5 text-[20px] font-bold leading-tight tabular-nums text-[#B4232E]">{fmtMoney(debt.total)}</p>
            <p className="mt-0.5 truncate text-[11px] text-[#8F2A33]">{debtorDetails(debt)}</p>
          </div>
          <button
            type="button"
            onClick={settleDebt}
            disabled={busy}
            className="shrink-0 rounded-full bg-[#1DB871] px-3.5 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60"
          >
            Оплачено
          </button>
        </section>
      )}

      <PackageCard
        pkg={pkg}
        now={now}
        busy={busy}
        onNew={() => setMode({ kind: "package", action: "new", pkg: null })}
        onRenew={() => pkg && setMode({ kind: "package", action: "renew", pkg })}
        onEdit={() => pkg && setMode({ kind: "package", action: "edit", pkg })}
        onMarkPaid={() => pkg && markPackagePaid(pkg)}
      />

      {pastPackages.length > 0 && (
        <section className="rounded-[22px] bg-white px-4 py-3 shadow-sm">
          <button
            type="button"
            onClick={() => setHistoryOpen(!showHistory)}
            aria-expanded={showHistory}
            className="flex w-full items-center justify-between gap-2 py-1 text-left"
          >
            <span className="text-sm font-bold text-[#0F1C33]">История абонементов</span>
            <span className="flex items-center gap-1 text-[12px] font-medium text-[#9AA6BE]">
              {pastPackages.length}
              <IconChevronRight className={`h-4 w-4 transition-transform ${showHistory ? "rotate-90" : ""}`} />
            </span>
          </button>
          {showHistory && (
            <ul className="mt-1 divide-y divide-[#EFF1F6]">
              {pastPackages.map((p) => {
                const unpaid = !p.paid && p.price > 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setMode({ kind: "package", action: "edit", pkg: p })}
                      className="flex w-full items-center gap-2 py-2.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[#0F1C33]">
                          {packageTitle(p.totalSessions)}
                        </span>
                        <span className="block truncate text-[11px] text-[#9AA6BE]">
                          {fmtMoney(p.price)} · с {fmtShortDate(new Date(p.createdAt))}
                          {p.remainingSessions > 0 ? ` · осталось ${p.remainingSessions}` : " · все проведены"}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          unpaid ? "bg-[#FDECEF] text-[#B4232E]" : "bg-[#E5F7EC] text-[#0E7A47]"
                        }`}
                      >
                        {unpaid ? "не оплачен" : "оплачен"}
                      </span>
                      <IconChevronRight className="h-4 w-4 shrink-0 text-[#C4CCDD]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

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
                Добавьте первый — и здесь появятся графики прогресса
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
              {exporting ? "Готовим таблицу…" : "Скачать замеры для Excel"}
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
                      {s.packageId !== null && " · по абонементу"}
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
        onClick={() => setMode({ kind: "measure" })}
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
              {deleting ? "Удаляем…" : "Удалить"}
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

// Карточка действующего абонемента: остаток, оплата, срок и действия
function PackageCard({
  pkg,
  now,
  busy,
  onNew,
  onRenew,
  onEdit,
  onMarkPaid,
}: {
  pkg: PackageDTO | null;
  now: Date;
  busy: boolean;
  onNew: () => void;
  onRenew: () => void;
  onEdit: () => void;
  onMarkPaid: () => void;
}) {
  const label = <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9AA6BE]">Абонемент</p>;

  if (!pkg) {
    return (
      <section className="rounded-[22px] bg-white p-4 shadow-sm">
        {label}
        <p className="mt-1 text-[15px] font-bold text-[#0F1C33]">Разовые тренировки</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#5C6B86]">
          Клиент платит за каждое занятие. Купит абонемент — оформите его здесь, и занятия будут списываться сами.
        </p>
        <button
          type="button"
          onClick={onNew}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#4A5BF0] py-2.5 text-sm font-bold text-white transition active:scale-[0.98]"
        >
          <IconPlus className="h-4 w-4" />
          Оформить абонемент
        </button>
      </section>
    );
  }

  const ended = pkg.remainingSessions <= 0;
  const expired = isExpired(pkg, now);
  const needsRenewal = ended || expired || pkg.remainingSessions <= 1;
  const usedPct = Math.round(((pkg.totalSessions - pkg.remainingSessions) / pkg.totalSessions) * 100);
  const unpaid = !pkg.paid && pkg.price > 0;

  return (
    <section className="rounded-[22px] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {label}
          {ended ? (
            <p className="mt-1 text-[20px] font-bold text-[#0F1C33]">Закончился</p>
          ) : (
            <p className="mt-1 text-[22px] font-bold leading-tight tabular-nums text-[#0F1C33]">
              {pkg.remainingSessions}
              <span className="text-sm font-medium text-[#9AA6BE]"> из {pkg.totalSessions} осталось</span>
            </p>
          )}
        </div>
        <span
          className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            unpaid ? "bg-[#FDECEF] text-[#B4232E]" : "bg-[#E5F7EC] text-[#0E7A47]"
          }`}
        >
          {unpaid ? "Не оплачен" : "Оплачен"}
        </span>
      </div>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#F1F3F9]">
        <div className="h-full rounded-full bg-[#4A5BF0]" style={{ width: `${usedPct}%` }} />
      </div>

      <p className="mt-2 text-[12px] text-[#5C6B86]">
        {packageTitle(pkg.totalSessions)} · {fmtMoney(pkg.price)}
        {" · "}
        {pkg.expiresAt ? (
          <span className={expired ? "font-semibold text-[#F04452]" : ""}>
            {expired ? "истёк" : "до"} {fmtShortDate(parseDayKey(pkg.expiresAt))}
          </span>
        ) : (
          "бессрочный"
        )}
      </p>
      {ended && <p className="mt-1 text-[12px] text-[#5C6B86]">Все {sessionsLabel(pkg.totalSessions)} проведены.</p>}

      {unpaid && (
        <button
          type="button"
          onClick={onMarkPaid}
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-[#E5F7EC] py-2.5 text-sm font-bold text-[#0E7A47] transition active:scale-[0.98] disabled:opacity-60"
        >
          Отметить оплату · {fmtMoney(pkg.price)}
        </button>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl bg-[#F1F3F9] py-2.5 text-sm font-semibold text-[#5C6B86] transition active:scale-[0.98]"
        >
          Изменить
        </button>
        <button
          type="button"
          onClick={onRenew}
          className={`rounded-xl py-2.5 text-sm font-bold transition active:scale-[0.98] ${
            needsRenewal ? "bg-[#4A5BF0] text-white" : "bg-[#EEF1FF] text-[#4A5BF0]"
          }`}
        >
          Продлить
        </button>
      </div>
    </section>
  );
}
