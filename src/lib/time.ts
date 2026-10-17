// Работа с датами и форматированием. Все расчёты ведутся в локальном времени устройства тренера.

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Момент дня: minute = минуты от полуночи
export function atMinute(day: Date, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute);
}

export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function fmtMinute(m: number): string {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function fmtTime(d: Date): string {
  return fmtMinute(minuteOfDay(d));
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export function fmtNum(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

export function fmtMoney(n: number): string {
  return `${fmtNum(n)}\u00a0₽`;
}

export function fmtDayLong(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function fmtWeekday(d: Date): string {
  return d.toLocaleDateString("ru-RU", { weekday: "long" });
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
