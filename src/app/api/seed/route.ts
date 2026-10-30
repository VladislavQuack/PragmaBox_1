import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, measurements, packages, sessions } from "@/db/schema";
import { withTrainer } from "@/lib/server/auth";
import { badRequest, parseDate } from "@/lib/server/data";

export const dynamic = "force-dynamic";

const DEMO_CLIENTS = [
  {
    name: "Мария",
    phone: "+7 900 111-22-33",
    pkg: { title: "Абонемент 8 занятий", total: 8, remaining: 1, price: 9600, paid: true, expDays: 20 },
  },
  {
    name: "Михаил",
    phone: "+7 900 222-33-44",
    pkg: { title: "Абонемент 10 занятий", total: 10, remaining: 6, price: 12000, paid: true, expDays: 3 },
  },
  {
    name: "Владимир",
    phone: "+7 900 333-44-55",
    pkg: { title: "Абонемент 4 занятия", total: 4, remaining: 3, price: 4800, paid: false, expDays: 45 },
  },
  {
    name: "Ольга",
    phone: "+7 900 444-55-66",
    pkg: { title: "Абонемент 12 занятий", total: 12, remaining: 9, price: 14400, paid: true, expDays: 60 },
  },
  { name: "Анна", phone: null, pkg: null },
];

// Часы от начала дня (dayStart)
const TODAY: {
  at: number;
  name: string;
  muscle: string;
  kind: string;
  dur: number;
  price: number;
  paid: boolean;
  status?: string;
}[] = [
  { at: 7.5, name: "Ольга", muscle: "back", kind: "individual", dur: 60, price: 1200, paid: true },
  { at: 9, name: "Анна", muscle: "full", kind: "trial", dur: 60, price: 0, paid: true },
  { at: 10, name: "Мария", muscle: "legs", kind: "individual", dur: 60, price: 1200, paid: true },
  { at: 11, name: "Михаил", muscle: "back", kind: "individual", dur: 60, price: 1200, paid: false },
  { at: 12.5, name: "Владимир", muscle: "chest", kind: "group", dur: 45, price: 600, paid: false },
  { at: 13, name: "Ольга", muscle: "legs", kind: "individual", dur: 60, price: 1200, paid: true },
  { at: 14, name: "Мария", muscle: "arms", kind: "individual", dur: 60, price: 1200, paid: true, status: "cancelled_client" },
  { at: 15.5, name: "Михаил", muscle: "core", kind: "individual", dur: 60, price: 1200, paid: true },
  { at: 16.5, name: "Анна", muscle: "cardio", kind: "individual", dur: 45, price: 1000, paid: false },
  { at: 18, name: "Мария", muscle: "legs", kind: "individual", dur: 60, price: 1200, paid: true },
  { at: 19, name: "Ольга", muscle: "full", kind: "individual", dur: 60, price: 1200, paid: false },
  { at: 20.5, name: "Владимир", muscle: "shoulders", kind: "individual", dur: 60, price: 1200, paid: false },
];

