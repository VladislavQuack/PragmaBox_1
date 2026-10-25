// Общие блоки для страниц-инструкций (/setup и /deploy).
import type { ReactNode } from "react";

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-[#4A5BF0] px-1.5 py-0.5 font-mono text-[12px] text-white">
      {children}
    </code>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative rounded-3xl bg-white/85 p-4 pl-14 shadow-sm">
      <span className="absolute left-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#4A5BF0] to-[#3D4EDB] text-xs font-bold text-white">
        {n}
      </span>
      <h2 className="text-[15px] font-bold text-[#0F1C33]">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-[#5C6B86]">{children}</div>
    </li>
  );
}
