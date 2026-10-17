import { db } from "@/db";
import { packages } from "@/db/schema";
import { withTrainer } from "@/lib/server/auth";
import { badRequest, ownsClient, parseDate, toInt, toPackageDTO, toText } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Пустой запрос");

    const clientId = toInt(body.clientId, 0);
    if (!clientId) return badRequest("Не указан клиент");
    if (!(await ownsClient(trainer.id, clientId))) return badRequest("Клиент не найден");

    const total = Math.max(1, toInt(body.totalSessions, 1));
    const expires = parseDate(body.expiresAt);

    const [created] = await db
      .insert(packages)
      .values({
        trainerId: trainer.id,
        clientId,
        title: toText(body.title) ?? `Абонемент ${total} занятий`,
        totalSessions: total,
        remainingSessions: total,
        price: Math.max(0, toInt(body.price, 0)),
        paid: body.paid === true,
        expiresAt: expires ? expires.toISOString().slice(0, 10) : null,
      })
      .returning();

    return Response.json({ package: toPackageDTO(created) }, { status: 201 });
  });
}
