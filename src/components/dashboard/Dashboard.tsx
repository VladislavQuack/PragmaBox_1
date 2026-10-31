"use client";

import { useEffect, useRef, useState } from "react";
import { patch } from "@/lib/client-api";
import { WORK_END_HOUR } from "@/lib/config";
import { buildReminders, incomeSummary, nextWindow, type Reminder } from "@/lib/analytics";
import { atMinute, dayKey, fmtTime, startOfMonth } from "@/lib/time";
import type { AppData } from "@/lib/use-app-data";
import type { SessionDTO } from "@/lib/types";
import Sheet from "@/components/ui/Sheet";
import TimelineWidget from "./TimelineWidget";
import IncomeWidget from "./IncomeWidget";
import NextWindowWidget from "./NextWindowWidget";
import RemindersWidget from "./RemindersWidget";
import DaySummaryWidget from "./DaySummaryWidget";
import WeekWidget from "./WeekWidget";
import SessionActions from "./SessionActions";
import SessionForm from "./SessionForm";
import TimelineCreator, { haptic, type CreatorOrigin } from "./TimelineCreator";
import type { WidgetPrefs } from "./SettingsPanel";
import { IncomeExpanded, NextExpanded, RemindersExpanded } from "./ExpandedViews";
import VerticalTimelineExpanded from "./VerticalTimelineExpanded";

