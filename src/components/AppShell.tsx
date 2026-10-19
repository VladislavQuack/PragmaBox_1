"use client";

import { useEffect, useMemo, useState } from "react";
import { telegramWebApp, waitForTelegram } from "@/lib/client-api";
import { useAppData } from "@/lib/use-app-data";
import { dayKey, fmtDayLong, fmtWeekday, parseDayKey, addDays } from "@/lib/time";
import Sheet from "@/components/ui/Sheet";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
} from "@/components/ui/icons";
import BottomNav, { type Tab } from "@/components/BottomNav";
import DayTab from "@/components/dashboard/Dashboard";
import FinanceTab, { collectDebtors } from "@/components/finance/FinanceTab";
import ClientsTab from "@/components/clients/ClientsTab";
import ClientDetail from "@/components/clients/ClientDetail";
import SettingsPanel, { useWidgetPrefs } from "@/components/dashboard/SettingsPanel";
import AppTutorial from "@/components/tutorial/AppTutorial";
import { post } from "@/lib/client-api";


export default function AppShell({ showGuides = false }: { showGuides?: boolean }) {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>("day");
  const [openClientId, setOpenClientId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [prefs, setPrefs] = useWidgetPrefs();

  useEffect(() => {
    let cancelled = false;
    let offViewport: (() => void) | undefined;

    (async () => {
      // SDK подключён с async — дожидаемся его, иначе ready() вызовется в пустоту
      const tg = await waitForTelegram(2500);
      if (cancelled || !tg) return;
      tg.ready?.();
      tg.expand?.();
      tg.setHeaderColor?.("#fff1e8");
      tg.setBackgroundColor?.("#fff1e8");

      // Telegram знает точную высоту окна мини-аппа — используем её вместо 100dvh
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
    const backendProblem = data.authError.startsWith("Не удалось завершить вход");
    const signatureProblem = data.authError.startsWith("Подпись");
    const help = backendProblem
      ? "Проверь в Vercel, что DATABASE_URL указывает на нужную PostgreSQL, затем открой /api/health. Если health возвращает ошибку — примени схему к этой же базе командой drizzle-kit push."
      : signatureProblem
        ? "В Vercel должен быть токен именно того бота, из которого открыта кнопка. После изменения токена запусти Redeploy."
        : "Открой мини-апп через кнопку меню бота. Если ты уже так сделал, закрой мини-апп полностью и открой его снова.";

    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="glass-card max-w-sm rounded-[28px] p-6 text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="mt-3 text-lg font-bold text-slate-900">{data.authError}</h1>
          <p className="mt-2 text-sm text-slate-600">{help}</p>
          {showGuides && (
            <a
              href="/setup"
              className="mt-5 inline-block rounded-full px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--ios-blue)" }}
            >
              Как подключить бота
            </a>
          )}
        </div>
      </main>
    );
  }

  const { now, todayKey, activeKey } = data;
  if (!now || !todayKey || !activeKey) {
    return <div className="on-bg-dim grid min-h-dvh place-items-center text-sm">Загрузка…</div>;
  }

  const day = parseDayKey(activeKey);
  const isToday = activeKey === todayKey;
  const openClient = data.clients.find((c) => c.id === openClientId) ?? null;
  const scrolls = tab !== "day";

  return (
    <main className="app-screen mx-auto flex w-full max-w-md flex-col gap-2.5 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-[max(env(safe-area-inset-top),10px)]">
      <header className="flex shrink-0 items-center justify-between gap-2">
        {tab === "day" ? (
          <div data-tutorial="date-switcher" className="flex-1 min-w-0">
            <DateSwitcher
              day={day}
              isToday={isToday}
              onShift={(n) => {
                const next = dayKey(addDays(day, n));
                data.setViewKey(next === todayKey ? null : next);
              }}
              onPick={(key) => data.setViewKey(key === todayKey ? null : key)}
              onToday={() => data.setViewKey(null)}
            />
          </div>
        ) : (
          <h1 className="on-bg flex-1 truncate text-[26px] font-bold tracking-[-0.02em]">
            {tab === "finance" ? "Финансы" : "Клиенты"}
          </h1>
        )}

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={data.me?.name ?? "Настройки"}
          aria-label="Настройки и профиль"
          className="grid h-[46px] w-[46px] shrink-0 place-items-center overflow-hidden rounded-[15px] text-[15px] font-bold text-white transition active:scale-95"
          style={{ background: "var(--ios-blue)", boxShadow: "0 6px 16px -6px rgba(0,122,255,0.6)" }}
        >
          {data.me?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.me.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsOf(data.me?.name)
          )}
        </button>
      </header>

      {data.error && (
        <p className="glass shrink-0 rounded-2xl p-3 text-sm text-rose-700">
          Не удалось загрузить данные: {data.error}
        </p>
      )}

      <div
        className={`flex min-h-0 flex-1 flex-col ${scrolls ? "overflow-y-auto overscroll-contain" : ""}`}
      >
        {tab === "day" && (
          <DayTab
            data={data}
            day={day}
            isToday={isToday}
            prefs={prefs}
            onToast={showToast}
            onSeed={seedDemo}
          />
        )}
        {tab === "finance" && (
          <FinanceTab
            history={data.history}
            clients={data.clients}
            now={now}
            onReload={data.reload}
            onToast={showToast}
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
          />
        )}
      </div>

      <BottomNav tab={tab} onChange={setTab} debtCount={debtCount} />

      <Sheet
        open={openClient !== null}
        onClose={() => setOpenClientId(null)}
        title={openClient?.name ?? ""}
        full
      >
        {openClient && (
          <ClientDetail
            client={openClient}
            history={data.history}
            measurements={data.measurements}
            now={now}
            onReload={data.reload}
            onToast={showToast}
          />
        )}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки">
        <SettingsPanel
          prefs={prefs}
          onChange={setPrefs}
          onSeed={seedDemo}
          showGuides={showGuides}
          onStartTutorial={() => {
            setSettingsOpen(false);
            setTab("day");
            // Небольшая задержка, чтобы шторка закрылась и открылся тур
            setTimeout(() => setTutorialOpen(true), 250);
          }}
        />
      </Sheet>

      <AppTutorial
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        onSwitchTab={setTab}
      />

      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

const initialsOf = (name?: string) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "ТР";

function DateSwitcher({
  day,
  isToday,
  onShift,
  onPick,
  onToday,
}: {
  day: Date;
  isToday: boolean;
  onShift: (n: number) => void;
  onPick: (key: string) => void;
  onToday: () => void;
}) {
  const monthName = day.toLocaleDateString("ru-RU", { month: "long" });

  return (
    <div className="segment-track flex min-w-0 flex-1 items-center gap-1 rounded-full p-1">
      <button
        type="button"
        aria-label="Предыдущий день"
        onClick={() => onShift(-1)}
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-white/90 text-[var(--label-2)] shadow-sm transition active:scale-90"
      >
        <IconChevronLeft />
      </button>

      <label className="relative flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 px-1">
        <span className="num text-[26px] leading-none text-[var(--label)]">{day.getDate()}</span>
        <span className="flex min-w-0 flex-col leading-[1.15]">
          <span className="truncate text-[12px] font-semibold capitalize text-[var(--label)]">
            {monthName}
          </span>
          <span className="truncate text-[12px] font-medium capitalize text-[var(--label-3)]">
            {isToday ? "сегодня" : fmtWeekday(day)}
          </span>
        </span>
        <IconChevronDown className="h-3 w-3 shrink-0 text-[var(--label-3)]" />
        <input
          type="date"
          aria-label="Выбрать дату"
          value={dayKey(day)}
          onChange={(e) => {
            if (e.target.value) onPick(e.target.value);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      {!isToday && (
        <button
          type="button"
          onClick={onToday}
          aria-label="Вернуться на сегодня"
          className="grid h-[38px] shrink-0 place-items-center rounded-full px-3 text-[12px] font-bold text-white transition active:scale-90"
          style={{ background: "var(--ios-blue)" }}
        >
          Сегодня
        </button>
      )}

      <button
        type="button"
        aria-label="Следующий день"
        onClick={() => onShift(1)}
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-white/90 text-[var(--label-2)] shadow-sm transition active:scale-90"
      >
        <IconChevronRight />
      </button>
    </div>
  );
}
