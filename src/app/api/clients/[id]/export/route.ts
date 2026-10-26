// Ссылка на CSV с замерами клиента. Живёт 10 минут: этого хватает, чтобы Telegram скачал файл.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { withTrainer } from "@/lib/server/auth";
import { notFound } from "@/lib/server/data";
import { createExportToken, exportFileName } from "@/lib/server/export";
import { requestOrigin } from "@/lib/server/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export function POST(req: Request, { params }: Params) {
  return withTrainer(req, async (trainer) => {
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return notFound("Клиент не найден");
    const [client] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.trainerId, trainer.id)))
      .limit(1);
    if (!client) return notFound("Клиент не найден");
    const token = createExportToken(trainer.id, id);
    return Response.json({
      url: `${requestOrigin(req)}/api/export/${token}`,
      fileName: exportFileName(client.name),
    });
  });
}
