// Чистая логика дашборда: статусы, раскладка таймлайна, окна, доход и напоминания.
import { MIN_GAP_MINUTES } from "./config";
import { addDays, fmtMoney, fmtShortDate, pad, parseDayKey, startOfDay } from "./time";
import type { ClientDTO, SessionDTO } from "./types";

export type Tone = "ok" | "warn" | "bad" | "muted";

// Правило цветов: зелёный = всё ок, жёлтый = ждём, красный = проблема, серый = отменено
export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-emerald-50/95 border-emerald-200 text-emerald-950",
  warn: "bg-amber-50/95 border-amber-200 text-amber-950",
  bad: "bg-rose-50/95 border-rose-300 text-rose-950",
  muted: "bg-slate-100/90 border-slate-200 text-slate-500",
};

export interface Gap {
  start: Date;
  end: Date;
  minutes: number;
}

export type ReminderKind = "unpaid" | "pkg-unpaid" | "empty" | "low" | "expiring";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  tone: Tone;
  title: string;
  sub: string;
  sessionId?: number;
  packageId?: number;
  clientId?: number;
}

export const isActive = (s: SessionDTO): boolean => s.status === "planned" || s.status === "done";
export const startMs = (s: SessionDTO): number => new Date(s.startsAt).getTime();
export const endMs = (s: SessionDTO): number => startMs(s) + s.durationMin * 60_000;
// Над линией таймлайна — оплаченные, под линией — всё остальное (висяки)
export const isTopSide = (s: SessionDTO): boolean => isActive(s) && s.paid;
export const sumPrice = (list: SessionDTO[]): number => list.reduce((acc, s) => acc + s.price, 0);

export function sessionTone(s: SessionDTO): Tone {
  if (s.status === "no_show") return "bad";
  if (s.status.startsWith("cancelled")) return "muted";
  const needsMoney = s.price > 0 && !s.paid;
  if (s.status === "done") return needsMoney ? "bad" : "ok";
  return needsMoney ? "warn" : "ok";
}

export function sessionBadges(s: SessionDTO): string[] {
  const out: string[] = [];
  if (isActive(s) && s.price > 0 && !s.paid) out.push("❗");
  if (s.status === "no_show") out.push("⚠️");
  if (isActive(s) && s.remainingSessions === 1) out.push("1");
  return out;
}

// Раскладка по под-дорожкам, чтобы наложения были видны, а не перекрывали друг друга
export function assignLanes(list: SessionDTO[]): Map<number, number> {
  const sorted = [...list].sort((a, b) => startMs(a) - startMs(b));
  const laneEnds: number[] = [];
  const result = new Map<number, number>();
  for (const s of sorted) {
    const start = startMs(s);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endMs(s));
    } else {
      laneEnds[lane] = endMs(s);
    }
    result.set(s.id, lane);
  }
  return result;
}

export function hasOverlap(s: SessionDTO, list: SessionDTO[]): boolean {
  if (!isActive(s)) return false;
  const a = startMs(s);
  const b = endMs(s);
  return list.some((o) => o.id !== s.id && isActive(o) && startMs(o) < b && a < endMs(o));
}

// Свободные окна внутри интервала [from, to)
export function dayGaps(list: SessionDTO[], from: Date, to: Date): Gap[] {
  const active = list.filter(isActive).sort((a, b) => startMs(a) - startMs(b));
  const gaps: Gap[] = [];
  const toMs = to.getTime();
  let cursor = from.getTime();
  for (const s of active) {
    if (cursor >= toMs) break;
    const start = startMs(s);
    if (start > cursor) {
      const end = Math.min(start, toMs);
      const minutes = Math.round((end - cursor) / 60_000);
      if (minutes >= MIN_GAP_MINUTES) {
        gaps.push({ start: new Date(cursor), end: new Date(end), minutes });
      }
    }
    cursor = Math.max(cursor, endMs(s));
  }
  if (cursor < toMs) {
    const minutes = Math.round((toMs - cursor) / 60_000);
    if (minutes >= MIN_GAP_MINUTES) {
      gaps.push({ start: new Date(cursor), end: new Date(toMs), minutes });
    }
  }
  return gaps;
}

