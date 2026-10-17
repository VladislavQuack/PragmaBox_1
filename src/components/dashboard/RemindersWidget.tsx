"use client";

import type { Reminder } from "@/lib/analytics";

interface RemindersWidgetProps {
  reminders: Reminder[];
  onOpen: () => void;
  onAction: (r: Reminder) => void;
}

const PAY_KINDS = new Set(["unpaid", "pkg-unpaid"]);

// Жёлтая рамка с «ярлычком» сверху, как в макете
export default function RemindersWidget({ reminders, onOpen, onAction }: RemindersWidgetProps) {
  const top = reminders.slice(0, 2);

  return (
    <section
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="frame-card relative cursor-pointer px-2.5 pb-2.5 pt-5"
      style={{
        ["--frame-color" as string]: "var(--ios-yellow)",
        ["--frame-fill" as string]: "#fffdf2",
      }}
    >
      <span
        className="absolute -top-[14px] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold text-black"
        style={{ background: "var(--ios-yellow)" }}
      >
        Напоминания
        {reminders.length > 0 && (
          <span
            className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold text-white"
            style={{ background: "var(--ios-blue)" }}
          >
            {reminders.length}
          </span>
        )}
      </span>

      {top.length === 0 ? (
        <p className="py-3 text-center text-sm text-[var(--label-3)]">Всё под контролем ✨</p>
      ) : (
        <ul>
          {top.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-center gap-2 py-2 ${i > 0 ? "border-t border-black/[0.07]" : ""}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: r.tone === "bad" ? "var(--ios-red)" : "var(--label-3)" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-black">
                  {r.title}
                </span>
                <span className="block truncate text-[12px] leading-tight text-[var(--label-3)]">
                  {r.sub}
                </span>
              </span>
              <button
                type="button"
                aria-label={PAY_KINDS.has(r.kind) ? "Отметить оплату" : "Открыть клиента"}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(r);
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] text-white transition active:scale-90"
                style={{ background: "var(--ios-blue)" }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {reminders.length > top.length && (
        <p className="pt-1 text-center text-[11px] font-semibold text-[var(--label-3)]">
          ещё {reminders.length - top.length}
        </p>
      )}
    </section>
  );
}
