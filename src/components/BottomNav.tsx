"use client";

import { haptic } from "@/components/dashboard/TimelineCreator";
import { IconGear, IconHome, IconUsers, IconWallet } from "@/components/ui/icons";

export type Tab = "finance" | "day" | "clients";

const TABS: { key: Tab; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { key: "finance", label: "Финансы", Icon: IconWallet },
  { key: "day", label: "День", Icon: IconHome },
  { key: "clients", label: "Клиенты", Icon: IconUsers },
];

export default function BottomNav({
  tab,
  onChange,
  debtCount,
  onProfile,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  debtCount: number;
  onProfile: () => void;
}) {
  return (
    <nav
      data-tutorial="bottom-nav"
      className="nav-surface shrink-0 rounded-[22px] border border-[#E6EAF3] px-2 py-1.5"
      style={{ boxShadow: "0 8px 24px -12px rgba(16,28,60,0.18)" }}
    >
      <ul className="flex items-stretch">
        {TABS.map(({ key, label, Icon }) => {
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
                className="relative flex w-full flex-col items-center gap-1 rounded-2xl py-1.5 transition active:scale-95"
              >
                <span className="relative">
                  <Icon
                    className={`h-[22px] w-[22px] ${active ? "text-[#4A5BF0]" : "text-[#9AA6BE]"}`}
                  />
                  {badge > 0 && (
                    <span className="absolute -right-2.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#F04452] px-1 text-[9px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[11px] leading-none ${active ? "font-bold text-[#4A5BF0]" : "font-medium text-[#9AA6BE]"}`}
                >
                  {label}
                </span>
                {active && <span className="h-1 w-1 rounded-full bg-[#4A5BF0]" />}
              </button>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => {
              haptic("select");
              onProfile();
            }}
            className="flex w-full flex-col items-center gap-1 rounded-2xl py-1.5 transition active:scale-95"
            aria-label="Профиль и настройки"
          >
            <IconGear className="h-[22px] w-[22px] text-[#9AA6BE]" />
            <span className="text-[11px] font-medium leading-none text-[#9AA6BE]">Профиль</span>
            <span className="h-1 w-1 rounded-full bg-transparent" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
