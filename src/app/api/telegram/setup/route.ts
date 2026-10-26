// Проверка и ручная настройка бота: открой адрес в браузере после деплоя.
// Безопасно для всех: вебхук ставится только на постоянный адрес приложения, секретов в ответе нет.
import { ensureBotSetup } from "@/lib/server/bot-setup";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await ensureBotSetup();
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } catch (e) {
    return Response.json(
      { ok: false, reason: e instanceof Error ? e.message : "Не удалось связаться с Telegram" },
      { status: 502 },
    );
  }
}
