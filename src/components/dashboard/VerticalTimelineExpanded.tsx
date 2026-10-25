"use client";

// Полноэкранный ВЕРТИКАЛЬНЫЙ календарь:
//  • естественная прокрутка по времени;
//  • тап по пустому часу — новая тренировка;
//  • тап по блоку — меню действий;
//  • долгое удержание и перетаскивание по вертикали — перенос с шагом 15 минут.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { assignLanes, hasOverlap, isActive } from "@/lib/analytics";
import { blockStyle, LEGEND } from "@/lib/block-style";
import { SNAP_MINUTES, WORK_END_HOUR, WORK_START_HOUR, isMuscleKey, MUSCLE_GROUPS } from "@/lib/config";
import { addDays, atMinute, dayKey, fmtDuration, fmtMinute, fmtMoney, minuteOfDay, parseDayKey } from "@/lib/time";
import type { SessionDTO } from "@/lib/types";
import { IconChevronDown, IconClose, IconPlus, IconTarget } from "@/components/ui/icons";
import { haptic } from "./TimelineCreator";

const RAIL_W = 52;
const HOUR_H = 76;
const PX_PER_MIN = HOUR_H / 60;
const DAY_START = WORK_START_HOUR * 60;
const DAY_END = WORK_END_HOUR * 60;
const CANVAS_H = (DAY_END - DAY_START) * PX_PER_MIN;
const LONG_PRESS_MS = 380;
const TAP_SLOP = 6;
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const snap = (m: number) => Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

interface Item {
  s: SessionDTO;
  lane: number;
  overlap: boolean;
}
interface DragState {
  id: number;
  minute: number;
  dy: number;
}
interface Gesture {
  y: number;
  moved: boolean;
  drag: boolean;
  id: number | null;
  startMinute: number;
  duration: number;
  timer: number | null;
}

interface Props {
  day: Date;
  sessions: SessionDTO[];
  history: SessionDTO[];
  now: Date;
  todayKey: string;
  isToday: boolean;
  highlightId?: number | null;
  onPickDay: (key: string) => void;
  onToday: () => void;
  onOpen: (s: SessionDTO) => void;
  onCreate: (at: Date) => void;
  onMove: (s: SessionDTO, at: Date) => void;
  onClose: () => void;
  createOverlay?: ReactNode;
}

