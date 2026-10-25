import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, measurements, packages, sessions, trainers } from "@/db/schema";
import { withTrainer } from "@/lib/server/auth";
import { notFound } from "@/lib/server/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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