type Panel = "timeline" | "income" | "next" | "reminders";
interface FormState {
  session?: SessionDTO;
  initialStart?: Date;
}
interface WizardState {
  key: number;
  initialStart?: Date;
  origin?: CreatorOrigin;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Что-то пошло не так");

export default function DayTab({
  data,
  day,
  isToday,
  prefs,
  onToast,
  onSeed,
  hasDemo,
  onRemoveDemo,
  onReminderNavigate,
}: {
  data: AppData;
  day: Date;
  isToday: boolean;
  prefs: WidgetPrefs;
  onToast: (msg: string) => void;
  onSeed: () => void;
  hasDemo: boolean;
  onRemoveDemo: () => void;
  onReminderNavigate: (r: Reminder) => void;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [mapWizard, setMapWizard] = useState<WizardState | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Анимация появления элементов 1 раз за браузерную сессию
  const [isFirstEntry, setIsFirstEntry] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      const KEY = "pragmabox_dash_enter_seen_v1";
      seen = Boolean(window.sessionStorage.getItem(KEY));
      if (!seen) window.sessionStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
    if (!seen) {
      const timer = window.setTimeout(() => setIsFirstEntry(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const { now, todayKey, daySessions, history, clients, loaded, reload } = data;
  if (!now || !todayKey) return null;

  const workEnd = atMinute(day, WORK_END_HOUR * 60);
  const monthIncome = incomeSummary(history, startOfMonth(now), now).earned;
  const monthlyGoal = data.me?.monthlyGoal ?? 30000;
  // Цена разовой тренировки по умолчанию — из онбординга или профиля
  const defaultPrice = data.me?.avgSessionPrice ?? 1500;
  const nextGap = isToday ? nextWindow(daySessions, now, workEnd) : null;
  const reminders: Reminder[] = buildReminders(history, clients, now);
  const actionSession = [...daySessions, ...history].find((s) => s.id === actionId) ?? null;

  // Виджет таймлайна превращается в пошаговый мастер
  const startWizard = (initialStart?: Date, origin?: CreatorOrigin) => {
    if (wizard || mapWizard) return;
    haptic("select");
    setPanel(null);
    setWizard({ key: Date.now(), initialStart, origin });
    timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // Из большого расписания показываем тот же пошаговый мастер нижней шторкой,
  // не закрывая календарь и не возвращая тренера на главный экран.
  const startMapWizard = (initialStart?: Date, origin?: CreatorOrigin) => {
    if (mapWizard || wizard) return;
    haptic("select");
    setMapWizard({ key: Date.now(), initialStart, origin: origin ?? { x: "50%", y: "50%" } });
  };

  // Заливка стартует из кнопки «+» в правом нижнем углу таймлайна
  const openNew = () => startWizard(undefined, { x: "calc(100% - 44px)", y: "calc(100% - 44px)" });

  const finishWizard = (msg: string, created: SessionDTO | null) => {
    setWizard(null);
    setMapWizard(null);
    onToast(msg);
    if (created) {
      const key = dayKey(new Date(created.startsAt));
      data.setViewKey(key === todayKey ? null : key);
      setHighlightId(created.id);
      window.setTimeout(() => setHighlightId((h) => (h === created.id ? null : h)), 2500);
    }
    reload();
  };

  const moveSession = async (s: SessionDTO, at: Date) => {
    const prevStartsAt = s.startsAt;
    const newStartsAt = at.toISOString();

    // 1. Мгновенно двигаем блок в интерфейсе — 0 миллисекунд задержки!
    data.optimisticUpdateSession(s.id, { startsAt: newStartsAt });
    onToast(`Перенесено на ${fmtTime(at)}`);
    haptic("select");

    // 2. Фоновый запрос к серверу без блокировки UI
    try {
      await patch(`/api/sessions/${s.id}`, { startsAt: newStartsAt });
    } catch (e) {
      // Откат при сетевой ошибке
      data.optimisticUpdateSession(s.id, { startsAt: prevStartsAt });
      onToast(errText(e));
      reload();
    }
  };

  const markPaid = async (sessionId: number) => {
    // Мгновенное обновление в памяти
    data.optimisticUpdateSession(sessionId, { paid: true });
    onToast("Оплата отмечена");
    haptic("success");

    try {
      await patch(`/api/sessions/${sessionId}`, { paid: true });
    } catch (e) {
      data.optimisticUpdateSession(sessionId, { paid: false });
      onToast(errText(e));
      reload();
    }
  };

  const markPackagePaid = async (packageId: number) => {
    data.optimisticUpdatePackage(packageId, { paid: true });
    onToast("Абонемент оплачен");
    haptic("success");

    try {
      await patch(`/api/packages/${packageId}`, { paid: true });
    } catch (e) {
      onToast(errText(e));
    }
    // Занятия из абонемента тоже стали оплаченными — берём свежие данные
    reload();
  };

  const followReminder = (r: Reminder) => {
    setPanel(null);
    onReminderNavigate(r);
  };

  return (
    // grow + shrink-0: на высоком экране вкладка заполняет его целиком,
    // на низком — не сжимается, и экран листается
    <div className="flex shrink-0 grow flex-col gap-2">
      {loaded && clients.length === 0 && (
        <div className="glass-card shrink-0 rounded-[28px] p-5 text-center">
          <p className="font-semibold text-[#0F1C33]">Пока пусто</p>
          <p className="mt-1 text-sm text-[#5C6B86]">
            Добавьте клиента кнопкой «+» или загрузите демо-данные, чтобы увидеть дашборд в деле.
          </p>
          <button
            type="button"
            onClick={onSeed}
            className="mt-4 rounded-full bg-[#4A5BF0] px-4 py-2 text-sm font-semibold text-white"
          >
            Загрузить демо-данные
          </button>
        </div>
      )}

      {hasDemo && (
        <div className="flex shrink-0 items-center gap-3 rounded-[20px] border border-[#E6EAF3] bg-white/80 px-4 py-2.5">
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#5C6B86]">
            <span className="font-semibold text-[#0F1C33]">Это демо-данные.</span> Посмотрите, как всё работает, и уберите их,
            когда начнёте вести своих клиентов.
          </p>
          <button
            type="button"
            onClick={onRemoveDemo}
            className="shrink-0 rounded-full bg-[#F1F3F9] px-3 py-1.5 text-[12px] font-bold text-[#4A5BF0] transition active:scale-95"
          >
            Убрать
          </button>
        </div>
      )}

      <div className={`grid shrink-0 grid-cols-2 gap-2 empty:hidden ${isFirstEntry ? "dash-enter-item dash-enter-1" : ""}`}>
        {prefs.income && (
          <div data-tutorial="income-widget" className="flex flex-col">
            <IncomeWidget
              earned={monthIncome}
              plan={monthlyGoal}
              label="за месяц"
              onOpen={() => setPanel("income")}
            />
          </div>
        )}
        {prefs.next && (
          <div data-tutorial="next-window-widget" className="flex flex-col">
            <NextWindowWidget isToday={isToday} now={now} gap={nextGap} onOpen={() => setPanel("next")} />
          </div>
        )}
        {prefs.reminders && (
          <div data-tutorial="reminders-widget" className={`col-span-2 ${isFirstEntry ? "dash-enter-item dash-enter-2" : ""}`}>
            <RemindersWidget
              reminders={reminders}
              onOpen={() => setPanel("reminders")}
              onAction={followReminder}
            />
          </div>
        )}
      </div>

      {/* Таймлайн забирает оставшееся место экрана, но не становится ниже своих записей:
          если места мало, экран листается */}
      <div ref={timelineRef} data-tutorial="timeline-widget" className={`flex shrink-0 grow flex-col ${isFirstEntry ? "dash-enter-item dash-enter-3" : ""}`}>
        <TimelineWidget
          day={day}
          sessions={daySessions}
          isToday={isToday}
          now={now}
          highlightId={highlightId}
          onTap={(s) => setActionId(s.id)}
          onEmpty={(at, origin) => startWizard(at, origin)}
          onMove={moveSession}
          onExpand={() => setPanel("timeline")}
          onAdd={openNew}
          overlay={
            wizard ? (
              <TimelineCreator
                key={wizard.key}
                clients={clients}
                history={history}
                viewDay={day}
                viewSessions={daySessions}
                now={now}
                defaultPrice={defaultPrice}
                initialStart={wizard.initialStart}
                origin={wizard.origin}
                onDone={finishWizard}
                onCancel={() => setWizard(null)}
                onToast={onToast}
              />
            ) : undefined
          }
        />
      </div>

      {/* Под таймлайном — итоги дня и неделя. Главный экран листается как лента карточек,
          а не на пару сантиметров, будто что-то не поместилось. */}
      {(prefs.summary || prefs.week) && (
        <div className={`flex shrink-0 flex-col gap-2 ${isFirstEntry ? "dash-enter-item dash-enter-4" : ""}`}>
          {prefs.summary && (
            <div data-tutorial="day-summary-widget">
              <DaySummaryWidget
                day={day}
                sessions={daySessions}
                isToday={isToday}
                now={now}
                onOpen={() => setPanel("timeline")}
              />
            </div>
          )}
          {prefs.week && (
            <div data-tutorial="week-widget">
              <WeekWidget
                day={day}
                todayKey={todayKey}
                history={history}
                now={now}
                onPickDay={(key) => data.setViewKey(key === todayKey ? null : key)}
              />
            </div>
          )}
        </div>
      )}

      <Sheet open={panel === "timeline"} onClose={() => setPanel(null)} title="Расписание" bare>
        <VerticalTimelineExpanded
          day={day}
          sessions={daySessions}
          history={history}
          now={now}
          isToday={isToday}
          todayKey={todayKey}
          highlightId={highlightId}
          onPickDay={(key) => data.setViewKey(key === todayKey ? null : key)}
          onToday={() => data.setViewKey(null)}
          onOpen={(s: SessionDTO) => setActionId(s.id)}
          onCreate={(at: Date) => startMapWizard(at, { x: "50%", y: "50%" })}
          onMove={moveSession}
          onClose={() => setPanel(null)}
          createOverlay={
            mapWizard ? (
              <div className="fixed inset-0 z-[70] flex items-end justify-center">
                <button
                  type="button"
                  aria-label="Свернуть мастер и вернуться к расписанию"
                  onClick={() => setMapWizard(null)}
                  className="absolute inset-0 bg-[#0F1C33]/22"
                />
                {/* Компактная шторка: тот же мастер, что на дашборде, но не на весь экран */}
                <section className="animate-sheet-up relative h-[min(520px,68dvh)] w-full max-w-md overflow-hidden rounded-t-[28px] bg-white shadow-2xl">
                  <span className="pointer-events-none absolute left-1/2 top-1.5 z-50 h-1.5 w-10 -translate-x-1/2 rounded-full bg-[#D3D9E8]" />
                  <TimelineCreator
                    key={mapWizard.key}
                    clients={clients}
                    history={history}
                    viewDay={day}
                    viewSessions={daySessions}
                    now={now}
                    defaultPrice={defaultPrice}
                    initialStart={mapWizard.initialStart}
                    origin={mapWizard.origin}
                    onDone={finishWizard}
                    onCancel={() => setMapWizard(null)}
                    onToast={onToast}
                  />
                </section>
              </div>
            ) : undefined
          }
        />
      </Sheet>

      <Sheet open={panel === "income"} onClose={() => setPanel(null)} title="Доходы" full>
        <IncomeExpanded
          history={history}
          clients={clients}
          now={now}
          onPay={(id) => void markPaid(id)}
          onPayPackage={(id) => void markPackagePaid(id)}
        />
      </Sheet>

      <Sheet open={panel === "next"} onClose={() => setPanel(null)} title="Окна и перерывы">
        <NextExpanded day={day} sessions={daySessions} now={now} isToday={isToday} />
      </Sheet>

      <Sheet open={panel === "reminders"} onClose={() => setPanel(null)} title="Напоминания">
        <RemindersExpanded reminders={reminders} onAction={followReminder} />
      </Sheet>

      <Sheet open={actionSession !== null} onClose={() => setActionId(null)} title="Тренировка">
        {actionSession && (
          <SessionActions
            session={actionSession}
            onClose={() => setActionId(null)}
            onChanged={() => {
              setActionId(null);
              reload();
            }}
            onOptimisticUpdate={data.optimisticUpdateSession}
            onOptimisticDelete={data.optimisticDeleteSession}
            onEdit={() => {
              setActionId(null);
              setForm({ session: actionSession });
            }}
            onToast={onToast}
          />
        )}
      </Sheet>

      <Sheet open={form !== null} onClose={() => setForm(null)} title="Редактирование">
        {form && (
          <SessionForm
            key={form.session ? `e-${form.session.id}` : `n-${form.initialStart?.getTime() ?? 0}`}
            day={day}
            clients={clients}
            sessions={daySessions}
            editing={form.session}
            initialStart={form.initialStart}
            onSaved={(msg) => {
              setForm(null);
              onToast(msg);
              reload();
            }}
            onToast={onToast}
          />
        )}
      </Sheet>
    </div>
  );
}
