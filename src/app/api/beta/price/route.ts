import { withTrainer } from "@/lib/server/auth";
import { isMissingTable, savePriceAnswer } from "@/lib/server/beta";
import { badRequest } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    try {
      const label = await savePriceAnswer(trainer, body?.option, "app");
      if (!label) return badRequest("Выберите вариант");
      return Response.json({ ok: true, label });
    } catch (e) {
      if (isMissingTable(e)) {
        return Response.json({ error: "Опрос скоро заработает — попробуйте чуть позже" }, { status: 503 });
      }
      throw e;
    }
  });
}
