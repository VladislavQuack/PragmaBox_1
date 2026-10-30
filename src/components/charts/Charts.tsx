"use client";

// Лёгкие графики на SVG: кольцо долей и линия динамики. Без внешних библиотек.
import type { Point } from "@/lib/metrics";

export interface Slice {
  label: string;
  value: number;
  color: string;
}

// Кольцевая диаграмма: доли оплаченного и долгов
export function DonutChart({
  slices,
  centerTop,
  centerBottom,
  size = 168,
  formatValue,
}: {
  slices: Slice[];
  centerTop: string;
  centerBottom: string;
  size?: number;
  // Подпись суммы под названием доли (например, в рублях)
  formatValue?: (value: number) => string;
}) {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E7EAF3" strokeWidth={18} />
          {total > 0 &&
            slices.map((s) => {
              if (s.value <= 0) return null;
              const len = (s.value / total) * c;
              const dash = `${len} ${c - len}`;
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={18}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return el;
            })}
        </g>
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="fill-[#0F1C33] text-[15px] font-bold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {centerTop}
        </text>
        <text x="50%" y="62%" textAnchor="middle" className="fill-[#5C6B86] text-[10px]">
          {centerBottom}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.label} className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-tight text-[#5C6B86]">{s.label}</span>
                {formatValue && (
                  <span className="mt-0.5 block text-[12px] font-semibold tabular-nums text-[#0F1C33]">
                    {formatValue(s.value)}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-[#0F1C33]">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Линия динамики показателя
export function LineChart({
  points,
  color,
  unit,
  height = 150,
}: {
  points: Point[];
  color: string;
  unit: string;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[#5C6B86]">
        Нет данных за этот период
      </p>
    );
  }

  const w = 320;
  const padX = 10;
  const padTop = 16;
  const padBottom = 24;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const plotH = height - padTop - padBottom;

  const x = (i: number) =>
    points.length === 1 ? w / 2 : padX + (i * (w - padX * 2)) / (points.length - 1);
  const y = (v: number) => padTop + plotH - ((v - min) / span) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${padTop + plotH} L${x(0)},${padTop + plotH} Z`;
  const id = `grad-${color.replace("#", "")}`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={padTop + plotH * t}
            y2={padTop + plotH * t}
            stroke="#E7EAF3"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}
        {points.length > 1 && <path d={area} fill={`url(#${id})`} />}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g key={`${p.label}-${p.sort}`}>
            <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke={color} strokeWidth="2.5" />
            <text
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[#9AA6BE] text-[9px]"
            >
              {points.length > 8 && i % 2 === 1 ? "" : p.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-1 text-[10px] tabular-nums text-[#9AA6BE]">
        <span>
          мин {Math.round(min * 10) / 10} {unit}
        </span>
        <span>
          макс {Math.round(max * 10) / 10} {unit}
        </span>
      </div>
    </div>
  );
}

// Мини-график для карточки клиента
export function Sparkline({ points, color }: { points: Point[]; color: string }) {
  if (points.length < 2) return null;
  const w = 64;
  const h = 22;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i * w) / (points.length - 1);
      const y = h - ((p.value - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
