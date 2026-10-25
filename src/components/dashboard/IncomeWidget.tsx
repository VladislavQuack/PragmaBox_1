"use client";

import { fmtMoney, fmtNum } from "@/lib/time";
import { IconArrowRight, IconWallet } from "@/components/ui/icons";

interface IncomeWidgetProps {
  earned: number;
  plan: number;
  label: string;
  onOpen: () => void;
}

export default function IncomeWidget({ earned, plan, label, onOpen }: IncomeWidgetProps) {
  const pct = plan > 0 ? Math.min(100, Math.round((earned / plan) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Доход ${label}: ${earned} из ${plan} рублей`}
      className="tile card-tint-green flex min-h-[118px] flex-col justify-between p-3.5 text-left"
    >
      <span className="flex items-center justify-between">
        <span className="chip-green grid h-9 w-9 place-items-center rounded-[13px]">
          <IconWallet className="h-5 w-5" />
        </span>
        <IconArrowRight className="h-4 w-4 text-[#B5C2D6]" />
      </span>
      <span className="mt-2 block">
        <span className="block text-[12px] font-medium text-[#5C6B86]">Доход · {label}</span>
        <span className="num mt-1 block text-[26px] leading-none text-[#0F1C33]">{fmtNum(earned)}&nbsp;₽</span>
      </span>
      <span data-tile-foot className="mt-2 block">
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[#D4EFE1]">
          <span className="block h-full rounded-full bg-[#1DB871] transition-[width]" style={{ width: `${pct}%` }} />
        </span>
        <span className="mt-1.5 block text-[11px] font-medium text-[#7D8AA6]">
          из {fmtMoney(plan)} · {pct}%
        </span>
      </span>
    </button>
  );
}
