import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { measurements } from "@/db/schema";
import { withTrainer } from "@/lib/server/auth";
import { notFound } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTrainer(req, async (trainer) => {
    const id = Number((await params).id);
    const deleted = await db
      .delete(measurements)
      .where(and(eq(measurements.id, id), eq(measurements.trainerId, trainer.id)))
      .returning({ id: measurements.id });
    if (deleted.length === 0) return notFound("Замер не найден");
    return Response.json({ ok: true });
  });
}
