"use client";

import type { Gap } from "@/lib/analytics";
import { fmtTime } from "@/lib/time";

interface NextWindowWidgetProps {
  isToday: boolean;
  now: Date;
  gap: Gap | null;
  onOpen: () => void;
}

const DOTS = 6;

// Синяя плитка: сколько осталось до окна. Точки показывают, насколько оно близко.
export default function NextWindowWidget({ isToday, now, gap, onOpen }: NextWindowWidgetProps) {
  let title = "Ближайшее окно";
  let main = "—";
  let sub = "Открой сегодня";
  let filled = 0;

  if (isToday && !gap) {
    title = "Ближайшее окно";
    main = "нет";
    sub = "день плотный";
  } else if (isToday && gap) {
    const untilMin = Math.round((gap.start.getTime() - now.getTime()) / 60_000);
    if (untilMin <= 0) {
      title = "Окно идёт";
      const left = Math.round((gap.end.getTime() - now.getTime()) / 60_000);
      main = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      sub = `до ${fmtTime(gap.end)}`;
      filled = DOTS;
    } else {
      title = "Ближайшее окно через";
      main = `${Math.floor(untilMin / 60)}:${String(untilMin % 60).padStart(2, "0")}`;
      sub = `на ${gap.minutes} мин`;
      // Чем ближе окно, тем больше точек заполнено (шкала до 3 часов)
      filled = Math.max(1, Math.min(DOTS, Math.round(((180 - Math.min(untilMin, 180)) / 180) * DOTS)));
    }
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="tile tile-window-gradient flex min-h-[clamp(132px,19dvh,168px)] flex-col justify-between p-3.5 text-left text-white"
      style={{ ["--tile-shadow" as string]: "rgba(2,132,199,0.45)" }}
    >
      <span className="text-[12px] font-semibold leading-tight opacity-95">{title}</span>

      <span className="num text-[38px] leading-none">{main}</span>

      <span className="flex items-center gap-1.5">
        <span className="flex flex-1 items-center gap-1">
          {Array.from({ length: DOTS }, (_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full transition-colors"
              style={{ background: i < filled ? "#fff" : "rgba(255,255,255,0.4)" }}
            />
          ))}
        </span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/25">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </span>

      <span className="sr-only">{sub}</span>
    </button>
  );
}
