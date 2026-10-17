"use client";

import { fmtNum } from "@/lib/time";

interface IncomeWidgetProps {
  earned: number;
  plan: number;
  label: string;
  onOpen: () => void;
}

// Зелёная плитка с кольцом прогресса: сколько из плана уже заработано
export default function IncomeWidget({ earned, plan, label, onOpen }: IncomeWidgetProps) {
  const pct = plan > 0 ? Math.min(100, Math.round((earned / plan) * 100)) : 0;
  const r = 43;
  const c = 2 * Math.PI * r;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Доход ${label}: ${earned} из ${plan} рублей`}
      className="tile relative flex min-h-[clamp(132px,19dvh,168px)] items-center justify-center overflow-hidden p-3 text-white"
      style={{ background: "var(--ios-green)", ["--tile-shadow" as string]: "rgba(52,199,89,0.45)" }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full p-1.5" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>

      <span className="relative flex flex-col items-center leading-none">
        <span className="text-[11px] font-semibold opacity-90">Заработано</span>
        <span className="num mt-1 text-[30px] leading-none">{fmtNum(earned)}₽</span>
        <span className="mt-1.5 text-[11px] font-medium opacity-85">из {fmtNum(plan)}₽</span>
      </span>
    </button>
  );
}
