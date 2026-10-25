"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getTelegramDiagnostics, waitForTelegram, post } from "@/lib/client-api";
import { useAppData } from "@/lib/use-app-data";
import { addDays, dayKey, fmtDayLong, fmtMoney, fmtWeekday, parseDayKey } from "@/lib/time";
import { sumPrice, type Reminder } from "@/lib/analytics";
import Sheet from "@/components/ui/Sheet";
import { IconChevronDown } from "@/components/ui/icons";
import BottomNav, { type Tab } from "@/components/BottomNav";
import DayTab from "@/components/dashboard/Dashboard";
import FinanceTab, { collectDebtors } from "@/components/finance/FinanceTab";
import ClientsTab from "@/components/clients/ClientsTab";
import ClientDetail from "@/components/clients/ClientDetail";
import SettingsPanel, { useWidgetPrefs } from "@/components/dashboard/SettingsPanel";
import AppTutorial from "@/components/tutorial/AppTutorial";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import PremiumOffer from "@/components/subscription/PremiumOffer";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// true — показать онбординг в режиме предпросмотра (ничего не сохраняет) при каждом запуске.
// Обычно не нужен: настоящий онбординг открывается сам, когда в базе нет клиентов.
const FORCE_ONBOARDING_PREVIEW = false;

const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

const initialsOf = (name?: string) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "ТР";