export default function VerticalTimelineExpanded({
  day,
  sessions,
  history,
  now,
  todayKey,
  isToday,
  highlightId,
  onPickDay,
  onToday,
  onOpen,
  onCreate,
  onMove,
  onClose,
  createOverlay,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(360);
  const [drag, setDrag] = useState<DragState | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);

  const key = dayKey(day);
  const weekStart = startOfWeek(day);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const monthName = day.toLocaleDateString("ru-RU", { month: "long" });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of history) {
      if (!isActive(s)) continue;
      const k = dayKey(new Date(s.startsAt));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [history]);

  const layout = useMemo(() => {
    const list = [...sessions].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const lanes = assignLanes(list);
    let laneCount = 1;
    lanes.forEach((n) => {
      laneCount = Math.max(laneCount, n + 1);
    });
    return {
      laneCount,
      items: list.map((s): Item => ({ s, lane: lanes.get(s.id) ?? 0, overlap: hasOverlap(s, list) })),
    };
  }, [sessions]);

  const eventsW = Math.max(100, canvasW - RAIL_W - 12);
  const laneW = eventsW / layout.laneCount;
  const active = sessions.filter(isActive);
  const nowY = isToday ? (minuteOfDay(now) - DAY_START) * PX_PER_MIN : null;

  const [isAligned, setIsAligned] = useState(true);

  const checkAlignment = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !isToday || nowY === null) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const inView = nowY >= top + 30 && nowY <= bottom - 40;
    setIsAligned(inView);
  }, [isToday, nowY]);

  const scrollToNow = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el || nowY === null) return;
    const target = Math.max(0, nowY - el.clientHeight * 0.35);
    el.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
    setIsAligned(true);
  }, [nowY]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setCanvasW(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Открываем около текущего времени или около первой тренировки.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focus = isToday
      ? clamp(minuteOfDay(now), DAY_START, DAY_END)
      : Math.min(...sessions.map((s) => minuteOfDay(new Date(s.startsAt))), 9 * 60);
    const target = Math.max(0, (focus - DAY_START) * PX_PER_MIN - el.clientHeight * 0.28);
    el.scrollTo({ top: target, behavior: "auto" });
  }, [key, isToday, now, sessions]);

  const createAt = (clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const minute = clamp(snap(DAY_START + (clientY - rect.top) / PX_PER_MIN), DAY_START, DAY_END - SNAP_MINUTES);
    onCreate(atMinute(day, minute));
  };

  const beginDrag = (id: number) => {
    const g = gesture.current;
    if (!g || g.id !== id || g.moved) return;
    g.drag = true;
    if (g.timer) clearTimeout(g.timer);
    haptic("select");
    setDrag({ id, minute: g.startMinute, dy: 0 });
  };

  const down = (s: SessionDTO, e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const g: Gesture = {
      y: e.clientY,
      moved: false,
      drag: false,
      id: s.id,
      startMinute: minuteOfDay(new Date(s.startsAt)),
      duration: s.durationMin,
      timer: null,
    };
    g.timer = window.setTimeout(() => beginDrag(s.id), LONG_PRESS_MS);
    gesture.current = g;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dy = e.clientY - g.y;
    if (!g.drag && !g.moved && Math.abs(dy) > TAP_SLOP) {
      g.moved = true;
      if (g.timer) clearTimeout(g.timer);
    }
    if (g.drag) {
      const minute = clamp(snap(g.startMinute + dy / PX_PER_MIN), DAY_START, DAY_END - g.duration);
      setDrag({ id: g.id!, minute, dy });
    } else if (g.moved && scrollRef.current) {
      scrollRef.current.scrollTop -= e.movementY;
      suppressClick.current = true;
    }
  };

  const finish = (s: SessionDTO, e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // not important
    }

    if (g.drag && !cancelled && drag && drag.id === s.id && drag.minute !== g.startMinute) {
      onMove(s, atMinute(day, drag.minute));
      haptic("success");
    } else if (!g.moved && !g.drag && !cancelled) {
      onOpen(s);
    }
    setDrag(null);
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const hours = Array.from({ length: WORK_END_HOUR - WORK_START_HOUR + 1 }, (_, i) => DAY_START + i * 60);
  const monthValue = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F1F3F9]">
      <header className="hero-blue relative shrink-0 overflow-hidden px-5 pb-6 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="hero-pattern pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex items-center justify-between">
          <label className="relative flex cursor-pointer items-center gap-1.5">
            <span className="text-[22px] font-bold capitalize tracking-[-0.02em] text-white">{monthName}</span>
            <IconChevronDown className="h-4 w-4 text-white/70" />
            <input
              type="month"
              aria-label="Выбрать месяц"
              value={monthValue}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m] = e.target.value.split("-").map(Number);
                onPickDay(dayKey(new Date(y, m - 1, Math.min(day.getDate(), 28))));
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <div className="flex items-center gap-2">
            {isToday ? (
              <button
                type="button"
                onClick={() => {
                  haptic("select");
                  scrollToNow(true);
                }}
                aria-label={isAligned ? "Следим за текущим временем" : "Вернуться к текущему времени"}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold transition-all duration-200 active:scale-95 ${
                  isAligned
                    ? "border-2 border-white bg-white text-[#4A5BF0] shadow-sm"
                    : "border-2 border-white/80 bg-transparent text-white"
                }`}
              >
                {isAligned ? (
                  <span className="h-2 w-2 rounded-full bg-[#4A5BF0] shrink-0" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M8 5 3 10l5 5" />
                    <path d="M3 10h8a4 4 0 0 1 4 4v7" />
                  </svg>
                )}
                <span>Сейчас</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onToday}
                className="rounded-full bg-white/18 px-3 py-1.5 text-[12px] font-bold text-white transition active:scale-95"
              >
                Сегодня
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/18 text-white transition active:scale-90"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="no-scrollbar relative -mx-5 mt-4 flex gap-1 overflow-x-auto px-5">
          {week.map((d) => {
            const k = dayKey(d);
            const selected = k === key;
            const count = Math.min(counts.get(k) ?? 0, 3);
            return (
              <button
                key={k}
                type="button"
                onClick={() => onPickDay(k)}
                className={`flex min-w-[49px] flex-1 flex-col items-center rounded-2xl py-2 transition active:scale-95 ${
                  selected ? "bg-white shadow-lg" : ""
                }`}
              >
                <span className={`text-[11px] font-medium ${selected ? "text-[#4A5BF0]" : "text-white/65"}`}>
                  {WEEKDAYS[(d.getDay() + 6) % 7]}
                </span>
                <span className={`num mt-0.5 text-[22px] leading-none ${selected ? "text-[#4A5BF0]" : "text-white"}`}>
                  {d.getDate()}
                </span>
                <span className="mt-1.5 flex h-1.5 gap-1">
                  {Array.from({ length: count }, (_, i) => (
                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-[#4A5BF0]" : "bg-white/80"}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="relative -mt-4 flex min-h-0 flex-1 flex-col rounded-t-[28px] bg-white px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-4">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-bold capitalize tracking-[-0.02em] text-[#0F1C33]">
              {day.toLocaleDateString("ru-RU", { weekday: "long" })}
            </h1>
            <p className="text-[12px] font-medium text-[#9AA6BE]">
              {active.length} клиентов · {fmtMoney(active.reduce((sum, s) => sum + s.price, 0))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCreate(atMinute(day, 10 * 60))}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#4A5BF0] px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95"
          >
            <IconPlus className="h-4 w-4" />
            Записать
          </button>
        </div>

        <div
          ref={scrollRef}
          onScroll={checkAlignment}
          className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div
            ref={canvasRef}
            className="relative min-w-0"
            style={{ height: CANVAS_H }}
            onClick={(e) => {
              if (suppressClick.current) return;
              if ((e.target as Element).closest("[data-vertical-session]")) return;
              createAt(e.clientY);
            }}
          >
            {/* Линейки времени и получасовые линии */}
            {hours.map((m) => {
              const y = (m - DAY_START) * PX_PER_MIN;
              const hour = m % 60 === 0;
              return (
                <div key={m}>
                  <span
                    className="absolute left-0 -translate-y-1/2 text-[10px] font-semibold tabular-nums text-[#9AA6BE]"
                    style={{ top: y }}
                  >
                    {hour ? fmtMinute(m) : ""}
                  </span>
                  <span
                    className="absolute right-0 h-px bg-[#E9EDF5]"
                    style={{ top: y, left: RAIL_W }}
                  />
                </div>
              );
            })}
            {Array.from({ length: (WORK_END_HOUR - WORK_START_HOUR) * 2 }, (_, i) => {
              const y = (i * 30) * PX_PER_MIN;
              return <span key={`half-${i}`} className="absolute right-0 h-px bg-[#F3F5F9]" style={{ top: y, left: RAIL_W }} />;
            })}

            {/* Блоки тренировок */}
            {layout.items.map((it) => {
              const s = it.s;
              const start = minuteOfDay(new Date(s.startsAt));
              const isDrag = drag?.id === s.id;
              const shown = isDrag ? drag.minute : start;
              const top = (shown - DAY_START) * PX_PER_MIN;
              // Тренировка на 30 минут занимает 36px по масштабу, 15 минут — 26px.
              // Держим реальные пропорции времени: если раздувать минимум, блоки слипнутся.
              const h = Math.max(22, s.durationMin * PX_PER_MIN);
              const st = blockStyle(s);
              const cancelled = s.status.startsWith("cancelled");
              const muscle = isMuscleKey(s.muscleGroup) ? MUSCLE_GROUPS[s.muscleGroup].label : "";
              const kindLabel = s.kind === "group" ? "Группа" : s.kind === "trial" ? "Пробное" : "Индив.";
              const compact = h < 43;
              return (
                <div
                  key={s.id}
                  data-vertical-session={s.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => down(s, e)}
                  onPointerMove={move}
                  onPointerUp={(e) => finish(s, e, false)}
                  onPointerCancel={(e) => finish(s, e, true)}
                  style={{
                    left: RAIL_W + it.lane * laneW + 3,
                    top,
                    width: Math.max(8, laneW - 7),
                    height: h,
                    background: st.bg,
                    color: st.fg,
                    opacity: cancelled ? 0.7 : 1,
                    transform: isDrag ? `translateY(${drag.dy}px) scale(1.02)` : undefined,
                    boxShadow: isDrag ? "0 16px 26px -10px rgba(16,28,60,0.45)" : "0 6px 14px -9px rgba(16,28,60,0.35)",
                    outline: it.overlap ? "2px solid #F04452" : undefined,
                    outlineOffset: 1,
                  }}
                    className={`tl-block absolute z-10 overflow-hidden rounded-[14px] ${compact ? "px-1.5 py-0" : "px-2 py-1.5"} ${
                    isDrag ? "z-30" : ""
                  } ${highlightId === s.id ? "block-born" : ""}`}
                >
                  <div className="relative z-10 grid h-full min-w-0 content-center leading-none">
                    <div className="flex min-w-0 items-center gap-1">
                      <span className={`shrink-0 font-bold tabular-nums ${compact ? "text-[8px] leading-[10px]" : "text-[10px]"}`}>
                        {fmtMinute(shown)}–{fmtMinute(shown + s.durationMin)}
                      </span>
                      {!compact && (
                        <span className={`min-w-0 truncate font-bold text-[12px] ${cancelled ? "line-through" : ""}`}>
                          {s.clientName}
                        </span>
                      )}
                    </div>
                    {compact ? (
                      <>
                        <p className={`mt-px min-w-0 truncate font-bold text-[9px] leading-[11px] ${cancelled ? "line-through" : ""}`}>
                          {s.clientName}
                        </p>
                        {h >= 34 && laneW > 86 && (
                          <p className="mt-px min-w-0 truncate text-[8px] leading-[9px] font-medium opacity-90">
                            {muscle} · {kindLabel}{s.price > 0 ? ` · ${fmtMoney(s.price)}` : ""}
                          </p>
                        )}
                      </>
                    ) : (
                      laneW > 86 && h >= 25 && (
                        <p className="mt-[2px] truncate text-[10px] font-medium opacity-85">
                          {muscle} · {kindLabel}{s.price > 0 ? ` · ${fmtMoney(s.price)}` : ""}
                        </p>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {/* Маркер текущего времени: линия идёт через все дорожки, кружок привязан к началу шкалы. */}
            {isToday && nowY !== null && nowY >= 0 && nowY <= CANVAS_H && (
              <div
                className="pointer-events-none absolute z-20 h-[2px]"
                style={{ top: nowY, left: RAIL_W, right: 0 }}
              >
                <span className="absolute inset-x-0 top-0 h-[2px] bg-[#4A5BF0] shadow-[0_1px_3px_rgba(74,91,240,0.25)]" />
                <span className="absolute -left-[5px] -top-[5px] h-3 w-3 rounded-full border-2 border-white bg-[#4A5BF0] shadow-sm" />
                <span className="absolute -top-[16px] right-0 rounded-full bg-[#4A5BF0] px-1.5 py-0.5 text-[9px] font-bold leading-none tabular-nums text-white shadow-sm">
                  {fmtMinute(minuteOfDay(now))}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[10px] font-semibold text-[#7D8AA6]">
              <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
          {isToday && (
            <button
              type="button"
              onClick={() => {
                haptic("select");
                scrollToNow(true);
              }}
              className="ml-1 flex items-center gap-1 text-[10px] font-bold text-[#4A5BF0] transition active:scale-95"
            >
              <IconTarget className="h-3 w-3" /> сейчас
            </button>
          )}
        </div>
      </div>
      {createOverlay}
    </div>
  );
}
