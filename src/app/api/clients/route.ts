import { db } from "@/db";
import { clients, packages } from "@/db/schema";
import { PACKAGE_MAX_PRICE, PACKAGE_MAX_SESSIONS, packageTitle } from "@/lib/packages";
import { withTrainer } from "@/lib/server/auth";
import {
  badRequest,
  clientLimitResponse,
  countTrainerClients,
  loadClients,
  parseDayKeyInput,
  toInt,
  toText,
} from "@/lib/server/data";
import { clientLimitForTier } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withTrainer(req, async (trainer) =>
    Response.json({ clients: await loadClients(trainer.id) }),
  );
}

// Новый клиент. Абонемент — по желанию: многие клиенты платят за каждую тренировку.
export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Пустой запрос");

    const name = toText(body.name)?.slice(0, 80);
    if (!name) return badRequest("Введите имя клиента");

    const pkg = body.package as Record<string, unknown> | undefined | null;
    const total = pkg ? toInt(pkg.totalSessions, 0) : 0;
    const price = pkg ? toInt(pkg.price, 0) : 0;
    if (pkg && (total < 1 || total > PACKAGE_MAX_SESSIONS)) {
      return badRequest(`Количество занятий — от 1 до ${PACKAGE_MAX_SESSIONS}`);
    }
    if (pkg && (price < 0 || price > PACKAGE_MAX_PRICE)) return badRequest("Проверьте стоимость абонемента");

    const limit = clientLimitForTier(trainer.subscriptionTier);
    if (limit !== null && (await countTrainerClients(trainer.id)) >= limit) {
      return clientLimitResponse(limit);
    }

    const clientId = await db.transaction(async (tx) => {
      const [client] = await tx
        .insert(clients)
        .values({
          trainerId: trainer.id,
          name,
          phone: toText(body.phone)?.slice(0, 40) ?? null,
          note: toText(body.note)?.slice(0, 1000) ?? null,
        })
        .returning({ id: clients.id });

      if (pkg) {
        await tx.insert(packages).values({
          trainerId: trainer.id,
          clientId: client.id,
          title: packageTitle(total),
          totalSessions: total,
          remainingSessions: total,
          price,
          paid: pkg.paid === true,
          expiresAt: parseDayKeyInput(pkg.expiresAt),
        });
      }
      return client.id;
    });

    const all = await loadClients(trainer.id);
    return Response.json({ client: all.find((c) => c.id === clientId) ?? null }, { status: 201 });
  });
}
