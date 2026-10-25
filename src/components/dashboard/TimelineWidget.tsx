"use client";

import {
  useCallback,
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
} from "@/lib/analytics";
import { atMinute, dayKey, fmtDayLong, fmtMinute, minuteOfDay } from "@/lib/time";
import { IconExpand, IconPlus, IconTarget } from "@/components/ui/icons";
import { haptic } from "./TimelineCreator";
import {
  MUSCLE_GROUPS,
  SNAP_MINUTES,
  WORK_END_HOUR,
  WORK_START_HOUR,
  isMuscleKey,
} from "@/lib/config";
import { blockStyle as blockColors } from "@/lib/block-style";
import type { SessionDTO } from "@/lib/types";

const AXIS_H = 30;
const DAY_START = WORK_START_HOUR * 60;
const DAY_END = WORK_END_HOUR * 60;
const DRAG_DELAY = 350;

const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;



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
  variant?: "card" | "bare";
  hourWidth?: number;
  laneHeight?: number;
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
  variant = "card",
  hourWidth = 100,
  laneHeight = 62,
}: TimelineWidgetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement | HTMLDivElement>(null);
  const dayStr = dayKey(day);
  const SCALE = hourWidth / 60;
  const TRACK_W = (DAY_END - DAY_START) * SCALE;
  const LANE_H = laneHeight;
  const nowX = (minuteOfDay(now) - DAY_START) * SCALE;
  const bare = variant === "bare";

  // Отслеживаем, смотрим ли мы прямо сейчас на временную метку «Сейчас»
  const [isAligned, setIsAligned] = useState(true);

  const checkAlignment = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !isToday) return;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    // Метка времени видна на экране с комфортным запасом
    const inView = nowX >= left + 28 && nowX <= right - 38;
    setIsAligned(inView);
  }, [nowX, isToday]);

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

  const scrollTo = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const left = isToday ? nowX - el.clientWidth * 0.2 : 0;
    el.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
    if (isToday) {
      setIsAligned(true);
    }
  }, [isToday, nowX]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = isToday ? nowX - el.clientWidth * 0.2 : 0;
    el.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [dayStr, isToday, nowX]);

  useEffect(() => {
    if (!highlightId) return;
    const s = sessions.find((x) => x.id === highlightId);
    const el = scrollRef.current;
    if (!s || !el) return;
    const x = (minuteOfDay(new Date(s.startsAt)) - DAY_START) * SCALE;
    el.scrollTo({ left: Math.max(0, x - el.clientWidth * 0.3), behavior: "smooth" });
  }, [highlightId, sessions, SCALE]);

  const handleTrackClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = snap(DAY_START + (e.clientX - rect.left) / SCALE);
    const card = (sectionRef.current as HTMLElement | null)?.getBoundingClientRect();
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

  const track = (
    <div
      ref={scrollRef}
      onScroll={checkAlignment}
      // Карточка: высота 0 + min-height по числу рядов + grow. Все ряды видны всегда,
      // а лишнее место экрана таймлайн забирает себе. Высота содержимого при этом
      // не влияет на размер карточки: иначе, раз растянувшись, она бы уже не сжалась.
      style={bare ? undefined : { minHeight: contentH }}
      className={`no-scrollbar overflow-auto overscroll-x-contain ${bare ? "min-h-0 flex-1" : "-mx-4 h-0 grow px-4"}`}
    >
      <div className="relative" style={{ width: TRACK_W, height: trackH }} onClick={handleTrackClick}>
        {marks
          .filter((m) => m % 60 === 0)
          .map((m) => (
            <div
              key={`grid-${m}`}
              className="pointer-events-none absolute top-0 w-px bg-[#E7EAF3]"
              style={{ left: (m - DAY_START) * SCALE, height: trackH }}
            />
          ))}
        <div
          className="absolute inset-x-0 rounded-full bg-[#E3E8F4]"
          style={{ top: topH + AXIS_H / 2 - 1, height: 2 }}
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
                  top: topH + AXIS_H / 2 - (isHour ? 6 : 3),
                  height: isHour ? 12 : 6,
                  width: 2,
                  background: isHour ? "#C4CCDD" : "#E3E8F4",
                }}
              />
              {isHour && (
                <span
                  className="absolute -translate-x-1/2 text-[10px] font-semibold tabular-nums text-[#9AA6BE]"
                  style={{ left, top: topH + AXIS_H / 2 + 9 }}
                >
                  {fmtMinute(m)}
                </span>
              )}
            </div>
          );
        })}

        {layout.top.map((s) => {
          const lane = layout.topLanes.get(s.id) ?? 0;
          return (
            <SessionBlock
              key={s.id}
              session={s}
              overlap={layout.overlapping.has(s.id)}
              highlight={highlightId === s.id}
              scrollerRef={scrollRef}
              scale={SCALE}
              onTap={onTap}
              onDrag={handleDrag}
              style={{
                left: (minuteOfDay(new Date(s.startsAt)) - DAY_START) * SCALE,
                top: topH - (lane + 1) * LANE_H + 3,
                width: Math.max(s.durationMin * SCALE - 4, 84),
                height: LANE_H - 6,
              }}
            />
          );
        })}

        {layout.bottom.map((s) => {
          const lane = layout.bottomLanes.get(s.id) ?? 0;
          return (
            <SessionBlock
              key={s.id}
              session={s}
              overlap={layout.overlapping.has(s.id)}
              highlight={highlightId === s.id}
              scrollerRef={scrollRef}
              scale={SCALE}
              onTap={onTap}
              onDrag={handleDrag}
              style={{
                left: (minuteOfDay(new Date(s.startsAt)) - DAY_START) * SCALE,
                top: topH + AXIS_H + lane * LANE_H + 3,
                width: Math.max(s.durationMin * SCALE - 4, 84),
                height: LANE_H - 6,
              }}
            />
          );
        })}

        {isToday && (
          <div className="pointer-events-none absolute z-20" style={{ left: nowX, top: 0, height: trackH, width: 2 }}>
            <div className="h-full w-[2.5px] rounded-full bg-[#4A5BF0]" />
            <div
              className="absolute -left-[4px] h-2.5 w-2.5 rounded-full bg-[#4A5BF0] ring-2 ring-white"
              style={{ top: topH + AXIS_H / 2 - 5 }}
            />
          </div>
        )}
      </div>
    </div>
  );

  if (bare) {
    return (
      <div ref={sectionRef as RefObject<HTMLDivElement>} className="relative flex min-h-0 flex-1 flex-col">
        {track}
        {overlay}
      </div>
    );
  }

  return (
    <section
      ref={sectionRef as RefObject<HTMLElement>}
      className="frame-card relative flex shrink-0 grow flex-col overflow-hidden p-4"
    >
      <header className="mb-1 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[17px] font-bold leading-tight tracking-[-0.02em] text-[#0F1C33]">Таймлайн</p>
          <p className="text-[12px] font-medium text-[#9AA6BE]">
            {fmtDayLong(day)} · {activeCount} клиентов
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isToday && (
            <button
              type="button"
              onClick={() => {
                haptic("select");
                scrollTo(true);
              }}
              aria-label={isAligned ? "Следим за текущим временем" : "Вернуться к текущему времени"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold transition-all duration-200 active:scale-95 ${
                isAligned
                  ? "border-2 border-[#4A5BF0] bg-[#4A5BF0] text-white shadow-sm shadow-[#4A5BF0]/25"
                  : "border-2 border-[#4A5BF0] bg-white text-[#4A5BF0] shadow-sm"
              }`}
            >
              {isAligned ? (
                /* Белая точка — режим слежения (Скриншот 2) */
                <span className="h-2 w-2 rounded-full bg-white shrink-0" />
              ) : (
                /* Изогнутая стрелка возврата к текущему времени (Скриншот 1) */
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
          )}
          <button
            type="button"
            onClick={onExpand}
            aria-label="Развернуть таймлайн"
            className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F3F9] text-[#5C6B86] transition active:scale-90"
          >
            <IconExpand className="h-4 w-4" />
          </button>
        </div>
      </header>

      {track}

      <div className="flex shrink-0 items-end justify-between gap-3 pt-2">
        <p className="min-w-0 text-[10px] leading-snug text-[#9AA6BE]">
          {sessions.length === 0
            ? "Свободный день. Тапни по линии или «+», чтобы записать клиента"
            : "Тап: действия · зажать: перенос · тап по линии: запись"}
        </p>
        <button
          type="button"
          onClick={onAdd}
          data-tutorial="timeline-add-btn"
          aria-label="Новая тренировка"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#4A5BF0] text-white transition active:scale-90"
          style={{ boxShadow: "0 10px 20px -8px rgba(74,91,240,0.7)" }}
        >
          <IconPlus className="h-6 w-6" />
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
  scale: number;
  onTap: (s: SessionDTO) => void;
  onDrag: (s: SessionDTO, deltaMin: number) => void;
}

function SessionBlock({ session: s, style, overlap, highlight, scrollerRef, scale, onTap, onDrag }: SessionBlockProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);

  const cancelled = s.status.startsWith("cancelled");
  const muscle = isMuscleKey(s.muscleGroup) ? MUSCLE_GROUPS[s.muscleGroup] : MUSCLE_GROUPS.full;
  const startMin = minuteOfDay(new Date(s.startsAt));
  const shownMin = dragging ? startMin + snap(dx / scale) : startMin;
  const colors = blockColors(s);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const g: Gesture = { x: e.clientX, y: e.clientY, dx: 0, moved: false, drag: false, timer: null };
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
      const delta = snap(g.dx / scale);
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
        background: colors.bg,
        color: colors.fg,
        outline: overlap && !dragging ? "2px solid #F04452" : "none",
        outlineOffset: 1,
      }}
      className={`tl-block absolute flex touch-none select-none overflow-hidden rounded-[14px] text-left shadow-sm transition-shadow ${
        dragging ? "z-30 scale-[1.04] shadow-xl" : ""
      } ${cancelled ? "opacity-70" : ""} ${highlight ? "block-born z-20" : ""}`}
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center px-2.5 py-1">
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-bold leading-none tabular-nums">{fmtMinute(shownMin)}</span>
          <span className={`truncate text-[12px] font-bold leading-none ${cancelled ? "line-through" : ""}`}>
            {s.clientName}
          </span>
        </span>
        <div className="tl-sub mt-1 flex items-center gap-1 text-[10px] font-medium leading-none">
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
