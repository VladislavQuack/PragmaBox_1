// Серверные хелперы: парсинг входных данных и загрузка связанных сущностей.
// Все выборки ограничены текущим тренером.
import { and, asc, count, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, measurements, packages, sessions } from "@/db/schema";
import type { ClientDTO, MeasurementDTO, PackageDTO, SessionDTO } from "@/lib/types";

export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Дата без времени (YYYY-MM-DD), например срок абонемента. Всё остальное — «не задана».
export function parseDayKeyInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? key : null;
}

export function toInt(value: unknown, fallback: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = "Не найдено") {
  return Response.json({ error: message }, { status: 404 });
}

const sessionColumns = {
  id: sessions.id,
  clientId: sessions.clientId,
  clientName: clients.name,
  packageId: sessions.packageId,
  remainingSessions: packages.remainingSessions,
  startsAt: sessions.startsAt,
  durationMin: sessions.durationMin,
  muscleGroup: sessions.muscleGroup,
  kind: sessions.kind,
  status: sessions.status,
  price: sessions.price,
  // Занятие по абонементу оплачено, когда оплачен абонемент. Собственная отметка
  // такого занятия не учитывается: раньше из-за неё долг считался дважды —
  // и за абонемент, и за каждое занятие из него.
  paid: sql<boolean>`coalesce(${packages.paid}, ${sessions.paid})`,
  note: sessions.note,
};

export async function loadSessions(trainerId: number, where?: SQL): Promise<SessionDTO[]> {
  const rows = await db
    .select(sessionColumns)
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .leftJoin(packages, eq(sessions.packageId, packages.id))
    .where(where ? and(eq(sessions.trainerId, trainerId), where) : eq(sessions.trainerId, trainerId))
    .orderBy(asc(sessions.startsAt));
  return rows.map((row) => ({ ...row, startsAt: row.startsAt.toISOString() }));
}

export async function loadSession(trainerId: number, id: number): Promise<SessionDTO | null> {
  const [row] = await loadSessions(trainerId, eq(sessions.id, id));
  return row ?? null;
}

export function toPackageDTO(p: typeof packages.$inferSelect): PackageDTO {
  return {
    id: p.id,
    clientId: p.clientId,
    title: p.title,
    totalSessions: p.totalSessions,
    remainingSessions: p.remainingSessions,
    price: p.price,
    paid: p.paid,
    expiresAt: p.expiresAt ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function loadClients(trainerId: number): Promise<ClientDTO[]> {
  const [clientRows, packageRows] = await Promise.all([
    db.select().from(clients).where(eq(clients.trainerId, trainerId)).orderBy(asc(clients.name)),
    db.select().from(packages).where(eq(packages.trainerId, trainerId)).orderBy(asc(packages.id)),
  ]);
  return clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    note: c.note,
    packages: packageRows.filter((p) => p.clientId === c.id).map(toPackageDTO),
  }));
}

export function toMeasurementDTO(m: typeof measurements.$inferSelect): MeasurementDTO {
  return {
    id: m.id,
    clientId: m.clientId,
    takenOn: m.takenOn,
    weight: m.weight,
    bodyFat: m.bodyFat,
    chest: m.chest,
    waist: m.waist,
    hips: m.hips,
    biceps: m.biceps,
    thigh: m.thigh,
    note: m.note,
  };
}

export async function loadMeasurements(trainerId: number): Promise<MeasurementDTO[]> {
  const rows = await db
    .select()
    .from(measurements)
    .where(eq(measurements.trainerId, trainerId))
    .orderBy(asc(measurements.takenOn));
  return rows.map(toMeasurementDTO);
}

export async function countTrainerClients(trainerId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(clients)
    .where(eq(clients.trainerId, trainerId));
  return Number(row?.value ?? 0);
}

export function clientLimitResponse(limit: number) {
  return Response.json(
    {
      error: `На бесплатном плане можно вести до ${limit} клиентов.`,
      code: "FREE_CLIENT_LIMIT",
      limit,
    },
    { status: 403 },
  );
}

// Проверяем, что сущность принадлежит этому тренеру
export async function ownsClient(trainerId: number, clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.trainerId, trainerId)))
    .limit(1);
  return Boolean(row);
}
