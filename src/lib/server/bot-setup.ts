// Настройка бота без ручных шагов: адрес вебхука, меню команд и описание.
// Запускается сама при открытии приложения на проде; проверить вручную — /api/telegram/setup.
import { appOrigin, botToken, tgCall, webhookSecret } from "@/lib/server/telegram";

export const BOT_COMMANDS = [
  { command: "start", description: "Главное меню" },
  { command: "app", description: "Открыть PragmaBox" },
  { command: "install", description: "Установить на главный экран" },
  { command: "review", description: "Оставить отзыв — 6 месяцев Premium" },
  { command: "invite", description: "Пригласить друга — 12 месяцев Premium" },
  { command: "bonus", description: "Мои бонусы" },
  { command: "help", description: "Помощь" },
];

// Описание видно в пустом чате до нажатия «Start». Ставим, только если владелец
// ещё не написал своё в BotFather.
const DESCRIPTION =
  "PragmaBox — рабочий кабинет персонального тренера в Telegram: расписание, клиенты, абонементы, оплаты и замеры.\n\n" +
  "Сейчас идёт бета: все функции бесплатно, а за отзыв и приглашённых друзей — Premium после запуска.";
const SHORT_DESCRIPTION = "Расписание, клиенты и оплаты тренера. Сейчас бета — всё бесплатно.";

const UPDATES = ["message", "callback_query"];

export interface BotSetupResult {
  ok: boolean;
  reason?: string;
  webhook?: string;
  changed?: string[];
  pendingUpdates?: number;
  lastError?: string | null;
}

interface WebhookInfo {
  url: string;
  pending_update_count?: number;
  last_error_message?: string;
  allowed_updates?: string[];
}

export async function ensureBotSetup(): Promise<BotSetupResult> {
  if (!botToken()) return { ok: false, reason: "Не задан TELEGRAM_BOT_TOKEN" };
  const origin = appOrigin();
  if (!origin) return { ok: false, reason: "Не знаю адрес приложения: задай переменную APP_URL" };
  if (!origin.startsWith("https://")) return { ok: false, reason: "Адрес приложения должен начинаться с https://" };

  const url = `${origin}/api/telegram/webhook`;
  const changed: string[] = [];
  const info = await tgCall<WebhookInfo>("getWebhookInfo");
  // 401 в последней ошибке — вебхук ставили вручную без нашего секрета: переставляем
  const rejected = /\b(401|403)\b/.test(info.last_error_message ?? "");
  const updatesOk = UPDATES.every((u) => info.allowed_updates?.includes(u) ?? true);
  if (info.url !== url || rejected || !updatesOk) {
    await tgCall("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: UPDATES });
    changed.push("webhook");
  }

  const commands = await tgCall<{ command: string; description: string }[]>("getMyCommands");
  if (JSON.stringify(commands) !== JSON.stringify(BOT_COMMANDS)) {
    await tgCall("setMyCommands", { commands: BOT_COMMANDS });
    changed.push("commands");
  }
  const { description } = await tgCall<{ description: string }>("getMyDescription");
  if (!description) {
    await tgCall("setMyDescription", { description: DESCRIPTION });
    changed.push("description");
  }
  const { short_description } = await tgCall<{ short_description: string }>("getMyShortDescription");
  if (!short_description) {
    await tgCall("setMyShortDescription", { short_description: SHORT_DESCRIPTION });
    changed.push("short_description");
  }

  return {
    ok: true,
    webhook: url,
    changed,
    pendingUpdates: info.pending_update_count ?? 0,
    lastError: changed.includes("webhook") ? null : (info.last_error_message ?? null),
  };
}

// Один раз на процесс; после ошибки повторяем не чаще раза в 10 минут.
let done = false;
let lastAttempt = 0;

export async function ensureBotSetupOnce() {
  if (done || !botToken() || !appOrigin()) return;
  // Превью-деплои Vercel не трогают бота: вебхук переключится, только когда код попадёт в прод
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") return;
  if (Date.now() - lastAttempt < 10 * 60 * 1000) return;
  lastAttempt = Date.now();
  try {
    const result = await ensureBotSetup();
    if (result.ok) {
      done = true;
      if (result.changed?.length) console.log(`[bot] setup updated: ${result.changed.join(", ")}`);
    } else {
      console.warn(`[bot] setup skipped: ${result.reason}`);
    }
  } catch (e) {
    console.error("[bot] setup failed:", e instanceof Error ? e.message : e);
  }
}
