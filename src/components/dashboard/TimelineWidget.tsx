"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  assignLanes,
  hasOverlap,
  isActive,
  isTopSide,
  sessionBadges,
  sessionTone,
} from "@/lib/analytics";
import { atMinute, dayKey, fmtDayLong, fmtMinute, minuteOfDay } from "@/lib/time";
import { IconExpand, IconPlus, IconTarget } from "@/components/ui/icons";
import {
  MUSCLE_GROUPS,
  PX_PER_HOUR,
  SNAP_MINUTES,
  TIMELINE_HEIGHT,
  WORK_END_HOUR,
  WORK_START_HOUR,
  isMuscleKey,
} from "@/lib/config";
import type { SessionDTO } from "@/lib/types";

const LANE_H = 62;
const AXIS_H = 30;
const SCALE = PX_PER_HOUR / 60;
const DAY_START = WORK_START_HOUR * 60;
const DAY_END = WORK_END_HOUR * 60;
const TRACK_W = (DAY_END - DAY_START) * SCALE;
const DRAG_DELAY = 350;

const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

// Точка статуса на карточке: зелёная — всё ок, жёлтая — ждём оплату, красная — проблема
const TONE_DOT: Record<string, string> = {
  ok: "var(--ios-green)",
  warn: "var(--ios-yellow)",
  bad: "var(--ios-red)",
  muted: "var(--fill-3)",
};
const toneDot = (tone: string) => TONE_DOT[tone] ?? TONE_DOT.muted;

interface TimelineWidgetProps {
  day: Date;
  sessions: SessionDTO[];
  isToday: boolean;
  now: Date;
  onTap: (s: SessionDTO) => void;
  onEmpty: (at: Date, origin: { x: string; y: string }) => void;
  onMove: (s: SessionDTO, at: Date) => void;
  onExpand: () => void;
  onAdd: () => void;
  overlay?: ReactNode;
  highlightId?: number | null;
}

