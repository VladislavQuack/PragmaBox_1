import { and, desc, eq, gt, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { clients, packages, sessions } from "@/db/schema";
import { isKindKey, isMuscleKey } from "@/lib/config";
import { clientLimitForTier } from "@/lib/subscription";
import { withTrainer } from "@/lib/server/auth";
import {
  badRequest,
  clientLimitResponse,
  countTrainerClients,
  loadSession,
  loadSessions,
  ownsClient,
  parseDate,
  toInt,
  toText,
} from "@/lib/server/data";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withTrainer(req, async (trainer) => {
    const url = new URL(req.url);
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));
    if (!from || !to) return badRequest("Нужны параметры from и to");

    const list = await loadSessions(
      trainer.id,
      and(gte(sessions.startsAt, from), lt(sessions.startsAt, to)),
    );
    return Response.json({ sessions: list });
  });
}

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Пустой запрос");

    const startsAt = parseDate(body.startsAt);
    if (!startsAt) return badRequest("Укажи время начала");

    let clientId = toInt(body.clientId, 0);
    if (clientId) {
      if (!(await ownsClient(trainer.id, clientId))) return badRequest("Клиент не найден");
    } else {
      const name = toText(body.newClientName);
      if (!name) return badRequest("Выбери клиента или введи имя нового");
      const limit = clientLimitForTier(trainer.subscriptionTier);
      if (limit !== null && (await countTrainerClients(trainer.id)) >= limit) {
        return clientLimitResponse(limit);
      }
      const [created] = await db
        .insert(clients)
        .values({ trainerId: trainer.id, name })
        .returning({ id: clients.id });
      clientId = created.id;
    }

    // Если абонемент не выбран явно, списываем с последнего активного
    const [activePkg] = await db
      .select({ id: packages.id })
      .from(packages)
      .where(and(eq(packages.clientId, clientId), gt(packages.remainingSessions, 0)))
      .orderBy(desc(packages.id))
      .limit(1);

    const [row] = await db
      .insert(sessions)
      .values({
        trainerId: trainer.id,
        clientId,
        packageId: activePkg?.id ?? null,
        startsAt,
        durationMin: Math.min(Math.max(toInt(body.durationMin, 60), 15), 300),
        muscleGroup: isMuscleKey(body.muscleGroup) ? body.muscleGroup : "full",
        kind: isKindKey(body.kind) ? body.kind : "individual",
        status: "planned",
        price: Math.max(0, toInt(body.price, 0)),
        paid: body.paid === true,
        note: toText(body.note),
      })
      .returning({ id: sessions.id });

    return Response.json({ session: await loadSession(trainer.id, row.id) }, { status: 201 });
  });
}
