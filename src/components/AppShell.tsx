"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { del, getTelegramDiagnostics, waitForTelegram, post } from "@/lib/client-api";
import { isDemoClient } from "@/lib/demo";
import { confirmAction } from "@/lib/telegram-actions";
import { setupTelegramShell } from "@/lib/telegram-shell";
import { syncBackButton, useBackButton } from "@/lib/back-button";
import { useAppData } from "@/lib/use-app-data";
import { addDays, dayKey, fmtDayLong, fmtMoney, fmtWeekday, parseDayKey, startOfMonth, startOfWeek } from "@/lib/time";
import { debtSummary, incomeSummary, type Reminder } from "@/lib/analytics";
import Sheet from "@/components/ui/Sheet";
import LottiePlayer from "@/components/ui/LottiePlayer";
import { loadPragmaboxAnimation } from "@/components/ui/lotties";
import { IconChevronDown } from "@/components/ui/icons";
import BottomNav, { type Tab } from "@/components/BottomNav";
import DayTab from "@/components/dashboard/Dashboard";
import FinanceTab from "@/components/finance/FinanceTab";
import ClientsTab from "@/components/clients/ClientsTab";
import ClientDetail from "@/components/clients/ClientDetail";
import SettingsPanel, { useWidgetPrefs } from "@/components/dashboard/SettingsPanel";
import AppTutorial from "@/components/tutorial/AppTutorial";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import BetaSheet from "@/components/beta/BetaSheet";
import InstallSheet from "@/components/beta/InstallSheet";
import { planLabel } from "@/lib/subscription";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// true — показать онбординг в режиме предпросмотра (ничего не сохраняет) при каждом запуске.
// Обычно не нужен: настоящий онбординг открывается сам, когда в базе нет клиентов.
const FORCE_ONBOARDING_PREVIEW = false;

// Тур по приложению запускается сам после каждого онбординга. Отметка хранится и в памяти,
// и на устройстве: если закрыть мини-апп до конца тура, он откроется при следующем запуске.
const TUTORIAL_PENDING_KEY = "pragmabox_tutorial_pending_v1";
// Пауза перед туром, чтобы дашборд успел появиться (анимация входа длится около 0,55 с)
const AUTO_TUTORIAL_DELAY_MS = 800;

function rememberTutorialPending(pending: boolean) {
  try {
    if (pending) window.localStorage.setItem(TUTORIAL_PENDING_KEY, "1");
    else window.localStorage.removeItem(TUTORIAL_PENDING_KEY);
  } catch {
    // приватный режим: тур всё равно запустится по отметке в памяти
  }
}

