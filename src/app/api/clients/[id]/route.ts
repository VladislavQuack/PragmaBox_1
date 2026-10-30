import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, measurements, packages, sessions, trainers } from "@/db/schema";
import { withTrainer } from "@/lib/server/auth";
import { badRequest, loadClients, notFound, toText } from "@/lib/server/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_NAME = 80;
const MAX_PHONE = 40;
const MAX_NOTE = 1000;

// Изменение карточки клиента: имя, телефон, заметка
export function PATCH(req: Request, { params }: Params) {
  return withTrainer(req, async (trainer) => {
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return notFound("Клиент не найден");
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

    const updates: Partial<typeof clients.$inferInsert> = {};
    if (body.name !== undefined) {
      const name = toText(body.name);
      if (!name) return badRequest("Введите имя клиента");
      updates.name = name.slice(0, MAX_NAME);
    }
    if (body.phone !== undefined) updates.phone = toText(body.phone)?.slice(0, MAX_PHONE) ?? null;
    if (body.note !== undefined) updates.note = toText(body.note)?.slice(0, MAX_NOTE) ?? null;

    if (Object.keys(updates).length > 0) {
      const [updated] = await db
        .update(clients)
        .set(updates)
        .where(and(eq(clients.id, id), eq(clients.trainerId, trainer.id)))
        .returning({ id: clients.id });
      if (!updated) return notFound("Клиент не найден");
    }

    const all = await loadClients(trainer.id);
    const client = all.find((c) => c.id === id);
    if (!client) return notFound("Клиент не найден");
    return Response.json({ client });
  });
}

// Удаляет клиента вместе со всеми его данными: тренировками, абонементами и замерами.
// Если это был последний клиент тренера, сбрасываем флаг онбординга —
// с пустой базой приложение снова встретит тренера первым запуском.
export function DELETE(req: Request, { params }: Params) {
  return withTrainer(req, async (trainer) => {
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return notFound("Клиент не найден");

    // Всё в одной транзакции и только через tx: на Vercel в пуле одно соединение.
    const result = await db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, id), eq(clients.trainerId, trainer.id)))
        .limit(1);
      if (!owned) return null;

      // Связанные записи удаляем явно, не полагаясь на ON DELETE CASCADE:
      // боевая база могла быть создана старой версией схемы без каскада.
      await tx.delete(sessions).where(eq(sessions.clientId, id));
      await tx.delete(measurements).where(eq(measurements.clientId, id));
      await tx.delete(packages).where(eq(packages.clientId, id));
      await tx.delete(clients).where(eq(clients.id, id));

      const [{ value }] = await tx
        .select({ value: count() })
        .from(clients)
        .where(eq(clients.trainerId, trainer.id));
      const remainingClients = Number(value);

      if (remainingClients === 0) {
        await tx
          .update(trainers)
          .set({ onboardingComplete: false })
          .where(eq(trainers.id, trainer.id));
      }
      return { remainingClients };
    });

    if (!result) return notFound("Клиент не найден");
    return Response.json({ ok: true, remainingClients: result.remainingClients });
  });
}
