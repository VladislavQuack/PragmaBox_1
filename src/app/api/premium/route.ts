// Premium в приложении: состояние (GET) и счёт на оплату звёздами (POST).
import { planById } from "@/lib/subscription";
import { withTrainer } from "@/lib/server/auth";
import { isMissingTable } from "@/lib/server/beta";
import { badRequest } from "@/lib/server/data";
import { createInvoiceLink, getPremiumInfo, isAdmin, paymentsOpenFor } from "@/lib/server/premium";
import { TelegramApiError, botToken } from "@/lib/server/telegram";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withTrainer(req, async (trainer) => Response.json({ premium: await getPremiumInfo(trainer, { sync: true }) }));
}

// Счёт на оплату. Приложение откроет ссылку через Telegram.WebApp.openInvoice —
// окно оплаты Telegram появится прямо поверх мини-аппа.
export function POST(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const plan = planById(body?.plan);
    if (!plan || (plan.adminOnly && !isAdmin(trainer.tgId))) return badRequest("Такого тарифа нет");
    if (!paymentsOpenFor(trainer.tgId)) {
      return Response.json({ error: "Оплата откроется, когда закончится бета", code: "PAYMENTS_CLOSED" }, { status: 403 });
    }
    if (trainer.subscriptionTier === "premium") return badRequest("У вас Premium навсегда — платить не нужно");
    // Демо-режим в браузере: счёт выставить некому
    if (!botToken() || !/^\d+$/.test(trainer.tgId)) {
      return Response.json({ error: "Оплата работает только внутри Telegram", code: "NOT_TELEGRAM" }, { status: 400 });
    }
    try {
      const { link, paymentId } = await createInvoiceLink(trainer, plan);
      return Response.json({ link, paymentId });
    } catch (e) {
      if (isMissingTable(e)) {
        return Response.json(
          { error: "Оплата вот-вот заработает — загляните чуть позже", code: "PREMIUM_UNAVAILABLE" },
          { status: 503 },
        );
      }
      if (e instanceof TelegramApiError) {
        console.error("[premium] invoice failed:", e.message);
        return Response.json(
          { error: "Telegram не выставил счёт. Попробуйте ещё раз через минуту", code: "INVOICE_FAILED" },
          { status: 502 },
        );
      }
      throw e;
    }
  });
}