export function nextWindow(list: SessionDTO[], now: Date, workEnd: Date): Gap | null {
  return dayGaps(list, now, workEnd)[0] ?? null;
}

export function incomeSummary(list: SessionDTO[], monthStart: Date, now: Date) {
  const from = monthStart.getTime();
  const to = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getTime();
  const inMonth = list.filter((s) => {
    const t = startMs(s);
    return t >= from && t < to;
  });
  const done = inMonth.filter((s) => s.status === "done");
  const unpaidList = list
    .filter((s) => s.status === "done" && s.price > 0 && !s.paid)
    .sort((a, b) => startMs(b) - startMs(a));
  return {
    earned: sumPrice(done),
    received: sumPrice(done.filter((s) => s.paid)),
    planned: sumPrice(inMonth.filter((s) => s.status === "planned" && startMs(s) >= now.getTime())),
    unpaid: sumPrice(unpaidList),
    unpaidList,
  };
}

export function dailyEarnings(list: SessionDTO[], now: Date, days: number) {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - (days - 1));
    const from = d.getTime();
    const to = addDays(d, 1).getTime();
    const sum = sumPrice(
      list.filter((s) => s.status === "done" && startMs(s) >= from && startMs(s) < to),
    );
    return { label: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, sum };
  });
}

export function buildReminders(list: SessionDTO[], clients: ClientDTO[], now: Date): Reminder[] {
  const today = startOfDay(now).getTime();
  const weekAhead = addDays(startOfDay(now), 7).getTime();
  const out: Reminder[] = [];

  list
    .filter((s) => s.status === "done" && s.price > 0 && !s.paid)
    .sort((a, b) => startMs(b) - startMs(a))
    .forEach((s) =>
      out.push({
        id: `unpaid-${s.id}`,
        kind: "unpaid",
        tone: "bad",
        title: `Не оплачено: ${s.clientName}`,
        sub: `${fmtShortDate(new Date(s.startsAt))} · ${fmtMoney(s.price)}`,
        sessionId: s.id,
        clientId: s.clientId,
      }),
    );

  for (const c of clients) {
    // Учитываем только актуальный (последний) абонемент клиента
    const pkg = c.packages[c.packages.length - 1];
    if (!pkg) continue;

    if (pkg.price > 0 && !pkg.paid && pkg.remainingSessions > 0) {
      out.push({
        id: `pkg-unpaid-${pkg.id}`,
        kind: "pkg-unpaid",
        tone: "bad",
        title: `Абонемент не оплачен: ${c.name}`,
        sub: `${pkg.title} · ${fmtMoney(pkg.price)}`,
        packageId: pkg.id,
        clientId: c.id,
      });
    }

    if (pkg.remainingSessions <= 0) {
      out.push({
        id: `empty-${pkg.id}`,
        kind: "empty",
        tone: "warn",
        title: `Закончился абонемент: ${c.name}`,
        sub: "Пора продать новый",
        clientId: c.id,
      });
    } else if (pkg.remainingSessions === 1) {
      out.push({
        id: `low-${pkg.id}`,
        kind: "low",
        tone: "warn",
        title: `Осталось 1 занятие: ${c.name}`,
        sub: pkg.title,
        clientId: c.id,
      });
    }

    if (pkg.expiresAt) {
      const exp = parseDayKey(pkg.expiresAt).getTime();
      if (exp >= today && exp <= weekAhead) {
        out.push({
          id: `expiring-${pkg.id}`,
          kind: "expiring",
          tone: "warn",
          title: `Заканчивается абонемент: ${c.name}`,
          sub: `до ${fmtShortDate(parseDayKey(pkg.expiresAt))}`,
          clientId: c.id,
        });
      }
    }
  }
  return out;
}
