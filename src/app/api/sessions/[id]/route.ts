import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { packages, sessions } from "@/db/schema";
import { isKindKey, isMuscleKey, isStatusKey } from "@/lib/config";
import { withTrainer } from "@/lib/server/auth";
import { badRequest, loadSession, notFound, parseDate, toInt, toText } from "@/lib/server/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export function PATCH(req: Request, { params }: Params) {
  return withTrainer(req, async (trainer) => {
    const sid = Number((await params).id);
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

    const [current] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sid), eq(sessions.trainerId, trainer.id)))
      .limit(1);
    if (!current) return notFound("Тренировка не найдена");

    const updates: Partial<typeof sessions.$inferInsert> = {};

    if (body.startsAt !== undefined) {
      const date = parseDate(body.startsAt);
      if (!date) return badRequest("Некорректное время");
      updates.startsAt = date;
    }
    if (body.durationMin !== undefined) {
      updates.durationMin = Math.min(Math.max(toInt(body.durationMin, 60), 15), 300);
    }
    if (isMuscleKey(body.muscleGroup)) updates.muscleGroup = body.muscleGroup;
    if (isKindKey(body.kind)) updates.kind = body.kind;
    if (body.price !== undefined) updates.price = Math.max(0, toInt(body.price, 0));
    if (typeof body.paid === "boolean") updates.paid = body.paid;
    if (body.note !== undefined) updates.note = toText(body.note);

    const nextStatus = body.status;
    if (isStatusKey(nextStatus) && nextStatus !== current.status) {
      updates.status = nextStatus;
      const wasDone = current.status === "done";
      const isDone = nextStatus === "done";
      // Списываем занятие при проведении и возвращаем, если провели по ошибке
      if (current.packageId && wasDone !== isDone) {
        await db
          .update(packages)
          .set({
            remainingSessions: isDone
              ? sql`greatest(${packages.remainingSessions} - 1, 0)`
              : sql`${packages.remainingSessions} + 1`,
          })
          .where(eq(packages.id, current.packageId));
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.update(sessions).set(updates).where(eq(sessions.id, sid));
    }

    return Response.json({ session: await loadSession(trainer.id, sid) });
  });
}

export function DELETE(req: Request, { params }: Params) {
  return withTrainer(req, async (trainer) => {
    const sid = Number((await params).id);
    const [current] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sid), eq(sessions.trainerId, trainer.id)))
      .limit(1);
    if (!current) return notFound("Тренировка не найдена");

    if (current.status === "done" && current.packageId) {
      await db
        .update(packages)
        .set({ remainingSessions: sql`${packages.remainingSessions} + 1` })
        .where(eq(packages.id, current.packageId));
    }
    await db.delete(sessions).where(eq(sessions.id, sid));
    return Response.json({ ok: true });
  });
}
