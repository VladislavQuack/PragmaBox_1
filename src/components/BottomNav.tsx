"use client";

import { haptic } from "@/components/dashboard/TimelineCreator";
import { NAV_ICONS, ToggleIcon } from "@/components/ui/app-icons";

export type Tab = "finance" | "day" | "clients";

const TABS: { key: Tab; label: string }[] = [
  { key: "finance", label: "Финансы" },
  { key: "day", label: "День" },
  { key: "clients", label: "Клиенты" },
];

const ICON_SIZE = "h-[22px] w-[22px]";
const labelClass = (active: boolean) =>
  `text-[11px] leading-none ${active ? "font-bold text-[#4A5BF0]" : "font-medium text-[#9AA6BE]"}`;
const dotClass = (active: boolean) => `h-1 w-1 rounded-full ${active ? "bg-[#4A5BF0]" : "bg-transparent"}`;

export default function BottomNav({
  tab,
  onChange,
  debtCount,
  onProfile,
  profileActive = false,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  debtCount: number;
  onProfile: () => void;
  // Открыты настройки: подсвечиваем «Профиль», а вкладку под шторкой гасим,
  // чтобы фиолетовым всегда был только один пункт
  profileActive?: boolean;
}) {
  return (
    <nav
      data-tutorial="bottom-nav"
      className="nav-surface shrink-0 rounded-[22px] border border-[#E6EAF3] px-2 py-1.5"
      style={{ boxShadow: "0 8px 24px -12px rgba(16,28,60,0.18)" }}
    >
      <ul className="flex items-stretch">
        {TABS.map(({ key, label }) => {
          const current = tab === key;
          const active = current && !profileActive;
          const badge = key === "finance" && debtCount > 0 ? debtCount : 0;
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => {
                  if (!current) haptic("select");
                  onChange(key);
                }}
                className="relative flex w-full flex-col items-center gap-1 rounded-2xl py-1.5 transition active:scale-95"
              >
                <span className="relative">
                  <ToggleIcon icons={NAV_ICONS[key]} active={active} className={ICON_SIZE} />
                  {badge > 0 && (
                    <span className="absolute -right-2.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#F04452] px-1 text-[9px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className={labelClass(active)}>{label}</span>
                <span className={dotClass(active)} />
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
            aria-expanded={profileActive}
          >
            <ToggleIcon icons={NAV_ICONS.settings} active={profileActive} className={ICON_SIZE} />
            <span className={labelClass(profileActive)}>Профиль</span>
            <span className={dotClass(profileActive)} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
