"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api, post } from "@/lib/client-api";
import { dayGaps, isActive, startMs } from "@/lib/analytics";
import {
  KINDS,
  MUSCLE_GROUPS,
  WORK_END_HOUR,
  WORK_START_HOUR,
  isMuscleKey,
  type KindKey,
  type MuscleKey,
} from "@/lib/config";
import {
  addDays,
  atMinute,
  dayKey,
  fmtDayLong,
  fmtDuration,
  fmtMinute,
  fmtMoney,
  minuteOfDay,
  parseDayKey,
  startOfDay,
} from "@/lib/time";
import type { ClientDTO, SessionDTO } from "@/lib/types";
import { IconCheck, IconChevronLeft, IconClose, IconPlus } from "@/components/ui/icons";

// ───────── Шаги мастера ─────────
type StepId = "client" | "date" | "time" | "duration" | "muscle" | "kind" | "pay" | "review";

const STEPS: { id: StepId; title: string }[] = [
  { id: "client", title: "Кого записываем?" },
  { id: "date", title: "В какой день?" },
  { id: "time", title: "Во сколько?" },
  { id: "duration", title: "Сколько длится?" },
  { id: "muscle", title: "Что качаем?" },
  { id: "kind", title: "Какой формат?" },
  { id: "pay", title: "Оплата" },
  { id: "review", title: "Всё верно?" },
];
const idx = (id: StepId) => STEPS.findIndex((s) => s.id === id);

const DURATIONS = [30, 45, 60, 75, 90, 120];
const QUARTERS = [0, 15, 30, 45];
const AVATAR_COLORS = ["#F43F5E", "#F97316", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6", "#EAB308"];
const KIND_META: Record<KindKey, { emoji: string; hint: string }> = {
  individual: { emoji: "🏋️", hint: "Один на один" },
  group: { emoji: "👥", hint: "Несколько человек" },
  trial: { emoji: "✨", hint: "Первое знакомство" },
};

export interface CreatorOrigin {
  x: string;
  y: string;
}

// Тактильный отклик: в Telegram через HapticFeedback, в браузере через vibrate
type Haptics = {
  selectionChanged?: () => void;
  notificationOccurred?: (t: "success" | "warning" | "error") => void;
};
export function haptic(kind: "select" | "success" | "warn" = "select") {
  try {
    const h = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: Haptics } } }).Telegram?.WebApp
      ?.HapticFeedback;
    if (h) {
      if (kind === "select") h.selectionChanged?.();
      else h.notificationOccurred?.(kind === "success" ? "success" : "warning");
      return;
    }
    if ("vibrate" in navigator) navigator.vibrate(kind === "select" ? 6 : [12, 40, 12]);
  } catch {
    // тактильный отклик не критичен
  }
}

interface TimelineCreatorProps {
  clients: ClientDTO[];
  history: SessionDTO[];
  viewDay: Date;
  viewSessions: SessionDTO[];
  now: Date;
  initialStart?: Date;
  origin?: CreatorOrigin;
  onDone: (msg: string, session: SessionDTO | null) => void;
  onCancel: () => void;
  onToast: (msg: string) => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export default function TimelineCreator({
  clients,
  history,
  viewDay,
  viewSessions,
  now,
  initialStart,
  origin = { x: "92%", y: "96%" },
  onDone,
  onCancel,
  onToast,
}: TimelineCreatorProps) {
  // Если тапнули по линии — дата и время уже известны, эти шаги пропускаем
  const prefilled = useMemo(() => new Set<StepId>(initialStart ? ["date", "time"] : []), [initialStart]);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [reachedReview, setReachedReview] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clientId, setClientId] = useState<number | null>(null);
  const [newMode, setNewMode] = useState(clients.length === 0);
  const [newName, setNewName] = useState("");
  const [date, setDate] = useState(dayKey(initialStart ?? viewDay));
  const [hour, setHour] = useState<number | null>(initialStart ? initialStart.getHours() : null);
  const [minute, setMinute] = useState<number | null>(initialStart ? minuteOfDay(initialStart) : null);
  const [duration, setDuration] = useState(60);
  const [durationSet, setDurationSet] = useState(false);
  const [muscle, setMuscle] = useState<MuscleKey | null>(null);
  const [kind, setKind] = useState<KindKey | null>(null);
  const [price, setPrice] = useState(1200);
  const [priceTouched, setPriceTouched] = useState(false);
  const [paid, setPaid] = useState<boolean | null>(null);
  const [fetched, setFetched] = useState<{ key: string; list: SessionDTO[] } | null>(null);