function AuthErrorScreen({
  message,
  showGuides,
  onRetry,
}: {
  message: string;
  showGuides: boolean;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const diag = useMemo(() => getTelegramDiagnostics(), []);
  const inTelegram = diag.hasTelegramObject || diag.urlHasTgData;

  const copyDiag = async () => {
    try {
      await navigator.clipboard.writeText(
        `authError=${message} hasTelegram=${diag.hasTelegramObject} hasInitData=${diag.hasInitData} len=${diag.initDataLength} platform=${diag.platform} ver=${diag.version} urlTg=${diag.urlHasTgData}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[#F1F3F9] px-6">
      <div className="w-full max-w-sm rounded-[24px] border border-[#E6EAF3] bg-white p-6 text-center shadow-sm">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-3 text-lg font-bold text-[#0F1C33]">{message}</h1>
        <p className="mt-2 text-sm text-[#5C6B86]">
          {inTelegram
            ? "Telegram открыт, но данные для входа не дошли. Нажми «Попробовать снова», а если не поможет — полностью закрой мини-апп и открой его кнопкой меню бота."
            : "Похоже, страница открыта не внутри Telegram. Открой приложение кнопкой меню бота."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 w-full rounded-full bg-[#4A5BF0] px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
        >
          Попробовать снова
        </button>
        {showGuides && (
          <a
            href="/setup"
            className="mt-2 inline-block rounded-full bg-[#F1F3F9] px-5 py-2.5 text-sm font-semibold text-[#4A5BF0]"
          >
            Как подключить бота
          </a>
        )}
        <button
          type="button"
          onClick={copyDiag}
          className="mt-3 text-[11px] font-medium text-[#9AA6BE] underline"
        >
          {copied ? "Диагностика скопирована ✓" : "Скопировать диагностику для поддержки"}
        </button>
        <p className="mt-1 text-[10px] text-[#C4CCDD]">
          tg:{diag.hasTelegramObject ? "да" : "нет"} · initData:{diag.hasInitData ? `да (${diag.initDataLength})` : "нет"} · {diag.platform} {diag.version}
        </p>
      </div>
    </main>
  );
}

// Лента дней: три недели вокруг выбранного дня, выбранный всегда по центру.
// Листается пальцем, поэтому стрелки «назад/вперёд» в шапке не нужны.
function WeekStrip({
  activeKey,
  todayKey,
  counts,
  onPick,
}: {
  activeKey: string;
  todayKey: string;
  counts: Map<string, number>;
  onPick: (key: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<HTMLButtonElement>(null);
  const base = startOfWeek(parseDayKey(activeKey));
  const days = Array.from({ length: 21 }, (_, i) => addDays(base, i - 7));

  useEffect(() => {
    const box = boxRef.current;
    const sel = selRef.current;
    if (!box || !sel) return;
    box.scrollLeft = sel.offsetLeft - (box.clientWidth - sel.offsetWidth) / 2;
  }, [activeKey]);

  return (
    <div
      ref={boxRef}
      data-tutorial="date-switcher"
      className="no-scrollbar relative -mx-5 mt-3 flex gap-1 overflow-x-auto px-5"
    >
      {days.map((d) => {
        const key = dayKey(d);
        const selected = key === activeKey;
        const isToday = key === todayKey;
        const count = Math.min(counts.get(key) ?? 0, 3);
        return (
          <button
            key={key}
            ref={selected ? selRef : undefined}
            type="button"
            onClick={() => onPick(key)}
            className={`flex w-[46px] shrink-0 flex-col items-center rounded-2xl py-1.5 transition active:scale-95 ${
              selected ? "bg-white shadow-lg" : isToday ? "ring-1 ring-white/45" : ""
            }`}
          >
            <span className={`text-[11px] font-medium ${selected ? "text-[#4A5BF0]" : "text-white/65"}`}>
              {WEEKDAYS[(d.getDay() + 6) % 7]}
            </span>
            <span className={`num mt-0.5 text-[20px] leading-none ${selected ? "text-[#4A5BF0]" : "text-white"}`}>
              {d.getDate()}
            </span>
            <span className="mt-1.5 flex h-1.5 items-center gap-[3px]">
              {Array.from({ length: count }, (_, i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: selected ? "#4A5BF0" : "rgba(255,255,255,0.8)" }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function AppShell({ showGuides = false }: { showGuides?: boolean }) {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>("day");
  const [openClientId, setOpenClientId] = useState<number | null>(null);
  const [financeFocusClientId, setFinanceFocusClientId] = useState<number | null>(null);
  // После «Открыть дашборд» не показываем превью повторно до следующего запуска приложения.
  const [onboardingPreviewOpen, setOnboardingPreviewOpen] = useState(FORCE_ONBOARDING_PREVIEW);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [prefs, setPrefs] = useWidgetPrefs();

  useEffect(() => {
    let cancelled = false;
    let offViewport: (() => void) | undefined;
    (async () => {
      const tg = await waitForTelegram(2500);
      if (cancelled || !tg) return;
      tg.ready?.();
      tg.expand?.();
      tg.setHeaderColor?.("#4A5BF0");
      tg.setBackgroundColor?.("#F1F3F9");
      const applyViewport = () => {
        const h = tg.viewportStableHeight;
        if (h) document.documentElement.style.setProperty("--app-h", `${h}px`);
      };
      applyViewport();
      tg.onEvent?.("viewportChanged", applyViewport);
      offViewport = () => tg.offEvent?.("viewportChanged", applyViewport);
    })();
    return () => {
      cancelled = true;
      offViewport?.();
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((prev) => (prev === msg ? null : prev)), 2200);
  };

  const debtCount = useMemo(
    () => collectDebtors(data.history, data.clients).length,
    [data.history, data.clients],
  );

  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data.history) {
      if (s.status.startsWith("cancelled")) continue;
      const k = dayKey(new Date(s.startsAt));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [data.history]);

  const seedDemo = async () => {
    if (!data.now || !data.todayKey) return;
    try {
      const res = await post<{ seeded: boolean }>("/api/seed", {
        dayStart: parseDayKey(data.todayKey).toISOString(),
        now: data.now.toISOString(),
      });
      showToast(res.seeded ? "Демо-данные загружены" : "База уже не пустая");
      setSettingsOpen(false);
      data.reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  if (data.authError) {
    return <AuthErrorScreen message={data.authError} showGuides={showGuides} onRetry={data.reload} />;
  }

  const { now, todayKey, activeKey } = data;
  if (!now || !todayKey || !activeKey || !data.me) {
    return <div className="grid min-h-dvh place-items-center bg-[#F1F3F9] text-sm text-[#9AA6BE]">Загрузка…</div>;
  }

  // Онбординг открывается, когда в базе нет ни одного клиента — и у нового тренера,
  // и после удаления последнего клиента (сервер при этом сбрасывает onboardingComplete).
  // Флаг нужен, чтобы не зациклиться: если пройти онбординг, не добавив клиентов,
  // он ставится, и дальше тренер попадает на пустой дашборд.
  const needsRealOnboarding = !data.me.onboardingComplete && data.clients.length === 0;
  if (needsRealOnboarding || onboardingPreviewOpen) {
    return (
      <>
        <OnboardingFlow
          trainerName={data.me.name}
          preview={!needsRealOnboarding}
          onPremium={() => setPremiumOpen(true)}
          onDone={() => {
            setOnboardingPreviewOpen(false);
            // После настройки — на главный экран, а не туда, где удалили последнего клиента
            setTab("day");
            setOpenClientId(null);
            if (needsRealOnboarding) data.reload();
          }}
        />
        <PremiumOffer
          open={premiumOpen}
          onClose={() => setPremiumOpen(false)}
          clientCount={data.clients.length}
          tier={data.me.subscriptionTier}
        />
      </>
    );
  }

  const day = parseDayKey(activeKey);
  const isToday = activeKey === todayKey;
  const openClient = data.clients.find((c) => c.id === openClientId) ?? null;
  const earnedMonth = sumPrice(data.history.filter((s) => s.status === "done"));

  const navigateReminder = (r: Reminder) => {
    // Долг за тренировку — финансовое действие: ведём к списку должников.
    if (r.kind === "unpaid") {
      setFinanceFocusClientId(r.clientId ?? null);
      setTab("finance");
      return;
    }
    // Остальные напоминания связаны с абонементом конкретного клиента.
    if (r.clientId) {
      setTab("clients");
      setOpenClientId(r.clientId);
    } else {
      setTab("finance");
    }
  };

  return (
    <main className="app-screen mx-auto flex w-full max-w-md flex-col overflow-hidden bg-[#F1F3F9]">
      {/* Шапка */}
      <div className="hero-blue relative shrink-0 overflow-hidden rounded-b-[30px] px-5 pb-5 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="hero-pattern pointer-events-none absolute inset-0 opacity-60" />

        <div className="relative flex items-center justify-between gap-3">
          {tab === "day" ? (
            <label className="relative block min-w-0 flex-1 cursor-pointer">
              <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65">
                {isToday ? "Сегодня" : "Расписание"} · {fmtWeekday(day)}
              </span>
              <span className="flex items-center gap-1.5 text-[24px] font-bold tracking-[-0.02em] text-white">
                <span className="truncate">{fmtDayLong(day)}</span>
                <IconChevronDown className="h-4 w-4 shrink-0 text-white/70" />
              </span>
              <input
                type="date"
                aria-label="Выбрать дату"
                value={activeKey}
                onChange={(e) => e.target.value && data.setViewKey(e.target.value === todayKey ? null : e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65">
                {tab === "finance" ? "Обзор" : "База"}
              </p>
              <h1 className="truncate text-[24px] font-bold tracking-[-0.02em] text-white">
                {tab === "finance" ? "Финансы" : "Клиенты"}
              </h1>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2">
            {tab === "day" && !isToday && (
              <button
                type="button"
                onClick={() => data.setViewKey(null)}
                className="rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#4A5BF0] transition active:scale-95"
              >
                Сегодня
              </button>
            )}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Профиль и настройки"
              title={data.me?.name ?? ""}
              className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-white text-[13px] font-bold text-[#4A5BF0] transition active:scale-90"
            >
              {data.me?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.me.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsOf(data.me?.name)
              )}
            </button>
          </div>
        </div>

        {tab === "day" ? (
          <WeekStrip
            activeKey={activeKey}
            todayKey={todayKey}
            counts={dayCounts}
            onPick={(key) => data.setViewKey(key === todayKey ? null : key)}
          />
        ) : (
          <p className="relative mt-1 text-[13px] font-medium text-white/75">
            {tab === "finance"
              ? `Заработано: ${fmtMoney(earnedMonth)} · Должников: ${debtCount}`
              : `Всего: ${data.clients.length} · Замеров: ${data.measurements.length}`}
          </p>
        )}
      </div>

      {data.error && (
        <p className="mx-4 mt-3 shrink-0 rounded-2xl border border-[#F3C2C7] bg-[#FDECEF] p-3 text-sm text-[#B4232E]">
          Не удалось загрузить данные: {data.error}
        </p>
      )}

      {/* Вкладка «День» — строго без прокрутки: таймлайн занимает остаток экрана.
          Иначе даже микро-скролл сбивает подсветку тура. Остальные вкладки листаются. */}
      <div
        className={`flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3 ${
          tab === "day" ? "overflow-hidden" : "no-scrollbar overflow-y-auto overscroll-contain"
        }`}
      >
        {tab === "day" && (
          <DayTab
            data={data}
            day={day}
            isToday={isToday}
            prefs={prefs}
            onToast={showToast}
            onSeed={seedDemo}
            onReminderNavigate={navigateReminder}
          />
        )}
        {tab === "finance" && (
          <FinanceTab
            history={data.history}
            clients={data.clients}
            now={now}
            onReload={data.reload}
            onToast={showToast}
            focusClientId={financeFocusClientId}
            onOptimisticSessionUpdate={data.optimisticUpdateSession}
          />
        )}
        {tab === "clients" && (
          <ClientsTab
            clients={data.clients}
            history={data.history}
            measurements={data.measurements}
            now={now}
            onOpen={setOpenClientId}
            onReload={data.reload}
            onToast={showToast}
            subscriptionTier={data.me.subscriptionTier}
            onOpenPremium={() => setPremiumOpen(true)}
          />
        )}
      </div>

      <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-1">
        <BottomNav tab={tab} onChange={setTab} debtCount={debtCount} onProfile={() => setSettingsOpen(true)} />
      </div>

      <Sheet open={openClient !== null} onClose={() => setOpenClientId(null)} title={openClient?.name ?? ""} full>
        {openClient && (
          <ClientDetail
            key={openClient.id}
            client={openClient}
            history={data.history}
            measurements={data.measurements}
            now={now}
            isLastClient={data.clients.length === 1}
            onReload={data.reload}
            onToast={showToast}
            onDeleted={(id, remainingClients) => {
              setOpenClientId(null);
              data.optimisticDeleteClient(id, remainingClients);
              data.reload();
            }}
          />
        )}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки">
        <SettingsPanel
          prefs={prefs}
          onChange={setPrefs}
          onSeed={seedDemo}
          clientCount={data.clients.length}
          subscriptionTier={data.me.subscriptionTier}
          onOpenPremium={() => setPremiumOpen(true)}
          showGuides={showGuides}
          onStartTutorial={() => {
            setSettingsOpen(false);
            setTab("day");
            setTimeout(() => setTutorialOpen(true), 250);
          }}
        />
      </Sheet>

      <AppTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} onSwitchTab={setTab} />

      <PremiumOffer
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
        clientCount={data.clients.length}
        tier={data.me.subscriptionTier}
      />

      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0F1C33]/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
