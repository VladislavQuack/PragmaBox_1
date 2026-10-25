"use client";

import type { Reminder } from "@/lib/analytics";
import { IconArrowRight } from "@/components/ui/icons";
import { SvgIcon, WIDGET_ICONS } from "@/components/ui/app-icons";

interface RemindersWidgetProps {
  reminders: Reminder[];
  onOpen: () => void;
  onAction: (r: Reminder) => void;
}

export default function RemindersWidget({ reminders, onOpen, onAction }: RemindersWidgetProps) {
  const top = reminders.slice(0, 2);

  return (
    <section
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="tile card-tint-amber cursor-pointer p-4"
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="chip-amber grid h-9 w-9 place-items-center rounded-[13px]">
            <SvgIcon src={WIDGET_ICONS.reminders} className="h-5 w-5" />
          </span>
          <h3 className="text-[15px] font-bold text-[#0F1C33]">Напоминания</h3>
          {reminders.length > 0 && (
            <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[#4A5BF0] px-1.5 text-[12px] font-bold text-white">
              {reminders.length}
            </span>
          )}
        </div>
        <IconArrowRight className="h-4 w-4 text-[#C4CCDD]" />
      </div>

      {top.length === 0 ? (
        <p className="py-2 text-sm text-[#9AA6BE]">Всё под контролем</p>
      ) : (
        <ul>
          {top.map((r, i) => (
            <li
              key={r.id}
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onAction(r);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onAction(r);
                }
              }}
              className={`flex cursor-pointer items-center gap-2.5 py-2.5 transition active:opacity-70 ${i > 0 ? "border-t border-[#EFF1F6]" : ""}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: r.tone === "bad" ? "#F04452" : r.tone === "warn" ? "#FF9F0A" : "#C4CCDD" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-[#0F1C33]">
                  {r.title}
                </span>
                <span className="block truncate text-[12px] leading-tight text-[#9AA6BE]">{r.sub}</span>
              </span>
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EEF1FF] text-[#4A5BF0]"
              >
                <IconArrowRight className="h-4 w-4" />
              </span>
            </li>
          ))}
        </ul>
      )}

      {reminders.length > top.length && (
        <p className="pt-1 text-center text-[11px] font-semibold text-[#9AA6BE]">
          ещё {reminders.length - top.length}
        </p>
      )}
    </section>
  );
}