  const viewKey = dayKey(viewDay);
  const todayKey = dayKey(now);
  const isTodayPicked = date === todayKey;
  const nowMin = minuteOfDay(now);

  // Тренировки выбранного дня: свои, если день открыт на дашборде, иначе догружаем
  const daySess = date === viewKey ? viewSessions : fetched?.key === date ? fetched.list : [];
  const loadingDay = date !== viewKey && fetched?.key !== date;

  useEffect(() => {
    if (date === viewKey) return;
    let cancelled = false;
    const d = parseDayKey(date);
    api<{ sessions: SessionDTO[] }>(
      `/api/sessions?from=${encodeURIComponent(d.toISOString())}&to=${encodeURIComponent(addDays(d, 1).toISOString())}`,
    )
      .then((r) => !cancelled && setFetched({ key: date, list: r.sessions }))
      .catch(() => !cancelled && setFetched({ key: date, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [date, viewKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(onCancel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const client = clients.find((c) => c.id === clientId) ?? null;
  const activePkg = (c: ClientDTO | null) => c?.packages.filter((p) => p.remainingSessions > 0).at(-1) ?? null;
  const pkg = newMode ? null : activePkg(client);
  const perSessionOf = (c: ClientDTO | null) => {
    const p = activePkg(c);
    return p && p.price > 0 ? Math.round(p.price / p.totalSessions) : 1200;
  };
  const clientName = newMode ? newName.trim() : (client?.name ?? "");
  const lastSession = useMemo(() => {
    if (!clientId) return undefined;
    return [...history]
      .filter((s) => s.clientId === clientId && isActive(s) && startMs(s) < now.getTime())
      .sort((a, b) => startMs(b) - startMs(a))[0];
  }, [clientId, history, now]);

  const conflictsAt = (m: number, dur: number) =>
    daySess.filter((o) => {
      if (!isActive(o)) return false;
      const os = minuteOfDay(new Date(o.startsAt));
      return os < m + dur && m < os + o.durationMin;
    });

  // ───────── Навигация ─────────
  const go = (i: number, d: "fwd" | "back") => {
    haptic("select");
    setDir(d);
    setStep(i);
    if (STEPS[i].id === "review") setReachedReview(true);
  };
  const next = () => {
    if (reachedReview) return go(idx("review"), "fwd");
    for (let i = step + 1; i < STEPS.length; i++) {
      if (!prefilled.has(STEPS[i].id)) return go(i, "fwd");
    }
  };
  const back = () => {
    for (let i = step - 1; i >= 0; i--) {
      if (!prefilled.has(STEPS[i].id)) return go(i, "back");
    }
    close(onCancel);
  };
  function close(cb: () => void) {
    setClosing(true);
    window.setTimeout(cb, 340);
  }

  // ───────── Выборы ─────────
  const pickClient = (c: ClientDTO) => {
    setClientId(c.id);
    setNewMode(false);
    if (!priceTouched) setPrice(perSessionOf(c));
    next();
  };
  const pickKind = (k: KindKey) => {
    setKind(k);
    if (!priceTouched) setPrice(k === "trial" ? 0 : perSessionOf(newMode ? null : client));
    next();
  };
  const pickPaid = (value: boolean) => {
    setPaid(value);
    next();
  };

  const save = async () => {
    if (!clientName) return go(idx("client"), "back");
    if (minute === null) return go(idx("time"), "back");
    setSaving(true);
    try {
      const body = {
        startsAt: atMinute(parseDayKey(date), minute).toISOString(),
        durationMin: duration,
        muscleGroup: muscle ?? "full",
        kind: kind ?? "individual",
        price,
        paid: paid ?? price === 0,
        ...(newMode ? { newClientName: clientName } : { clientId }),
      };
      const res = await post<{ session: SessionDTO }>("/api/sessions", body);
      haptic("success");
      close(() => onDone("Тренировка записана 💪", res.session));
    } catch (e) {
      haptic("warn");
      onToast(e instanceof Error ? e.message : "Не удалось сохранить");
      setSaving(false);
    }
  };

  // ───────── «Хлебные крошки» выбранного ─────────
  const stepPassed = (id: StepId) => reachedReview || step > idx(id) || prefilled.has(id);
  const crumbs: { id: StepId; text: string }[] = [];
  if (clientName) crumbs.push({ id: "client", text: clientName });
  if (stepPassed("date")) crumbs.push({ id: "date", text: shortDay(parseDayKey(date), todayKey) });
  if (minute !== null) crumbs.push({ id: "time", text: fmtMinute(minute) });
  if (durationSet || stepPassed("duration")) crumbs.push({ id: "duration", text: fmtDuration(duration) });
  if (muscle) crumbs.push({ id: "muscle", text: MUSCLE_GROUPS[muscle].label });
  if (kind) crumbs.push({ id: "kind", text: KINDS[kind] });
  if (paid !== null) crumbs.push({ id: "pay", text: price === 0 ? "Бесплатно" : `${fmtMoney(price)}${paid ? " ✓" : ""}` });

  const current = STEPS[step];
  const visibleSteps = STEPS.filter((s) => !prefilled.has(s.id));
  const visibleIndex = visibleSteps.findIndex((s) => s.id === current.id);

  return (
    <div
      className={`wizard-surface absolute inset-0 z-40 flex flex-col overflow-hidden rounded-[28px] ${
        closing ? "wizard-hide" : "wizard-reveal"
      }`}
      style={{ "--ox": origin.x, "--oy": origin.y } as CSSProperties}
    >
      {/* Шапка */}
      <header className="flex shrink-0 items-center gap-2 px-4 pt-4">
        {/* На первом шаге «Назад» скрыт: мастер не закрывается случайным тапом */}
        <button
          type="button"
          onClick={back}
          aria-label="Назад"
          tabIndex={visibleIndex > 0 ? 0 : -1}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/80 text-[#5C6B86] shadow-sm active:scale-90 ${
            visibleIndex > 0 ? "" : "invisible pointer-events-none"
          }`}
        >
          <IconChevronLeft />
        </button>
        <div className="min-w-0 flex-1 text-center leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ios-blue)]">
            Новая тренировка · {visibleIndex + 1}/{visibleSteps.length}
          </p>
          <p key={current.id} className="step-title truncate text-[17px] font-bold text-[#0F1C33]">
            {current.title}
          </p>
        </div>
        <button
          type="button"
          onClick={() => close(onCancel)}
          aria-label="Закрыть"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/80 text-[#5C6B86] shadow-sm active:scale-90"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </header>

      {/* Прогресс */}
      <div className="mt-3 flex shrink-0 gap-1 px-4">
        {visibleSteps.map((s, i) => (
          <span
            key={s.id}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= visibleIndex ? "bg-[var(--ios-blue)]" : "bg-black/10"
            }`}
          />
        ))}
      </div>

      {/* Выбранное */}
      {crumbs.length > 0 && current.id !== "review" && (
        <div className="no-scrollbar mt-2.5 flex shrink-0 gap-1.5 overflow-x-auto px-4">
          {crumbs.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(idx(c.id), idx(c.id) < step ? "back" : "fwd")}
              className="crumb shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#5C6B86] shadow-sm active:scale-95"
            >
              {c.text}
            </button>
          ))}
        </div>
      )}

      {/* Содержимое шага */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <div key={`${current.id}-${step}`} className={dir === "fwd" ? "step-fwd" : "step-back"}>
          {current.id === "client" && (
            <ClientStep
              clients={clients}
              selectedId={clientId}
              newMode={newMode}
              newName={newName}
              activePkg={activePkg}
              onPick={pickClient}
              onNewMode={setNewMode}
              onNewName={setNewName}
              onNext={() => {
                setClientId(null);
                if (!priceTouched) setPrice(1200);
                next();
              }}
            />
          )}

          {current.id === "date" && (
            <DateStep
              now={now}
              viewDay={viewDay}
              selected={date}
              counts={dayCounts(history, viewSessions, viewKey)}
              onPick={(key) => {
                setDate(key);
                next();
              }}
            />
          )}

          {current.id === "time" && (
            <TimeStep
              hour={hour}
              minute={minute}
              duration={duration}
              isToday={isTodayPicked}
              nowMin={nowMin}
              loading={loadingDay}
              sessions={daySess}
              conflictsAt={conflictsAt}
              gaps={dayGaps(
                daySess,
                atMinute(
                  parseDayKey(date),
                  isTodayPicked ? Math.max(WORK_START_HOUR * 60, Math.ceil(nowMin / 15) * 15) : WORK_START_HOUR * 60,
                ),
                atMinute(parseDayKey(date), WORK_END_HOUR * 60),
              ).filter((g) => g.minutes >= 30)}
              onHour={setHour}
              onPick={(m) => {
                setHour(Math.floor(m / 60));
                setMinute(m);
                next();
              }}
            />
          )}

          {current.id === "duration" && (
            <ChipGrid cols={3}>
              {DURATIONS.map((d, i) => {
                const clash = minute !== null && conflictsAt(minute, d).length > 0;
                return (
                  <Chip
                    key={d}
                    i={i}
                    selected={durationSet && duration === d}
                    onClick={() => {
                      setDuration(d);
                      setDurationSet(true);
                      next();
                    }}
                  >
                    <span className="block text-base font-bold">{fmtDuration(d)}</span>
                    <span className={`block text-[11px] ${clash ? "font-semibold text-[#F04452]" : "text-[#5C6B86]"}`}>
                      {clash ? "наложение" : minute !== null ? `до ${fmtMinute(minute + d)}` : " "}
                    </span>
                  </Chip>
                );
              })}
            </ChipGrid>
          )}

          {current.id === "muscle" && (
            <ChipGrid cols={2}>
              {(Object.keys(MUSCLE_GROUPS) as MuscleKey[]).map((k, i) => {
                const m = MUSCLE_GROUPS[k];
                const wasLast = lastSession && isMuscleKey(lastSession.muscleGroup) && lastSession.muscleGroup === k;
                return (
                  <Chip
                    key={k}
                    i={i}
                    selected={muscle === k}
                    accent={m.color}
                    onClick={() => {
                      setMuscle(k);
                      next();
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                      <span className="text-left">
                        <span className="block text-sm font-bold">{m.label}</span>
                        {wasLast && <span className="block text-[10px] font-semibold text-[#5C6B86]">в прошлый раз</span>}
                      </span>
                    </span>
                  </Chip>
                );
              })}
            </ChipGrid>
          )}

          {current.id === "kind" && (
            <div className="space-y-2">
              {(Object.keys(KINDS) as KindKey[]).map((k, i) => (
                <Chip key={k} i={i} selected={kind === k} onClick={() => pickKind(k)}>
                  <span className="flex items-center gap-3 text-left">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#F1F3F9] text-xl">
                      {KIND_META[k].emoji}
                    </span>
                    <span>
                      <span className="block text-base font-bold">{KINDS[k]}</span>
                      <span className="block text-xs text-[#5C6B86]">{KIND_META[k].hint}</span>
                    </span>
                  </span>
                </Chip>
              ))}
            </div>
          )}

          {current.id === "pay" && (
            <PayStep
              price={price}
              perSession={perSessionOf(newMode ? null : client)}
              pkg={pkg}
              onPrice={(v) => {
                setPrice(Math.max(0, v));
                setPriceTouched(true);
              }}
              onPaid={pickPaid}
            />
          )}

          {current.id === "review" && (
            <ReviewStep
              clientName={clientName}
              isNew={newMode}
              date={parseDayKey(date)}
              minute={minute}
              duration={duration}
              muscle={muscle}
              kind={kind}
              price={price}
              paid={paid ?? price === 0}
              pkgLeft={pkg?.remainingSessions ?? null}
              conflicts={minute !== null ? conflictsAt(minute, duration) : []}
              saving={saving}
              onJump={(id) => go(idx(id), "back")}
              onSave={save}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── Мелкие строительные блоки ─────────
function ChipGrid({ cols, children }: { cols: 2 | 3 | 4; children: ReactNode }) {
  const cls = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";
  return <div className={`grid gap-2 ${cls}`}>{children}</div>;
}

function Chip({
  i = 0,
  selected,
  disabled,
  accent,
  tone = "default",
  onClick,
  children,
}: {
  i?: number;
  selected?: boolean;
  disabled?: boolean;
  accent?: string;
  tone?: "default" | "dim" | "bad";
  onClick: () => void;
  children: ReactNode;
}) {
  const toneCls =
    tone === "bad"
      ? "bg-[#FDECEF] border-[#F3C2C7] text-[#0F1C33]"
      : tone === "dim"
        ? "bg-white/50 border-white/60 text-[#9AA6BE]"
        : "bg-white/90 border-white text-[#0F1C33]";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        animationDelay: `${Math.min(i, 16) * 22}ms`,
        ...(selected ? { boxShadow: `0 0 0 2px ${accent ?? "var(--ios-blue)"}` } : null),
      }}
      className={`chip-pop w-full rounded-2xl border px-3 py-3 text-center shadow-sm transition active:scale-[0.96] disabled:opacity-40 ${toneCls}`}
    >
      {children}
    </button>
  );
}

function shortDay(d: Date, todayKey: string) {
  const key = dayKey(d);
  if (key === todayKey) return "Сегодня";
  if (key === dayKey(addDays(parseDayKey(todayKey), 1))) return "Завтра";
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

function dayCounts(history: SessionDTO[], viewSessions: SessionDTO[], viewKey: string) {
  const map = new Map<string, number>();
  for (const s of history) {
    if (!isActive(s)) continue;
    const k = dayKey(new Date(s.startsAt));
    if (k === viewKey) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  map.set(viewKey, viewSessions.filter(isActive).length);
  return map;
}

// ───────── Шаг 1: клиент ─────────
function ClientStep({
  clients,
  selectedId,
  newMode,
  newName,
  activePkg,
  onPick,
  onNewMode,
  onNewName,
  onNext,
}: {
  clients: ClientDTO[];
  selectedId: number | null;
  newMode: boolean;
  newName: string;
  activePkg: (c: ClientDTO | null) => ClientDTO["packages"][number] | null;
  onPick: (c: ClientDTO) => void;
  onNewMode: (v: boolean) => void;
  onNewName: (v: string) => void;
  onNext: () => void;
}) {
  if (newMode) {
    const ok = newName.trim().length > 0;
    return (
      <div className="space-y-3">
        <div className="chip-pop rounded-3xl bg-white/90 p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold text-[#5C6B86]">Имя нового клиента</p>
          <input
            autoFocus
            value={newName}
            onChange={(e) => onNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ok && onNext()}
            placeholder="Например, Анна"
            className="w-full bg-transparent text-2xl font-bold text-[#0F1C33] outline-none placeholder:text-[#C4CCDD]"
          />
        </div>
        <button
          type="button"
          disabled={!ok}
          onClick={onNext}
          className="w-full rounded-2xl bg-[var(--ios-blue)] py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          Дальше →
        </button>
        {clients.length > 0 && (
          <button type="button" onClick={() => onNewMode(false)} className="w-full py-2 text-sm font-semibold text-[#5C6B86]">
            ← Выбрать из списка
          </button>
        )}
      </div>
    );
  }
  return (
    <ChipGrid cols={2}>
      {clients.map((c, i) => {
        const p = activePkg(c);
        return (
          <Chip key={c.id} i={i} selected={selectedId === c.id} onClick={() => onPick(c)}>
            <span className="flex items-center gap-2.5 text-left">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: AVATAR_COLORS[c.id % AVATAR_COLORS.length] }}
              >
                {initials(c.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{c.name}</span>
                <span className={`block truncate text-[11px] ${p && p.remainingSessions <= 1 ? "font-semibold text-amber-600" : "text-[#5C6B86]"}`}>
                  {p ? `осталось ${p.remainingSessions} из ${p.totalSessions}` : "без абонемента"}
                </span>
              </span>
            </span>
          </Chip>
        );
      })}
      <Chip i={clients.length} onClick={() => onNewMode(true)}>
        <span className="flex h-10 items-center justify-center gap-1.5 text-sm font-bold text-[var(--ios-blue)]">
          <IconPlus className="h-4 w-4" /> Новый
        </span>
      </Chip>
    </ChipGrid>
  );
}

// ───────── Шаг 2: дата ─────────
function DateStep({
  now,
  viewDay,
  selected,
  counts,
  onPick,
}: {
  now: Date;
  viewDay: Date;
  selected: string;
  counts: Map<string, number>;
  onPick: (key: string) => void;
}) {
  const today = startOfDay(now);
  const todayKey = dayKey(today);
  const days = Array.from({ length: 16 }, (_, i) => addDays(today, i));
  if (viewDay.getTime() < today.getTime()) days.unshift(viewDay);

  return (
    <div className="space-y-3">
      <ChipGrid cols={4}>
        {days.map((d, i) => {
          const key = dayKey(d);
          const count = counts.get(key) ?? 0;
          const label =
            key === todayKey
              ? "Сегодня"
              : key === dayKey(addDays(today, 1))
                ? "Завтра"
                : d.toLocaleDateString("ru-RU", { weekday: "short" });
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <Chip key={key} i={i} selected={selected === key} onClick={() => onPick(key)}>
              <span className={`block text-[10px] font-semibold uppercase ${weekend ? "text-[#F04452]" : "text-[#5C6B86]"}`}>
                {label}
              </span>
              <span className="block text-xl font-bold leading-tight tabular-nums">{d.getDate()}</span>
              <span className="flex h-2 items-center justify-center gap-0.5">
                {Array.from({ length: Math.min(count, 5) }, (_, j) => (
                  <span key={j} className="h-1 w-1 rounded-full bg-[#F04452]" />
                ))}
              </span>
            </Chip>
          );
        })}
      </ChipGrid>
      <label className="chip-pop relative flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D3D9E8] bg-white/50 py-3 text-sm font-semibold text-[#5C6B86]">
        📅 Другая дата
        <input
          type="date"
          aria-label="Другая дата"
          value={selected}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <p className="text-center text-[11px] text-[#9AA6BE]">Точки = сколько тренировок уже стоит в этот день</p>
    </div>
  );
}

// ───────── Шаг 3: время ─────────
function TimeStep({
  hour,
  minute,
  duration,
  isToday,
  nowMin,
  loading,
  sessions,
  conflictsAt,
  gaps,
  onHour,
  onPick,
}: {
  hour: number | null;
  minute: number | null;
  duration: number;
  isToday: boolean;
  nowMin: number;
  loading: boolean;
  sessions: SessionDTO[];
  conflictsAt: (m: number, dur: number) => SessionDTO[];
  gaps: { start: Date; minutes: number }[];
  onHour: (h: number | null) => void;
  onPick: (m: number) => void;
}) {
  if (loading) return <p className="py-10 text-center text-sm text-[#5C6B86]">Смотрю расписание…</p>;

  if (hour !== null) {
    return (
      <div className="space-y-3">
        <ChipGrid cols={2}>
          {QUARTERS.map((q, i) => {
            const m = hour * 60 + q;
            const clash = conflictsAt(m, duration);
            const past = isToday && m < nowMin;
            return (
              <Chip
                key={q}
                i={i}
                selected={minute === m}
                tone={clash.length ? "bad" : past ? "dim" : "default"}
                onClick={() => onPick(m)}
              >
                <span className="block text-3xl font-bold tabular-nums">{fmtMinute(m)}</span>
                <span className="block truncate text-[11px] font-medium">
                  {clash.length ? `занято: ${clash[0].clientName}` : past ? "уже прошло" : `до ${fmtMinute(m + duration)}`}
                </span>
              </Chip>
            );
          })}
        </ChipGrid>
        <button type="button" onClick={() => onHour(null)} className="w-full py-2 text-sm font-semibold text-[#5C6B86]">
          ← Другой час
        </button>
      </div>
    );
  }

  const hours = Array.from({ length: WORK_END_HOUR - WORK_START_HOUR }, (_, i) => WORK_START_HOUR + i);
  return (
    <div className="space-y-3">
      {gaps.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#5C6B86]">Свободные окна</p>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {gaps.slice(0, 6).map((g, i) => {
              const m = minuteOfDay(g.start);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPick(m)}
                  style={{ animationDelay: `${i * 30}ms` }}
                  className="chip-pop shrink-0 rounded-2xl bg-gradient-to-br from-[#1DB871] to-[#1DB871] px-3.5 py-2 text-left text-white shadow-md shadow-[#1DB871]/25 active:scale-95"
                >
                  <span className="block text-base font-bold tabular-nums">{fmtMinute(m)}</span>
                  <span className="block text-[10px] opacity-90">окно {fmtDuration(g.minutes)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <ChipGrid cols={4}>
        {hours.map((h, i) => {
          const busy = sessions.filter((s) => {
            if (!isActive(s)) return false;
            const sm = minuteOfDay(new Date(s.startsAt));
            return sm < (h + 1) * 60 && h * 60 < sm + s.durationMin;
          }).length;
          const past = isToday && (h + 1) * 60 <= nowMin;
          return (
            <Chip key={h} i={i} tone={past ? "dim" : "default"} selected={minute !== null && Math.floor(minute / 60) === h} onClick={() => onHour(h)}>
              <span className="block text-base font-bold tabular-nums">{fmtMinute(h * 60)}</span>
              <span className="flex h-2 items-center justify-center gap-0.5">
                {Array.from({ length: Math.min(busy, 3) }, (_, j) => (
                  <span key={j} className="h-1 w-1 rounded-full bg-[#F04452]" />
                ))}
              </span>
            </Chip>
          );
        })}
      </ChipGrid>
    </div>
  );
}

// ───────── Шаг 7: оплата ─────────
function PayStep({
  price,
  perSession,
  pkg,
  onPrice,
  onPaid,
}: {
  price: number;
  perSession: number;
  pkg: ClientDTO["packages"][number] | null;
  onPrice: (v: number) => void;
  onPaid: (v: boolean) => void;
}) {
  const quick = Array.from(new Set([perSession, 0, 1000, 1200, 1500, 2000])).slice(0, 6);
  return (
    <div className="space-y-3">
      <div className="chip-pop flex items-center justify-between rounded-3xl bg-white/90 p-3 shadow-sm">
        <button
          type="button"
          onClick={() => onPrice(price - 100)}
          className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F1F3F9] text-2xl font-bold text-[#5C6B86] active:scale-90"
        >
          −
        </button>
        <p className="text-3xl font-bold tabular-nums text-[#0F1C33]">{price === 0 ? "Бесплатно" : fmtMoney(price)}</p>
        <button
          type="button"
          onClick={() => onPrice(price + 100)}
          className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F1F3F9] text-2xl font-bold text-[#5C6B86] active:scale-90"
        >
          +
        </button>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {quick.map((v, i) => (
          <button
            key={v}
            type="button"
            onClick={() => onPrice(v)}
            style={{ animationDelay: `${i * 25}ms` }}
            className={`chip-pop shrink-0 rounded-full px-3 py-1.5 text-xs font-bold shadow-sm active:scale-95 ${
              price === v ? "bg-[#4A5BF0] text-white" : "bg-white/90 text-[#5C6B86]"
            }`}
          >
            {v === 0 ? "0 ₽" : fmtMoney(v)}
            {pkg && v === perSession ? " · абонемент" : ""}
          </button>
        ))}
      </div>

      <div className="space-y-2 pt-1">
        {price === 0 ? (
          <Chip i={1} onClick={() => onPaid(true)}>
            <span className="block text-base font-bold">Дальше →</span>
          </Chip>
        ) : (
          <>
            {pkg && pkg.paid && (
              <Chip i={1} onClick={() => onPaid(true)}>
                <span className="flex items-center gap-3 text-left">
                  <span className="text-2xl">🎟</span>
                  <span>
                    <span className="block text-sm font-bold">По абонементу</span>
                    <span className="block text-xs text-[#5C6B86]">осталось {pkg.remainingSessions} из {pkg.totalSessions}</span>
                  </span>
                </span>
              </Chip>
            )}
            <Chip i={2} onClick={() => onPaid(true)}>
              <span className="flex items-center gap-3 text-left">
                <span className="text-2xl">💳</span>
                <span className="text-sm font-bold">Уже оплатил</span>
              </span>
            </Chip>
            <Chip i={3} onClick={() => onPaid(false)}>
              <span className="flex items-center gap-3 text-left">
                <span className="text-2xl">⏳</span>
                <span className="text-sm font-bold">Оплатит позже</span>
              </span>
            </Chip>
          </>
        )}
      </div>
    </div>
  );
}

// ───────── Шаг 8: проверка ─────────
function ReviewStep({
  clientName,
  isNew,
  date,
  minute,
  duration,
  muscle,
  kind,
  price,
  paid,
  pkgLeft,
  conflicts,
  saving,
  onJump,
  onSave,
}: {
  clientName: string;
  isNew: boolean;
  date: Date;
  minute: number | null;
  duration: number;
  muscle: MuscleKey | null;
  kind: KindKey | null;
  price: number;
  paid: boolean;
  pkgLeft: number | null;
  conflicts: SessionDTO[];
  saving: boolean;
  onJump: (id: StepId) => void;
  onSave: () => void;
}) {
  const m = muscle ? MUSCLE_GROUPS[muscle] : MUSCLE_GROUPS.full;
  const rows: { id: StepId; label: string; value: string }[] = [
    { id: "date", label: "Дата", value: fmtDayLong(date) },
    { id: "time", label: "Время", value: minute !== null ? `${fmtMinute(minute)} – ${fmtMinute(minute + duration)}` : "—" },
    { id: "duration", label: "Длительность", value: fmtDuration(duration) },
    { id: "muscle", label: "Мышцы", value: m.label },
    { id: "kind", label: "Формат", value: kind ? KINDS[kind] : KINDS.individual },
    { id: "pay", label: "Оплата", value: price === 0 ? "Бесплатно" : `${fmtMoney(price)} · ${paid ? "оплачено" : "позже"}` },
  ];
  return (
    <div className="space-y-3">
      <div className="chip-pop overflow-hidden rounded-3xl bg-white shadow-md">
        <div className="flex items-center gap-3 p-4" style={{ background: `linear-gradient(135deg, ${m.color}22, transparent)` }}>
          <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
          <button type="button" onClick={() => onJump("client")} className="min-w-0 text-left">
            <p className="truncate text-xl font-bold text-[#0F1C33]">{clientName}</p>
            <p className="text-xs text-[#5C6B86]">
              {isNew ? "новый клиент" : pkgLeft !== null ? `в абонементе осталось ${pkgLeft}` : "без абонемента"}
            </p>
          </button>
        </div>
        <ul className="divide-y divide-[#EFF1F6]">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onJump(r.id)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left active:bg-[#F1F3F9]"
              >
                <span className="text-xs text-[#5C6B86]">{r.label}</span>
                <span className="text-sm font-semibold text-[#0F1C33]">{r.value}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {conflicts.length > 0 && (
        <p className="chip-pop rounded-2xl bg-[#FDECEF] p-3 text-xs font-medium text-[#B4232E]">
          ⚠️ Наложение: {conflicts.map((c) => `${fmtMinute(minuteOfDay(new Date(c.startsAt)))} ${c.clientName}`).join(", ")}
        </p>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="chip-pop flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ios-blue)] py-4 text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        <IconCheck className="h-5 w-5" />
        {saving ? "Записываю…" : "Записать"}
      </button>
    </div>
  );
}
