import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { measurements } from "@/db/schema";
import { METRICS } from "@/lib/metrics";
import { withTrainer } from "@/lib/server/auth";
import {
  badRequest,
  loadMeasurements,
  ownsClient,
  toMeasurementDTO,
  toText,
} from "@/lib/server/data";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Число или null; пустые строки считаем «не заполнено»
function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export function GET(req: Request) {
  return withTrainer(req, async (trainer) =>
    Response.json({ measurements: await loadMeasurements(trainer.id) }),
  );
}

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Пустой запрос");

    const clientId = Number(body.clientId);
    if (!clientId || !(await ownsClient(trainer.id, clientId))) {
      return badRequest("Клиент не найден");
    }

    const takenOn = typeof body.takenOn === "string" ? body.takenOn.slice(0, 10) : "";
    if (!DATE_RE.test(takenOn)) return badRequest("Некорректная дата замера");

    const values: Record<string, number | null> = {};
    for (const m of METRICS) values[m.key] = toNum(body[m.key]);
    const note = toText(body.note);

    const filled = METRICS.some((m) => values[m.key] !== null) || note !== null;
    if (!filled) return badRequest("Заполни хотя бы один показатель");

    // На дату уже может быть замер — тогда обновляем его
    const [existing] = await db
      .select({ id: measurements.id })
      .from(measurements)
      .where(and(eq(measurements.clientId, clientId), eq(measurements.takenOn, takenOn)))
      .limit(1);

    const row = existing
      ? (
          await db
            .update(measurements)
            .set({ ...values, note })
            .where(eq(measurements.id, existing.id))
            .returning()
        )[0]
      : (
          await db
            .insert(measurements)
            .values({ trainerId: trainer.id, clientId, takenOn, ...values, note })
            .returning()
        )[0];

    return Response.json({ measurement: toMeasurementDTO(row) }, { status: existing ? 200 : 201 });
  });
}
