"use client";

import type { Gap } from "@/lib/analytics";
import { fmtTime } from "@/lib/time";
import { IconArrowRight } from "@/components/ui/icons";
import { SvgIcon, WIDGET_ICONS } from "@/components/ui/app-icons";

interface NextWindowWidgetProps {
  isToday: boolean;
  now: Date;
  gap: Gap | null;
  onOpen: () => void;
}

const DOTS = 6;

export default function NextWindowWidget({ isToday, now, gap, onOpen }: NextWindowWidgetProps) {
  let title = "Ближайшее окно";
  let main = "—";
  let sub = "только для сегодня";
  let filled = 0;

  if (isToday && !gap) {
    main = "Нет окон";
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
      title = "Окно через";
      main = `${Math.floor(untilMin / 60)}:${String(untilMin % 60).padStart(2, "0")}`;
      sub = `на ${gap.minutes} мин · до ${fmtTime(gap.end)}`;
      filled = Math.max(1, Math.min(DOTS, Math.round(((180 - Math.min(untilMin, 180)) / 180) * DOTS)));
    }
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="tile card-tint-blue flex min-h-[118px] flex-col justify-between p-3.5 text-left"
    >
      <span className="flex items-center justify-between">
        <span className="chip-blue grid h-9 w-9 place-items-center rounded-[13px]">
          <SvgIcon src={WIDGET_ICONS.nextWindow} className="h-5 w-5" />
        </span>
        <IconArrowRight className="h-4 w-4 text-[#B5C2D6]" />
      </span>
      <span className="mt-2 block">
        <span className="block text-[12px] font-medium text-[#5C6B86]">{title}</span>
        <span className="num mt-1 block text-[26px] leading-none text-[#0F1C33]">{main}</span>
      </span>
      <span data-tile-foot className="mt-2 block">
        <span className="flex items-center gap-1">
          {Array.from({ length: DOTS }, (_, i) => (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{ background: i < filled ? "#4A5BF0" : "#D9DFF5" }}
            />
          ))}
        </span>
        <span className="mt-1.5 block truncate text-[11px] font-medium text-[#7D8AA6]">{sub}</span>
      </span>
    </button>
  );
}
