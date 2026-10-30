import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { packages, sessions } from "@/db/schema";
import { PACKAGE_MAX_PRICE, PACKAGE_MAX_SESSIONS, packageTitle } from "@/lib/packages";
import { withTrainer } from "@/lib/server/auth";
import { badRequest, notFound, parseDayKeyInput, toInt, toPackageDTO } from "@/lib/server/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function readId(params: Params["params"]): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Изменение абонемента: оплата, количество занятий, остаток, цена, срок
export function PATCH(req: Request, { params }: Params) {
  return withTrainer(req, async (trainer) => {
    const pid = await readId(params);
    if (!pid) return notFound("Абонемент не найден");
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

    const [current] = await db
      .select()
      .from(packages)
      .where(and(eq(packages.id, pid), eq(packages.trainerId, trainer.id)))
      .limit(1);
    if (!current) return notFound("Абонемент не найден");

    const updates: Partial<typeof packages.$inferInsert> = {};
    if (typeof body.paid === "boolean") updates.paid = body.paid;

    let total = current.totalSessions;
    if (body.totalSessions !== undefined) {
      total = toInt(body.totalSessions, 0);
      if (total < 1 || total > PACKAGE_MAX_SESSIONS) {
        return badRequest(`Количество занятий — от 1 до ${PACKAGE_MAX_SESSIONS}`);
      }
      updates.totalSessions = total;
      updates.title = packageTitle(total);
    }
    if (body.remainingSessions !== undefined) {
      updates.remainingSessions = Math.min(Math.max(0, toInt(body.remainingSessions, 0)), total);
    } else if (total < current.remainingSessions) {
      // Занятий стало меньше, чем осталось, — остаток не может быть больше всего абонемента
      updates.remainingSessions = total;
    }
    if (body.price !== undefined) {
      const price = toInt(body.price, -1);
      if (price < 0 || price > PACKAGE_MAX_PRICE) return badRequest("Проверьте стоимость абонемента");
      updates.price = price;
    }
    // null или пустая строка — «без срока»
    if (body.expiresAt !== undefined) updates.expiresAt = parseDayKeyInput(body.expiresAt);

    if (Object.keys(updates).length === 0) return Response.json({ package: toPackageDTO(current) });

    const [updated] = await db
      .update(packages)
      .set(updates)
      .where(and(eq(packages.id, pid), eq(packages.trainerId, trainer.id)))
      .returning();
    if (!updated) return notFound("Абонемент не найден");

    return Response.json({ package: toPackageDTO(updated) });
  });
}

// Удаление абонемента, например созданного по ошибке. Тренировки остаются в истории,
// но становятся разовыми: оплачены они, если был оплачен абонемент.
export function DELETE(req: Request, { params }: Params) {
  return withTrainer(req, async (trainer) => {
    const pid = await readId(params);
    if (!pid) return notFound("Абонемент не найден");

    // Всё в одной транзакции и только через tx: на Vercel в пуле одно соединение
    const deleted = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: packages.id, paid: packages.paid })
        .from(packages)
        .where(and(eq(packages.id, pid), eq(packages.trainerId, trainer.id)))
        .limit(1);
      if (!current) return false;

      // Связь снимаем явно: боевая база могла быть создана без ON DELETE SET NULL
      await tx
        .update(sessions)
        .set({ packageId: null, paid: current.paid })
        .where(and(eq(sessions.packageId, pid), eq(sessions.trainerId, trainer.id)));
      await tx.delete(packages).where(eq(packages.id, pid));
      return true;
    });

    if (!deleted) return notFound("Абонемент не найден");
    return Response.json({ ok: true });
  });
}
