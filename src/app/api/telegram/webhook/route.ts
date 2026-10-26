// Сюда Telegram присылает всё, что пишут боту. Адрес регистрируется сам (см. bot-setup.ts).
import { handleUpdate, type TgUpdate } from "@/lib/server/bot";
import { requestOrigin } from "@/lib/server/request";
import { appOrigin, safeEqual, webhookSecret } from "@/lib/server/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret) return new Response("Bot token is not configured", { status: 503 });
  // Telegram подписывает каждый запрос секретом, который мы передали в setWebhook
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(got, secret)) return new Response("Forbidden", { status: 401 });

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (update) {
    try {
      await handleUpdate(update, appOrigin() ?? requestOrigin(req));
    } catch (e) {
      console.error("[bot] update failed:", e);
    }
  }
  // Отвечаем 200 даже при сбое: иначе Telegram будет присылать тот же апдейт снова и снова
  return new Response("ok");
}
