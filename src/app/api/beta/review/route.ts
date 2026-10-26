import { MAX_REVIEW_LENGTH } from "@/lib/beta";
import { withTrainer } from "@/lib/server/auth";
import { isMissingTable, submitReview } from "@/lib/server/beta";
import { badRequest, toText } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const text = toText(body?.text);
    if (!text) return badRequest("Напишите хотя бы пару слов");
    if (text.length > MAX_REVIEW_LENGTH) return badRequest(`Слишком длинно: до ${MAX_REVIEW_LENGTH} символов`);
    try {
      return Response.json(await submitReview(trainer, text, "app"));
    } catch (e) {
      if (isMissingTable(e)) {
        return Response.json({ error: "Отзывы скоро заработают — попробуйте чуть позже" }, { status: 503 });
      }
      throw e;
    }
  });
}