function storedTutorialPending(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

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
            ? "Telegram открыт, но данные для входа не дошли. Нажмите «Попробовать снова», а если не поможет — полностью закройте мини-апп и откройте его кнопкой меню бота."
            : "Похоже, страница открыта не внутри Telegram. Откройте приложение кнопкой меню бота."}
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
  const [betaOpen, setBetaOpen] = useState(false);
  // Окно установки: кнопка «Установить на телефон» в боте (адрес с ?install=1) или карточка в профиле
  const [installOpen, setInstallOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // Онбординг только что пройден: как только появится дашборд, запускаем тур
  const [tutorialPending, setTutorialPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [prefs, setPrefs] = useWidgetPrefs();

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;
    (async () => {
      const tg = await waitForTelegram(2500);
      if (cancelled || !tg) return;
      teardown = setupTelegramShell(tg);
      // Шторку могли открыть до загрузки скрипта Telegram
      syncBackButton();
    })();
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const wantsInstall = params.get("install") === "1" || hash.get("tgWebAppStartParam") === "install";
    if (!wantsInstall) return;
    // Показываем после первого рендера: на сервере адресной строки нет
    const id = window.setTimeout(() => setInstallOpen(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((prev) => (prev === msg ? null : prev)), 2200);
  };

  const debtCount = useMemo(
    () => debtSummary(data.history, data.clients).debtors.length,
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

  // Онбординг открывается, когда в базе нет ни одного клиента — и у нового тренера,
  // и после удаления последнего клиента (сервер при этом сбрасывает onboardingComplete).
  // Флаг нужен, чтобы не зациклиться: если пройти онбординг, не добавив клиентов,
  // он ставится, и дальше тренер попадает на пустой дашборд.
  const needsRealOnboarding = Boolean(data.me && !data.me.onboardingComplete && data.clients.length === 0);
  const dashboardVisible =
    !data.authError &&
    Boolean(data.now && data.todayKey && data.activeKey && data.me) &&
    !needsRealOnboarding &&
    !onboardingPreviewOpen;
  const sheetOpen = betaOpen || installOpen;

  // С вкладок «Финансы», «Клиенты» и «Профиль» «Назад» ведёт на главный экран,
  // а с него — закрывает мини-апп, как обычно в Telegram
  useBackButton(dashboardVisible && tab !== "day" && !tutorialOpen, () => setTab("day"), 0);

  // Автозапуск тура после онбординга. Если поверх открыто окно беты или установки,
  // ждём, пока его закроют, иначе подсветка окажется под ним.
  useEffect(() => {
    if (!dashboardVisible || sheetOpen || tutorialOpen) return;
    if (!tutorialPending && !storedTutorialPending()) return;
    const id = window.setTimeout(() => {
      setTab("day");
      setOpenClientId(null);
      setTutorialPending(false);
      setTutorialOpen(true);
    }, AUTO_TUTORIAL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [dashboardVisible, sheetOpen, tutorialOpen, tutorialPending]);

  const seedDemo = async () => {
    if (!data.now || !data.todayKey) return;
    try {
      const res = await post<{ seeded: boolean }>("/api/seed", {
        dayStart: parseDayKey(data.todayKey).toISOString(),
        now: data.now.toISOString(),
      });
      showToast(res.seeded ? "Демо-данные загружены" : "База уже не пустая");
      // Демо грузят из профиля — сразу показываем результат на главном экране
      if (res.seeded) setTab("day");
      data.reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  // Демо-клиенты в базе: показываем, что это демо, и даём убрать их одной кнопкой
  const hasDemo = data.clients.some(isDemoClient);
  const removeDemo = async () => {
    const ok = await confirmAction(
      "Демо-клиенты удалятся вместе с их тренировками, абонементами и замерами. Ваши клиенты останутся.",
      { title: "Убрать демо-данные?", okText: "Убрать", destructive: true },
    );
    if (!ok) return;
    try {
      await del("/api/seed");
      showToast("Демо-данные убраны");
      setOpenClientId(null);
      data.reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Не удалось убрать демо-данные");
    }
  };

  if (data.authError) {
    return <AuthErrorScreen message={data.authError} showGuides={showGuides} onRetry={data.reload} />;
  }

  const { now, todayKey, activeKey } = data;
  if (!now || !todayKey || !activeKey || !data.me) {
    return (
      <div role="status" aria-label="Загрузка" className="grid min-h-dvh place-items-center bg-[#F1F3F9]">
        {/* Та же анимация, что на первом экране онбординга */}
        <LottiePlayer load={loadPragmaboxAnimation} className="h-36 w-36" />
      </div>
    );
  }

  if (needsRealOnboarding || onboardingPreviewOpen) {
    return (
      <>
        <OnboardingFlow
          trainerName={data.me.name}
          preview={!needsRealOnboarding}
          onBeta={() => setBetaOpen(true)}
          onDone={() => {
            setOnboardingPreviewOpen(false);
            // После настройки — на главный экран, а не туда, где удалили последнего клиента
            setTab("day");
            setOpenClientId(null);
            // Следом сам запускается тур: искать кнопку в профиле не нужно
            rememberTutorialPending(true);
            setTutorialPending(true);
            if (needsRealOnboarding) data.reload();
          }}
        />
        <BetaSheet
          open={betaOpen}
          onClose={() => setBetaOpen(false)}
          onToast={showToast}
          onInstall={() => setInstallOpen(true)}
        />
        <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
        {toast && (
          <div className="pointer-events-none fixed bottom-[calc(var(--safe-bottom)+24px)] left-1/2 z-[140] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0F1C33]/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}
      </>
    );
  }

  const day = parseDayKey(activeKey);
  const isToday = activeKey === todayKey;
  const openClient = data.clients.find((c) => c.id === openClientId) ?? null;
  // Та же сумма, что в плитке «Заработано за месяц» ниже
  const earnedMonth = incomeSummary(data.history, startOfMonth(now), now).earned;
  const monthName = now.toLocaleDateString("ru-RU", { month: "long" });
  const me = data.me;

  // Шапка вкладок, кроме «Дня» (у него своя — с датой и лентой недели)
  const hero =
    tab === "finance"
      ? {
          eyebrow: "Обзор",
          title: "Финансы",
          line: `За ${monthName}: ${fmtMoney(earnedMonth)} · Должников: ${debtCount}`,
        }
      : tab === "clients"
        ? { eyebrow: "База", title: "Клиенты", line: `Всего: ${data.clients.length} · Замеров: ${data.measurements.length}` }
        : {
            eyebrow: "Профиль",
            title: me.name || "Тренер",
            line: [me.username ? `@${me.username}` : null, `PragmaBox ${planLabel(me.subscriptionTier)}`]
              .filter(Boolean)
              .join(" · "),
          };

  const avatar = me.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={me.photoUrl} alt="" className="h-full w-full object-cover" />
  ) : (
    initialsOf(me.name)
  );
  const avatarClass =
    "grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-white text-[13px] font-bold text-[#4A5BF0]";

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
      {/* Шапка. В полноэкранном режиме Telegram синий фон уходит под строку состояния,
          а содержимое начинается ниже плавающих кнопок Telegram (--safe-top). */}
      <div className="hero-blue relative shrink-0 overflow-hidden rounded-b-[30px] px-5 pb-5 pt-[max(var(--safe-top),12px)]">
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65">{hero.eyebrow}</p>
              <h1 className="truncate text-[24px] font-bold tracking-[-0.02em] text-white">{hero.title}</h1>
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
            {tab === "profile" ? (
              <span className={avatarClass} aria-hidden="true">
                {avatar}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setTab("profile")}
                aria-label="Профиль и настройки"
                title={me.name}
                className={`${avatarClass} transition active:scale-90`}
              >
                {avatar}
              </button>
            )}
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
          <p className="relative mt-1 truncate text-[13px] font-medium text-white/75">{hero.line}</p>
        )}
      </div>

      {data.error && (
        <p className="mx-4 mt-3 shrink-0 rounded-2xl border border-[#F3C2C7] bg-[#FDECEF] p-3 text-sm text-[#B4232E]">
          Не удалось загрузить данные: {data.error}
        </p>
      )}

      {/* Все вкладки листаются, шапка и нижняя панель остаются на месте.
          На «Дне» таймлайн не сжимается ниже своего содержимого: в Telegram
          экран низкий, и без прокрутки записи на таймлайне было не разглядеть.
          key: при смене вкладки прокрутка начинается сверху. */}
      <div
        key={tab}
        className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-3 pt-3"
      >
        {tab === "day" && (
          <DayTab
            data={data}
            day={day}
            isToday={isToday}
            prefs={prefs}
            onToast={showToast}
            onSeed={seedDemo}
            hasDemo={hasDemo}
            onRemoveDemo={removeDemo}
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
            onOptimisticPackageUpdate={data.optimisticUpdatePackage}
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
            defaultPrice={data.me.avgSessionPrice}
            onOpenBeta={() => setBetaOpen(true)}
          />
        )}
        {tab === "profile" && (
          <SettingsPanel
            prefs={prefs}
            onChange={setPrefs}
            monthlyGoal={me.monthlyGoal}
            avgSessionPrice={me.avgSessionPrice}
            onReload={data.reload}
            onToast={showToast}
            onSeed={seedDemo}
            canSeed={data.clients.length === 0}
            hasDemo={hasDemo}
            onRemoveDemo={removeDemo}
            onOpenBeta={() => setBetaOpen(true)}
            onInstall={() => setInstallOpen(true)}
            showGuides={showGuides}
            onStartTutorial={() => {
              // Тур подсвечивает элементы главного экрана: сначала переходим на «День»
              setTab("day");
              window.setTimeout(() => setTutorialOpen(true), 250);
            }}
          />
        )}
      </div>

      <div className="shrink-0 px-4 pb-[max(var(--safe-bottom),12px)] pt-1">
        <BottomNav tab={tab} onChange={setTab} debtCount={debtCount} />
      </div>

      <Sheet open={openClient !== null} onClose={() => setOpenClientId(null)} title={openClient?.name ?? ""} full>
        {openClient && (
          <ClientDetail
            key={openClient.id}
            client={openClient}
            history={data.history}
            measurements={data.measurements}
            now={now}
            defaultPrice={me.avgSessionPrice}
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

      <AppTutorial
        open={tutorialOpen}
        onClose={() => {
          // Тур досмотрен или закрыт крестиком — больше сам не запускается
          rememberTutorialPending(false);
          setTutorialOpen(false);
        }}
        onSwitchTab={setTab}
      />

      <BetaSheet
        open={betaOpen}
        onClose={() => setBetaOpen(false)}
        onToast={showToast}
        onInstall={() => setInstallOpen(true)}
      />
      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />

      {toast && (
        <div className="pointer-events-none fixed bottom-[calc(var(--safe-bottom)+96px)] left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0F1C33]/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
