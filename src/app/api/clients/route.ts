import { db } from "@/db";
import { clients, packages } from "@/db/schema";
import { withTrainer } from "@/lib/server/auth";
import { badRequest, loadClients, parseDate, toInt, toText } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withTrainer(req, async (trainer) =>
    Response.json({ clients: await loadClients(trainer.id) }),
  );
}

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Пустой запрос");

    const name = toText(body.name);
    if (!name) return badRequest("Введи имя клиента");

    const [client] = await db
      .insert(clients)
      .values({ trainerId: trainer.id, name, phone: toText(body.phone), note: toText(body.note) })
      .returning({ id: clients.id });

    const pkg = body.package as Record<string, unknown> | undefined;
    if (pkg && toInt(pkg.totalSessions, 0) > 0) {
      const total = Math.max(1, toInt(pkg.totalSessions, 1));
      await db.insert(packages).values({
        trainerId: trainer.id,
        clientId: client.id,
        title: toText(pkg.title) ?? `Абонемент ${total} занятий`,
        totalSessions: total,
        remainingSessions: total,
        price: Math.max(0, toInt(pkg.price, 0)),
        paid: pkg.paid === true,
        expiresAt: parseDate(pkg.expiresAt) ? String(pkg.expiresAt).slice(0, 10) : null,
      });
    }

    const all = await loadClients(trainer.id);
    return Response.json({ client: all.find((c) => c.id === client.id) ?? null }, { status: 201 });
  });
}