const HISTORY: { at: number; name: string; muscle: string }[] = [
  { at: 10, name: "Мария", muscle: "legs" },
  { at: 12, name: "Ольга", muscle: "back" },
  { at: 18, name: "Михаил", muscle: "core" },
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Замеры: каждые 2 недели назад от сегодня. start — значения «сейчас», drift — изменение за замер.
const DEMO_MEASUREMENTS: {
  name: string;
  points: number;
  start: { weight: number; bodyFat?: number; waist?: number; chest?: number; hips?: number; biceps?: number };
  drift: { weight: number; bodyFat?: number; waist?: number; chest?: number; hips?: number; biceps?: number };
}[] = [
  {
    name: "Мария",
    points: 8,
    start: { weight: 62.4, bodyFat: 24.5, waist: 68, hips: 94 },
    drift: { weight: 0.9, bodyFat: 0.7, waist: 1.1, hips: 0.6 },
  },
  {
    name: "Михаил",
    points: 7,
    start: { weight: 84.2, bodyFat: 17.5, chest: 104, biceps: 38.5, waist: 86 },
    drift: { weight: -0.7, bodyFat: 0.5, chest: -0.7, biceps: -0.4, waist: 0.6 },
  },
  {
    name: "Ольга",
    points: 6,
    start: { weight: 58.1, bodyFat: 22, waist: 65, hips: 92 },
    drift: { weight: 0.5, bodyFat: 0.4, waist: 0.7, hips: 0.3 },
  },
  {
    name: "Владимир",
    points: 3,
    start: { weight: 91.5, waist: 98, chest: 108 },
    drift: { weight: 1.2, waist: 1.0, chest: 0.3 },
  },
];

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const dayStart = parseDate(body.dayStart);
    const now = parseDate(body.now) ?? new Date();
    if (!dayStart) return badRequest("Нужен dayStart");

    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(clients)
      .where(eq(clients.trainerId, trainer.id));
    if (existing > 0) return Response.json({ seeded: false });

    const ids = new Map<string, { clientId: number; packageId: number | null; packagePaid: boolean }>();
    for (const d of DEMO_CLIENTS) {
      const [client] = await db
        .insert(clients)
        .values({ trainerId: trainer.id, name: d.name, phone: d.phone })
        .returning({ id: clients.id });

      let packageId: number | null = null;
      let packagePaid = false;
      if (d.pkg) {
        const expires = new Date(now.getTime() + d.pkg.expDays * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const [pkg] = await db
          .insert(packages)
          .values({
            trainerId: trainer.id,
            clientId: client.id,
            title: d.pkg.title,
            totalSessions: d.pkg.total,
            remainingSessions: d.pkg.remaining,
            price: d.pkg.price,
            paid: d.pkg.paid,
            expiresAt: expires,
          })
          .returning({ id: packages.id });
        packageId = pkg.id;
        packagePaid = d.pkg.paid;
      }
      ids.set(d.name, { clientId: client.id, packageId, packagePaid });
    }

    const rows: (typeof sessions.$inferInsert)[] = [];

    for (const t of TODAY) {
      const info = ids.get(t.name);
      if (!info) continue;
      const startsAt = new Date(dayStart.getTime() + t.at * HOUR);
      const ended = startsAt.getTime() + t.dur * 60_000 <= now.getTime();
      rows.push({
        trainerId: trainer.id,
        clientId: info.clientId,
        packageId: info.packageId,
        startsAt,
        durationMin: t.dur,
        muscleGroup: t.muscle,
        kind: t.kind,
        status: t.status ?? (ended ? "done" : "planned"),
        price: t.price,
        // Занятие по абонементу оплачено вместе с абонементом
        paid: info.packageId ? info.packagePaid : t.paid,
      });
    }

    // История за 6 прошлых дней, чтобы график дохода был живым
    for (let i = 1; i <= 6; i++) {
      const day = new Date(dayStart.getTime() - i * 24 * HOUR);
      for (const h of HISTORY) {
        const info = ids.get(h.name);
        if (!info) continue;
        rows.push({
          trainerId: trainer.id,
          clientId: info.clientId,
          packageId: info.packageId,
          startsAt: new Date(day.getTime() + h.at * HOUR),
          durationMin: 60,
          muscleGroup: h.muscle,
          kind: "individual",
          status: "done",
          price: 1200,
          paid: info.packageId ? info.packagePaid : true,
        });
      }
    }

    await db.insert(sessions).values(rows);

    // Замеры раз в две недели: свежие значения — сегодня, более старые считаем «назад» по drift
    const msRows: (typeof measurements.$inferInsert)[] = [];
    for (const d of DEMO_MEASUREMENTS) {
      const info = ids.get(d.name);
      if (!info) continue;
      for (let i = 0; i < d.points; i++) {
        const take = (base?: number, step?: number) =>
          base === undefined ? null : Math.round((base + (step ?? 0) * i) * 10) / 10;
        msRows.push({
          trainerId: trainer.id,
          clientId: info.clientId,
          takenOn: new Date(dayStart.getTime() - i * 14 * DAY).toISOString().slice(0, 10),
          weight: take(d.start.weight, d.drift.weight),
          bodyFat: take(d.start.bodyFat, d.drift.bodyFat),
          chest: take(d.start.chest, d.drift.chest),
          waist: take(d.start.waist, d.drift.waist),
          hips: take(d.start.hips, d.drift.hips),
          biceps: take(d.start.biceps, d.drift.biceps),
          thigh: null,
        });
      }
    }
    if (msRows.length > 0) await db.insert(measurements).values(msRows);

    return Response.json({ seeded: true });
  });
}
