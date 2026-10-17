// Показатели клиента: что меряем, как показываем и как строим графики.
import { parseDayKey } from "./time";
import type { MeasurementDTO } from "./types";

export type MetricKey = "weight" | "bodyFat" | "chest" | "waist" | "hips" | "biceps" | "thigh";

export interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  step: number;
  min: number;
  max: number;
  fallback: number;
  // true — рост показателя считаем хорошим (мышцы), false — снижение (вес, талия)
  growthIsGood: boolean;
  color: string;
}

export const METRICS: MetricDef[] = [
  { key: "weight", label: "Вес", short: "Вес", unit: "кг", step: 0.1, min: 30, max: 250, fallback: 70, growthIsGood: false, color: "#3B82F6" },
  { key: "bodyFat", label: "Процент жира", short: "Жир", unit: "%", step: 0.5, min: 3, max: 60, fallback: 20, growthIsGood: false, color: "#F59E0B" },
  { key: "chest", label: "Грудь", short: "Грудь", unit: "см", step: 0.5, min: 50, max: 180, fallback: 95, growthIsGood: true, color: "#EC4899" },
  { key: "waist", label: "Талия", short: "Талия", unit: "см", step: 0.5, min: 40, max: 180, fallback: 80, growthIsGood: false, color: "#F97316" },
  { key: "hips", label: "Бёдра", short: "Бёдра", unit: "см", step: 0.5, min: 50, max: 180, fallback: 95, growthIsGood: true, color: "#8B5CF6" },
  { key: "biceps", label: "Бицепс", short: "Бицепс", unit: "см", step: 0.5, min: 15, max: 70, fallback: 33, growthIsGood: true, color: "#14B8A6" },
  { key: "thigh", label: "Бедро", short: "Бедро", unit: "см", step: 0.5, min: 25, max: 100, fallback: 55, growthIsGood: true, color: "#06B6D4" },
];

export const metricDef = (key: MetricKey): MetricDef =>
  METRICS.find((m) => m.key === key) ?? METRICS[0];

export const metricValue = (m: MeasurementDTO, key: MetricKey): number | null => m[key] ?? null;

export function fmtMetric(value: number, def: MetricDef): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${def.unit}`;
}

export function fmtDelta(value: number, def: MetricDef): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(Math.abs(rounded)) : Math.abs(rounded).toFixed(1);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${text} ${def.unit}`;
}

// Хорошая ли динамика: зависит от того, растёт показатель или падает
export function deltaTone(delta: number, def: MetricDef): "good" | "bad" | "flat" {
  if (Math.abs(delta) < 0.05) return "flat";
  const growing = delta > 0;
  return growing === def.growthIsGood ? "good" : "bad";
}

export type Period = "weeks" | "months" | "years";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "weeks", label: "Недели" },
  { key: "months", label: "Месяцы" },
  { key: "years", label: "Годы" },
];

export interface Point {
  label: string;
  value: number;
  sort: number;
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

// Номер недели от «эпохи», чтобы группировать замеры по неделям
function weekIndex(d: Date): number {
  const monday = new Date(d);
  const shift = (d.getDay() + 6) % 7;
  monday.setDate(d.getDate() - shift);
  monday.setHours(0, 0, 0, 0);
  return Math.floor(monday.getTime() / 604_800_000);
}

// Группируем замеры по неделям, месяцам или годам и усредняем значения внутри корзины
export function buildSeries(
  list: MeasurementDTO[],
  key: MetricKey,
  period: Period,
  limit = 12,
): Point[] {
  const buckets = new Map<number, { label: string; sum: number; n: number }>();

  for (const m of list) {
    const value = metricValue(m, key);
    if (value === null) continue;
    const d = parseDayKey(m.takenOn);

    let id: number;
    let label: string;
    if (period === "weeks") {
      id = weekIndex(d);
      const monday = new Date(id * 604_800_000);
      label = `${monday.getDate()}.${String(monday.getMonth() + 1).padStart(2, "0")}`;
    } else if (period === "months") {
      id = d.getFullYear() * 12 + d.getMonth();
      label = MONTHS_SHORT[d.getMonth()];
    } else {
      id = d.getFullYear();
      label = String(d.getFullYear());
    }

    const prev = buckets.get(id);
    if (prev) {
      prev.sum += value;
      prev.n += 1;
    } else {
      buckets.set(id, { label, sum: value, n: 1 });
    }
  }

  return [...buckets.entries()]
    .map(([sort, b]) => ({ sort, label: b.label, value: b.sum / b.n }))
    .sort((a, b) => a.sort - b.sort)
    .slice(-limit);
}

// Последнее значение показателя и изменение относительно предыдущего замера
export function latestWithDelta(list: MeasurementDTO[], key: MetricKey) {
  const withValue = list
    .filter((m) => metricValue(m, key) !== null)
    .sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  if (withValue.length === 0) return null;
  const last = withValue[withValue.length - 1];
  const prev = withValue[withValue.length - 2];
  const value = metricValue(last, key)!;
  const prevValue = prev ? metricValue(prev, key) : null;
  return {
    value,
    takenOn: last.takenOn,
    delta: prevValue === null ? null : value - prevValue,
    count: withValue.length,
  };
}
