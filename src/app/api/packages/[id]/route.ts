import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { packages } from "@/db/schema";
import { withTrainer } from "@/lib/server/auth";
import { notFound, toInt, toPackageDTO } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTrainer(req, async (trainer) => {
    const pid = Number((await params).id);
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

    const updates: Partial<typeof packages.$inferInsert> = {};
    if (typeof body.paid === "boolean") updates.paid = body.paid;
    if (body.remainingSessions !== undefined) {
      updates.remainingSessions = Math.max(0, toInt(body.remainingSessions, 0));
    }
    if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim();

    const [updated] = await db
      .update(packages)
      .set(updates)
      .where(and(eq(packages.id, pid), eq(packages.trainerId, trainer.id)))
      .returning();
    if (!updated) return notFound("Абонемент не найден");

    return Response.json({ package: toPackageDTO(updated) });
  });
}
