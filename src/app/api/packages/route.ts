import { db } from "@/db";
import { packages } from "@/db/schema";
import { PACKAGE_MAX_PRICE, PACKAGE_MAX_SESSIONS, packageTitle } from "@/lib/packages";
import { withTrainer } from "@/lib/server/auth";
import { badRequest, ownsClient, parseDayKeyInput, toInt, toPackageDTO } from "@/lib/server/data";

export const dynamic = "force-dynamic";

// Новый абонемент клиента (в том числе продление: старый остаётся в истории)
export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Пустой запрос");

    const clientId = toInt(body.clientId, 0);
    if (!clientId) return badRequest("Не указан клиент");
    if (!(await ownsClient(trainer.id, clientId))) return badRequest("Клиент не найден");

    const total = toInt(body.totalSessions, 0);
    if (total < 1 || total > PACKAGE_MAX_SESSIONS) {
      return badRequest(`Количество занятий — от 1 до ${PACKAGE_MAX_SESSIONS}`);
    }
    const price = toInt(body.price, 0);
    if (price < 0 || price > PACKAGE_MAX_PRICE) return badRequest("Проверьте стоимость абонемента");

    const [created] = await db
      .insert(packages)
      .values({
        trainerId: trainer.id,
        clientId,
        title: packageTitle(total),
        totalSessions: total,
        remainingSessions: total,
        price,
        paid: body.paid === true,
        expiresAt: parseDayKeyInput(body.expiresAt),
      })
      .returning();

    return Response.json({ package: toPackageDTO(created) }, { status: 201 });
  });
}
