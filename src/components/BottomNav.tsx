"use client";

import { haptic } from "@/components/dashboard/TimelineCreator";

export type Tab = "finance" | "day" | "clients";

const TABS: { key: Tab; label: string }[] = [
  { key: "finance", label: "Финансы" },
  { key: "day", label: "День" },
  { key: "clients", label: "Клиенты" },
];

// Сегмент-контрол в стиле iOS: активная вкладка — белая «таблетка» с синим контуром
export default function BottomNav({
  tab,
  onChange,
  debtCount,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  debtCount: number;
}) {
  return (
    <nav className="segment-track shrink-0 rounded-full p-1">
      <ul className="flex items-stretch gap-1">
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          const badge = key === "finance" && debtCount > 0 ? debtCount : 0;
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (!active) haptic("select");
                  onChange(key);
                }}
                className={`relative w-full rounded-full py-2 text-[15px] transition ${
                  active ? "bg-white font-bold" : "font-medium"
                }`}
                style={
                  active
                    ? { color: "var(--ios-blue)", boxShadow: "inset 0 0 0 2px var(--ios-blue)" }
                    : { color: "var(--on-bg-dim)" }
                }
              >
                {label}
                {badge > 0 && (
                  <span
                    className="absolute right-1.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white"
                    style={{ background: "var(--ios-red)" }}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
