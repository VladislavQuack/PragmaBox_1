// Приложение получило от Telegram «оплачено» и ждёт, когда Premium включится.
// Обычно сообщение об оплате приходит боту за секунду; если задержалось — ищем платёж в Telegram сами.
import { withTrainer } from "@/lib/server/auth";
import { isMissingTable } from "@/lib/server/beta";
import { badRequest, toInt } from "@/lib/server/data";
import { getPremiumInfo, reconcilePayment } from "@/lib/server/premium";
import { TelegramApiError } from "@/lib/server/telegram";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const paymentId = toInt(body?.paymentId, 0);
    if (paymentId <= 0) return badRequest("Нет номера счёта");
    let status = "pending";
    try {
      const payment = await reconcilePayment(paymentId, trainer.tgId);
      if (!payment) return badRequest("Счёт не найден");
      status = payment.status;
    } catch (e) {
      // Telegram не ответил — попробуем при следующей проверке
      if (e instanceof TelegramApiError) console.warn("[premium] star transactions:", e.message);
      else if (!isMissingTable(e)) throw e;
    }
    return Response.json({ status, premium: await getPremiumInfo(trainer) });
  });
}