export default function TimelineWidget({
  day,
  sessions,
  isToday,
  now,
  onTap,
  onEmpty,
  onMove,
  onExpand,
  onAdd,
  overlay,
  highlightId,
}: TimelineWidgetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const dayStr = dayKey(day);
  const nowX = (minuteOfDay(now) - DAY_START) * SCALE;

  const layout = useMemo(() => {
    const top = sessions.filter(isTopSide);
    const bottom = sessions.filter((s) => !isTopSide(s));
    const topLanes = assignLanes(top);
    const bottomLanes = assignLanes(bottom);
    const laneCount = (m: Map<number, number>) => Math.max(1, ...Array.from(m.values(), (v) => v + 1));
    const overlapping = new Set(sessions.filter((s) => hasOverlap(s, sessions)).map((s) => s.id));
    return {
      top,
      bottom,
      topLanes,
      bottomLanes,
      topCount: laneCount(topLanes),
      bottomCount: laneCount(bottomLanes),
      overlapping,
    };
  }, [sessions]);

  // Доступная высота области ленты: лента центрируется по вертикали и заполняет весь виджет
  const [areaH, setAreaH] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAreaH(Math.floor(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const contentH = (layout.topCount + layout.bottomCount) * LANE_H + AXIS_H;
  const pad = Math.max(0, Math.floor((areaH - contentH) / 2));
  const topH = pad + layout.topCount * LANE_H;
  const trackH = Math.max(contentH, areaH);

  const scrollTo = (smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    // Текущее время держим на 20% от левого края, раннее утро остаётся слева
    const left = isToday ? nowX - el.clientWidth * 0.2 : 0;
    el.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    scrollTo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStr]);

  // Новая запись: прокручиваем к ней ленту
  useEffect(() => {
    if (!highlightId) return;
    const s = sessions.find((x) => x.id === highlightId);
    const el = scrollRef.current;
    if (!s || !el) return;
    const x = (minuteOfDay(new Date(s.startsAt)) - DAY_START) * SCALE;
    el.scrollTo({ left: Math.max(0, x - el.clientWidth * 0.3), behavior: "smooth" });
  }, [highlightId, sessions]);

  const handleTrackClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = snap(DAY_START + (e.clientX - rect.left) / SCALE);
    // Точка тапа станет центром «заливки» мастера
    const card = sectionRef.current?.getBoundingClientRect();
    const origin = card
      ? { x: `${e.clientX - card.left}px`, y: `${e.clientY - card.top}px` }
      : { x: "50%", y: "50%" };
    onEmpty(atMinute(day, Math.min(Math.max(minute, DAY_START), DAY_END - SNAP_MINUTES)), origin);
  };

  const handleDrag = (s: SessionDTO, deltaMin: number) => {
    const startMin = minuteOfDay(new Date(s.startsAt));
    const target = Math.min(Math.max(startMin + deltaMin, DAY_START), DAY_END - s.durationMin);
    if (target !== startMin) onMove(s, atMinute(day, target));
  };

  const marks = Array.from({ length: (DAY_END - DAY_START) / 30 + 1 }, (_, i) => DAY_START + i * 30);
  const activeCount = sessions.filter(isActive).length;

  return (
    <section
      ref={sectionRef}
      className="frame-card relative flex flex-1 flex-col overflow-hidden p-3.5"
      style={{
        minHeight: TIMELINE_HEIGHT,
        ["--frame-color" as string]: "var(--ios-pink)",
        ["--frame-fill" as string]: "#fff5f7",
      }}
    >
      <header className="mb-1 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[19px] font-bold leading-tight tracking-[-0.02em] text-black">Таймлайн</p>
          <p className="text-[12px] font-medium text-[var(--label-3)]">
            {fmtDayLong(day)} <span className="opacity-50">|</span> {activeCount} клиентов
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isToday && (
            <button
              type="button"
              onClick={() => scrollTo(true)}
              className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-[11px] font-bold shadow-sm transition active:scale-90"
              style={{ color: "var(--ios-pink)" }}
            >
              <IconTarget className="h-3.5 w-3.5" />
              Сейчас
            </button>
          )}
          <button
            type="button"
            onClick={onExpand}
            aria-label="Развернуть таймлайн"
            className="grid h-9 w-9 place-items-center rounded-full text-white transition active:scale-90"
            style={{ background: "var(--ios-pink)", boxShadow: "0 6px 14px -6px rgba(255,45,85,0.7)" }}
          >
            <IconExpand className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="no-scrollbar -mx-4 min-h-0 flex-1 overflow-auto overscroll-contain px-4"
      >
        <div
          className="relative"
          style={{ width: TRACK_W, height: trackH }}
          onClick={handleTrackClick}
        >
          {/* Часовая сетка на всю высоту */}
          {marks
            .filter((m) => m % 60 === 0)
            .map((m) => (
              <div
                key={`grid-${m}`}
                className="pointer-events-none absolute top-0 w-px bg-slate-400/15"
                style={{ left: (m - DAY_START) * SCALE, height: trackH }}
              />
            ))}
          {/* Ось времени */}
          <div
            className="absolute inset-x-0 rounded-full"
            style={{ top: topH + AXIS_H / 2 - 1.5, height: 3, background: "var(--ios-blue)", opacity: 0.85 }}
          />
          {marks.map((m) => {
            const left = (m - DAY_START) * SCALE;
            const isHour = m % 60 === 0;
            return (
              <div key={m}>
                <div
                  className="absolute rounded-full"
                  style={{
                    left,
                    top: topH + AXIS_H / 2 - (isHour ? 7 : 4),
                    height: isHour ? 14 : 8,
                    width: isHour ? 2.5 : 1.5,
                    background: isHour ? "var(--ios-pink)" : "rgba(255,45,85,0.45)",
                  }}
                />
                {isHour && (
                  <span
                    className="absolute -translate-x-1/2 text-[10px] font-bold tabular-nums text-[var(--label-2)]"
                    style={{ left, top: topH + AXIS_H / 2 + 10 }}
                  >
                    {fmtMinute(m)}
                  </span>
                )}
              </div>
            );
          })}

          {/* Блоки над линией: оплачено */}
          {layout.top.map((s) => {
            const lane = layout.topLanes.get(s.id) ?? 0;
            return (
              <SessionBlock
                key={s.id}
                session={s}
                overlap={layout.overlapping.has(s.id)}
                highlight={highlightId === s.id}
                scrollerRef={scrollRef}
                onTap={onTap}
                onDrag={handleDrag}
                style={{
                  left: (minuteOfDay(new Date(s.startsAt)) - DAY_START) * SCALE,
                  top: topH - (lane + 1) * LANE_H + 3,
                  width: Math.max(s.durationMin * SCALE - 3, 72),
                  height: LANE_H - 6,
                }}
              />
            );
          })}

          {/* Блоки под линией: висяки, неоплачено, отмены */}
          {layout.bottom.map((s) => {
            const lane = layout.bottomLanes.get(s.id) ?? 0;
            return (
              <SessionBlock
                key={s.id}
                session={s}
                overlap={layout.overlapping.has(s.id)}
                highlight={highlightId === s.id}
                scrollerRef={scrollRef}
                onTap={onTap}
                onDrag={handleDrag}
                style={{
                  left: (minuteOfDay(new Date(s.startsAt)) - DAY_START) * SCALE,
                  top: topH + AXIS_H + lane * LANE_H + 3,
                  width: Math.max(s.durationMin * SCALE - 3, 72),
                  height: LANE_H - 6,
                }}
              />
            );
          })}

          {/* Линия «сейчас» */}
          {isToday && (
            <div
              className="pointer-events-none absolute z-20"
              style={{ left: nowX, top: 0, height: trackH, width: 2 }}
            >
              <div className="h-full w-0.5 rounded-full bg-rose-500" />
              <div
                className="absolute -left-[4px] h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white"
                style={{ top: topH + AXIS_H / 2 - 5 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Подсказка слева, кнопка «+» в правом нижнем углу виджета */}
      <div className="flex shrink-0 items-end justify-between gap-3 pt-1.5">
        <p className="min-w-0 text-[10px] leading-snug text-[var(--label-3)]">
          {sessions.length === 0
            ? "Свободный день. Тапни по линии или «+», чтобы записать клиента"
            : "Тап: действия · зажать: перенос · тап по линии: запись"}
        </p>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Новая тренировка"
          className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full text-white transition active:scale-90"
          style={{
            background: "var(--ios-blue)",
            boxShadow: "0 8px 20px -6px rgba(0,122,255,0.75), inset 0 0 0 3px rgba(255,255,255,0.35)",
          }}
        >
          <IconPlus className="h-8 w-8" />
        </button>
      </div>

      {overlay}
    </section>
  );
}

interface Gesture {
  x: number;
  y: number;
  dx: number;
  moved: boolean;
  drag: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface SessionBlockProps {
  session: SessionDTO;
  style: CSSProperties;
  overlap: boolean;
  highlight?: boolean;
  scrollerRef: RefObject<HTMLDivElement | null>;
  onTap: (s: SessionDTO) => void;
  onDrag: (s: SessionDTO, deltaMin: number) => void;
}

function SessionBlock({ session: s, style, overlap, highlight, scrollerRef, onTap, onDrag }: SessionBlockProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);

  const cancelled = s.status.startsWith("cancelled");
  const muscle = isMuscleKey(s.muscleGroup) ? MUSCLE_GROUPS[s.muscleGroup] : MUSCLE_GROUPS.full;
  const startMin = minuteOfDay(new Date(s.startsAt));
  const shownMin = dragging ? startMin + snap(dx / SCALE) : startMin;

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const g: Gesture = { x: e.clientX, y: e.clientY, dx: 0, moved: false, drag: false, timer: null };
    // Зажал — включился режим переноса. Двигаешь быстро — это панорамирование таймлайна.
    g.timer = setTimeout(() => {
      if (gesture.current === g && !g.moved) {
        g.drag = true;
        setDragging(true);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
      }
    }, DRAG_DELAY);
    gesture.current = g;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const total = e.clientX - g.x;
    if (!g.drag && !g.moved && (Math.abs(total) > 8 || Math.abs(e.clientY - g.y) > 8)) {
      g.moved = true;
      if (g.timer) clearTimeout(g.timer);
    }
    if (g.drag) {
      g.dx = total;
      setDx(total);
    } else if (g.moved && scrollerRef.current) {
      // Быстрое движение по блоку = обычная прокрутка ленты в обе стороны
      scrollerRef.current.scrollLeft -= e.movementX;
      scrollerRef.current.scrollTop -= e.movementY;
    }
  }

  function finish(aborted: boolean) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    if (g.drag) {
      const delta = snap(g.dx / SCALE);
      if (!aborted && delta !== 0) onDrag(s, delta);
    } else if (!g.moved && !aborted) {
      onTap(s);
    }
    setDragging(false);
    setDx(0);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => finish(false)}
      onPointerCancel={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      style={{
        ...style,
        transform: dragging ? `translateX(${dx}px)` : undefined,
        background: "#fff",
        borderColor: overlap ? "var(--ios-red)" : muscle.color,
        borderWidth: 2,
      }}
      className={`absolute flex touch-none select-none overflow-hidden rounded-2xl border text-left shadow-sm transition-shadow ${
        dragging ? "z-30 scale-[1.04] shadow-xl" : ""
      } ${cancelled ? "opacity-55" : ""} ${highlight ? "block-born z-20" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center px-2 py-1">
        <span className="flex items-center gap-1">
          <span
            className={`text-[11px] font-bold leading-none tabular-nums ${dragging ? "text-[var(--ios-blue)]" : "text-black"}`}
          >
            {fmtMinute(shownMin)}
          </span>
          <span
            className={`truncate text-[11px] font-bold leading-none ${cancelled ? "line-through" : "text-black"}`}
          >
            {s.clientName}
          </span>
          <span
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: toneDot(sessionTone(s)) }}
          />
        </span>
        <div className="mt-1 flex items-center gap-1 text-[10px] leading-none text-[var(--label-3)]">
          <span className="truncate">{muscle.label}</span>
          {sessionBadges(s).map((b, i) => (
            <span key={`${b}-${i}`} className="shrink-0 font-bold">
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
