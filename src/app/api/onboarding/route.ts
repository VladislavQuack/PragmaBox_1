import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, trainers } from "@/db/schema";
import { FREE_CLIENT_LIMIT, clientLimitForTier } from "@/lib/subscription";
import { withTrainer } from "@/lib/server/auth";
import { badRequest, toInt, toText } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Пустой запрос");

    const monthlyGoal = Math.min(Math.max(toInt(body.monthlyGoal, 30000), 0), 1_000_000);
    const avgSessionPrice = Math.min(Math.max(toInt(body.averageTicket, 1500), 0), 100_000);
    const rawNames = Array.isArray(body.clientNames) ? body.clientNames : [];
    const names = [...new Set(rawNames.map(toText).filter((v): v is string => Boolean(v)))];
    if (names.length > FREE_CLIENT_LIMIT) {
      return badRequest(`На первом запуске можно добавить не больше ${FREE_CLIENT_LIMIT} клиентов.`);
    }

    const limit = clientLimitForTier(trainer.subscriptionTier);
    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(clients)
      .where(eq(clients.trainerId, trainer.id));

    if (limit !== null && Number(existing) + names.length > limit) {
      return badRequest(`Бесплатный план позволяет вести до ${limit} клиентов.`);
    }

    await db.transaction(async (tx) => {
      if (names.length > 0) {
        await tx.insert(clients).values(names.map((name) => ({ trainerId: trainer.id, name })));
      }
      await tx
        .update(trainers)
        .set({ monthlyGoal, avgSessionPrice, onboardingComplete: true })
        .where(eq(trainers.id, trainer.id));
    });

    return Response.json({ ok: true, monthlyGoal, addedClients: names.length });
  });
}
