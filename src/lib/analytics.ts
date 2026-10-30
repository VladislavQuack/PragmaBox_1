// Чистая логика дашборда: статусы, раскладка таймлайна, окна, доход и напоминания.
import { MIN_GAP_MINUTES } from "./config";
import { currentPackage, packageTitle, sessionsLabel } from "./packages";
import { addDays, fmtMoney, fmtShortDate, pad, parseDayKey, startOfDay } from "./time";
import type { ClientDTO, PackageDTO, SessionDTO } from "./types";

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

// Доход считаем по проведённым тренировкам: занятие из абонемента приносит свою долю его цены.
// «Получено» — та часть, за которую деньги уже пришли (у занятий по абонементу — если он оплачен).
export function incomeSummary(list: SessionDTO[], monthStart: Date, now: Date) {
  const from = monthStart.getTime();
  const to = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getTime();
  const inMonth = list.filter((s) => {
    const t = startMs(s);
    return t >= from && t < to;
  });
  const done = inMonth.filter((s) => s.status === "done");
  return {
    earned: sumPrice(done),
    received: sumPrice(done.filter((s) => s.paid)),
    planned: sumPrice(inMonth.filter((s) => s.status === "planned" && startMs(s) >= now.getTime())),
  };
}

// ───────── Долги ─────────
// Долг — это проведённые разовые тренировки без оплаты и неоплаченные абонементы (на всю сумму).
// Занятия из абонемента отдельным долгом не считаются: за них платят абонементом.

export const isSessionDebt = (s: SessionDTO): boolean =>
  s.status === "done" && !s.paid && s.price > 0 && s.packageId === null;

export const isPackageDebt = (p: PackageDTO): boolean => !p.paid && p.price > 0;

export interface Debtor {
  clientId: number;
  name: string;
  sessions: SessionDTO[];
  packages: PackageDTO[];
  sessionSum: number;
  packageSum: number;
  total: number;
  // Самая ранняя неоплаченная тренировка (YYYY-MM-DD)
  oldest: string | null;
}

export interface DebtSummary {
  total: number;
  sessionsTotal: number;
  packagesTotal: number;
  debtors: Debtor[];
  byClient: Map<number, Debtor>;
}

export function debtSummary(history: SessionDTO[], clients: ClientDTO[]): DebtSummary {
  const byClient = new Map<number, Debtor>();
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const touch = (clientId: number, name: string) => {
    let d = byClient.get(clientId);
    if (!d) {
      d = { clientId, name, sessions: [], packages: [], sessionSum: 0, packageSum: 0, total: 0, oldest: null };
      byClient.set(clientId, d);
    }
    return d;
  };

  for (const s of history) {
    if (!isSessionDebt(s)) continue;
    const d = touch(s.clientId, names.get(s.clientId) ?? s.clientName);
    d.sessions.push(s);
    d.sessionSum += s.price;
    const day = s.startsAt.slice(0, 10);
    if (!d.oldest || day < d.oldest) d.oldest = day;
  }

  for (const c of clients) {
    for (const p of c.packages) {
      if (!isPackageDebt(p)) continue;
      const d = touch(c.id, c.name);
      d.packages.push(p);
      d.packageSum += p.price;
    }
  }

  const debtors = [...byClient.values()]
    .map((d) => {
      d.total = d.sessionSum + d.packageSum;
      return d;
    })
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    total: debtors.reduce((acc, d) => acc + d.total, 0),
    sessionsTotal: debtors.reduce((acc, d) => acc + d.sessionSum, 0),
    packagesTotal: debtors.reduce((acc, d) => acc + d.packageSum, 0),
    debtors,
    byClient,
  };
}

// «2 трен. · 2 400 ₽ · абонемент 9 600 ₽»
export function debtorDetails(d: Debtor): string {
  const parts: string[] = [];
  if (d.sessions.length > 0) parts.push(`${d.sessions.length} трен. · ${fmtMoney(d.sessionSum)}`);
  if (d.packages.length > 0) {
    parts.push(d.packages.length === 1 ? `абонемент ${fmtMoney(d.packageSum)}` : `абонементы ${fmtMoney(d.packageSum)}`);
  }
  return parts.join(" · ");
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
    .filter(isSessionDebt)
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
    // Неоплаченный абонемент — долг, даже если он уже закончился или куплен новый
    for (const p of c.packages) {
      if (!isPackageDebt(p)) continue;
      out.push({
        id: `pkg-unpaid-${p.id}`,
        kind: "pkg-unpaid",
        tone: "bad",
        title: `Абонемент не оплачен: ${c.name}`,
        sub: `${packageTitle(p.totalSessions)} · ${fmtMoney(p.price)}`,
        packageId: p.id,
        clientId: c.id,
      });
    }

    // Остальное — только про действующий абонемент: после продления старые не напоминают о себе
    const pkg = currentPackage(c);
    if (!pkg) continue;

    if (pkg.remainingSessions <= 0) {
      out.push({
        id: `empty-${pkg.id}`,
        kind: "empty",
        tone: "warn",
        title: `Закончился абонемент: ${c.name}`,
        sub: "Пора продлить",
        packageId: pkg.id,
        clientId: c.id,
      });
      continue;
    }
    if (pkg.remainingSessions === 1) {
      out.push({
        id: `low-${pkg.id}`,
        kind: "low",
        tone: "warn",
        title: `Осталось 1 занятие: ${c.name}`,
        sub: `${packageTitle(pkg.totalSessions)} · пора продлить`,
        packageId: pkg.id,
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
          sub: `до ${fmtShortDate(parseDayKey(pkg.expiresAt))} · осталось ${sessionsLabel(pkg.remainingSessions)}`,
          packageId: pkg.id,
          clientId: c.id,
        });
      }
    }
  }
  return out;
}
