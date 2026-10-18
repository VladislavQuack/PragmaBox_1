"use client";

import { useRef, useState } from "react";
import { patch } from "@/lib/client-api";
import { DAILY_GOAL, WORK_END_HOUR } from "@/lib/config";
import { buildReminders, nextWindow, sumPrice, type Reminder } from "@/lib/analytics";
import { atMinute, dayKey, fmtDayLong, fmtShortDate, fmtTime } from "@/lib/time";
import type { AppData } from "@/lib/use-app-data";
import type { SessionDTO } from "@/lib/types";
import Sheet from "@/components/ui/Sheet";
import TimelineWidget from "./TimelineWidget";
import IncomeWidget from "./IncomeWidget";
import NextWindowWidget from "./NextWindowWidget";
import RemindersWidget from "./RemindersWidget";
import SessionActions from "./SessionActions";
import SessionForm from "./SessionForm";
import TimelineCreator, { haptic, type CreatorOrigin } from "./TimelineCreator";
import type { WidgetPrefs } from "./SettingsPanel";
import { IncomeExpanded, NextExpanded, RemindersExpanded, TimelineExpanded } from "./ExpandedViews";

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
}: {
  data: AppData;
  day: Date;
  isToday: boolean;
  prefs: WidgetPrefs;
  onToast: (msg: string) => void;
  onSeed: () => void;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const { now, todayKey, daySessions, history, clients, loaded, reload } = data;
  if (!now || !todayKey) return null;

  const workEnd = atMinute(day, WORK_END_HOUR * 60);
  const earnedDay = sumPrice(daySessions.filter((s) => s.status === "done"));
  const nextGap = isToday ? nextWindow(daySessions, now, workEnd) : null;
  const reminders: Reminder[] = buildReminders(history, clients, now);
  const actionSession = [...daySessions, ...history].find((s) => s.id === actionId) ?? null;

  // Виджет таймлайна превращается в пошаговый мастер
  const startWizard = (initialStart?: Date, origin?: CreatorOrigin) => {
    if (wizard) return;
    haptic("select");
    setPanel(null);
    setWizard({ key: Date.now(), initialStart, origin });
    timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  // Заливка стартует из кнопки «+» в правом нижнем углу таймлайна
  const openNew = () => startWizard(undefined, { x: "calc(100% - 44px)", y: "calc(100% - 44px)" });

  const finishWizard = (msg: string, created: SessionDTO | null) => {
    setWizard(null);
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
    try {
      await patch(`/api/sessions/${s.id}`, { startsAt: at.toISOString() });
      onToast(`Перенесено на ${fmtTime(at)}`);
      reload();
    } catch (e) {
      onToast(errText(e));
    }
  };

  const markPaid = async (sessionId: number) => {
    try {
      await patch(`/api/sessions/${sessionId}`, { paid: true });
      onToast("Оплата отмечена");
      reload();
    } catch (e) {
      onToast(errText(e));
    }
  };

  const payReminder = async (r: Reminder) => {
    try {
      if (r.kind === "unpaid" && r.sessionId) {
        await markPaid(r.sessionId);
        return;
      }
      if (r.kind === "pkg-unpaid" && r.packageId) {
        await patch(`/api/packages/${r.packageId}`, { paid: true });
        onToast("Абонемент отмечен оплаченным");
        reload();
      }
    } catch (e) {
      onToast(errText(e));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {loaded && clients.length === 0 && (
        <div className="glass-card shrink-0 rounded-[28px] p-5 text-center">
          <p className="font-semibold text-slate-900">Пока пусто</p>
          <p className="mt-1 text-sm text-slate-600">
            Добавь клиента кнопкой «+» или загрузи демо-данные, чтобы увидеть дашборд в деле.
          </p>
          <button
            type="button"
            onClick={onSeed}
            className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Загрузить демо-данные
          </button>
        </div>
      )}

      <div className="grid shrink-0 grid-cols-2 gap-2.5 empty:hidden">
        {prefs.income && (
          <div data-tutorial="income-widget" className="flex flex-col">
            <IncomeWidget
              earned={earnedDay}
              plan={DAILY_GOAL}
              label={isToday ? "сегодня" : fmtShortDate(day)}
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
          <div data-tutorial="reminders-widget" className="col-span-2">
            <RemindersWidget
              reminders={reminders}
              onOpen={() => setPanel("reminders")}
              onAction={payReminder}
            />
          </div>
        )}
      </div>

      {/* Таймлайн забирает всё оставшееся место экрана */}
      <div ref={timelineRef} data-tutorial="timeline-widget" className="flex min-h-0 flex-1 flex-col">
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

      <Sheet
        open={panel === "timeline"}
        onClose={() => setPanel(null)}
        title={`Таймлайн · ${fmtDayLong(day)}`}
        full
      >
        <TimelineExpanded
          day={day}
          sessions={daySessions}
          isToday={isToday}
          now={now}
          onOpen={(s) => setActionId(s.id)}
          onEmpty={(at) => startWizard(at, { x: "50%", y: "50%" })}
        />
      </Sheet>

      <Sheet open={panel === "income"} onClose={() => setPanel(null)} title="Доходы" full>
        <IncomeExpanded history={history} now={now} onPay={(id) => void markPaid(id)} />
      </Sheet>

      <Sheet open={panel === "next"} onClose={() => setPanel(null)} title="Окна и перерывы">
        <NextExpanded day={day} sessions={daySessions} now={now} isToday={isToday} />
      </Sheet>

      <Sheet open={panel === "reminders"} onClose={() => setPanel(null)} title="Напоминания">
        <RemindersExpanded reminders={reminders} onAction={payReminder} />
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
