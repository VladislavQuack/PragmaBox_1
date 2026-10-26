// Отдаёт CSV по подписанной ссылке. Данных входа здесь нет: файл скачивает сам Telegram,
// поэтому доступ проверяем по подписи и сроку ссылки.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, measurements } from "@/db/schema";
import { toMeasurementDTO } from "@/lib/server/data";
import { exportFileName, measurementsCsv, readExportToken } from "@/lib/server/export";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

async function buildFile(token: string) {
  const access = readExportToken(token);
  if (!access) return null;
  const [client] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.id, access.clientId), eq(clients.trainerId, access.trainerId)))
    .limit(1);
  if (!client) return null;
  const rows = await db
    .select()
    .from(measurements)
    .where(and(eq(measurements.clientId, client.id), eq(measurements.trainerId, access.trainerId)));
  return {
    bytes: Buffer.from(measurementsCsv(rows.map(toMeasurementDTO)), "utf-8"),
    fileName: exportFileName(client.name),
  };
}

function fileHeaders(fileName: string, length: number): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="measurements.csv"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Content-Length": String(length),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    // Telegram просит этот заголовок: без него веб-версия может не скачать файл
    "Access-Control-Allow-Origin": "https://web.telegram.org",
  };
}

const gone = () =>
  new Response("Ссылка устарела. Нажмите «Выгрузить таблицей» в приложении ещё раз.", {
    status: 410,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function GET(_req: Request, { params }: Params) {
  const file = await buildFile((await params).token);
  if (!file) return gone();
  return new Response(new Uint8Array(file.bytes), { headers: fileHeaders(file.fileName, file.bytes.length) });
}

export async function HEAD(_req: Request, { params }: Params) {
  const file = await buildFile((await params).token);
  if (!file) return new Response(null, { status: 410 });
  return new Response(null, { headers: fileHeaders(file.fileName, file.bytes.length) });
}
