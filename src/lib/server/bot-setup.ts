// Настройка бота без ручных шагов: адрес вебхука, меню команд и описание.
// Запускается сама при открытии приложения на проде; проверить вручную — /api/telegram/setup.
import { BETA } from "@/lib/beta";
import { FREE_CLIENT_LIMIT, TRIAL_DAYS } from "@/lib/subscription";
import { appOrigin, botInfo, botToken, tgCall, webhookSecret } from "@/lib/server/telegram";

// Меню команд. В бете — бонусы за помощь, после неё — Premium и всё, что положено боту с оплатой:
// условия (/terms) и помощь с оплатой (/paysupport). Сами команды работают в обоих режимах.
export const BOT_COMMANDS = BETA
  ? [
      { command: "start", description: "Главное меню" },
      { command: "app", description: "Открыть PragmaBox" },
      { command: "install", description: "Установить на главный экран" },
      { command: "review", description: "Оставить отзыв — 6 месяцев Premium" },
      { command: "invite", description: "Пригласить друга — 12 месяцев Premium" },
      { command: "bonus", description: "Мои бонусы" },
      { command: "help", description: "Помощь" },
    ]
  : [
      { command: "start", description: "Главное меню" },
      { command: "app", description: "Открыть PragmaBox" },
      { command: "premium", description: "Premium — клиенты без лимита" },
      { command: "install", description: "Установить на главный экран" },
      { command: "review", description: "Оставить отзыв" },
      { command: "invite", description: "Пригласить друга" },
      { command: "terms", description: "Условия Premium" },
      { command: "paysupport", description: "Помощь с оплатой" },
      { command: "help", description: "Помощь" },
    ];

// Описание видно в пустом чате до нажатия «Start». Ставим, только если владелец
// ещё не написал своё в BotFather. Описание беты, которое бот поставил сам, после беты заменяем.
const BETA_DESCRIPTION =
  "PragmaBox — рабочий кабинет персонального тренера в Telegram: расписание, клиенты, абонементы, оплаты и замеры.\n\n" +
  "Сейчас идёт бета: все функции бесплатно, а за отзыв и приглашённых друзей — Premium после запуска.";
const BETA_SHORT_DESCRIPTION = "Расписание, клиенты и оплаты тренера. Сейчас бета — всё бесплатно.";
const LAUNCH_DESCRIPTION =
  "PragmaBox — рабочий кабинет персонального тренера в Telegram: расписание, клиенты, абонементы, оплаты и замеры.\n\n" +
  `Первые ${TRIAL_DAYS} дней — Premium бесплатно: клиенты без лимита. Дальше — бесплатно до ${FREE_CLIENT_LIMIT} клиентов или Premium за звёзды Telegram.`;
const LAUNCH_SHORT_DESCRIPTION = `Расписание, клиенты и оплаты тренера. ${TRIAL_DAYS} дней Premium бесплатно.`;
const DESCRIPTION = BETA ? BETA_DESCRIPTION : LAUNCH_DESCRIPTION;
const SHORT_DESCRIPTION = BETA ? BETA_SHORT_DESCRIPTION : LAUNCH_SHORT_DESCRIPTION;
// Своё описание владельца не трогаем, а пустое или наше старое — обновляем
const replaceable = (current: string, ours: string[]) => !current || ours.includes(current);

// pre_checkout_query — вопрос Telegram перед списанием звёзд; без него оплата не пройдёт
const UPDATES = ["message", "callback_query", "pre_checkout_query"];

export interface BotSetupResult {
  ok: boolean;
  reason?: string;
  webhook?: string;
  changed?: string[];
  pendingUpdates?: number;
  lastError?: string | null;
  // Главное мини-приложение в BotFather: без него иконка на главном экране не откроет приложение
  mainMiniApp?: boolean | null;
  // Что владельцу стоит поправить руками
  warnings?: string[];
}

// Main Mini App нельзя включить через Bot API — только в BotFather
function mainMiniAppWarning(origin: string) {
  return `Не включено главное мини-приложение: иконка на главном экране телефона не будет открывать PragmaBox. BotFather → /mybots → бот → Bot Settings → Configure Mini App → Enable Mini App → ${origin}`;
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
  if (description !== DESCRIPTION && replaceable(description, [BETA_DESCRIPTION, LAUNCH_DESCRIPTION])) {
    await tgCall("setMyDescription", { description: DESCRIPTION });
    changed.push("description");
  }
  const { short_description } = await tgCall<{ short_description: string }>("getMyShortDescription");
  if (
    short_description !== SHORT_DESCRIPTION &&
    replaceable(short_description, [BETA_SHORT_DESCRIPTION, LAUNCH_SHORT_DESCRIPTION])
  ) {
    await tgCall("setMyShortDescription", { short_description: SHORT_DESCRIPTION });
    changed.push("short_description");
  }

  const me = await botInfo(true);
  const mainMiniApp = me ? me.hasMainWebApp : null;
  const warnings = mainMiniApp === false ? [mainMiniAppWarning(origin)] : [];

  return {
    ok: true,
    webhook: url,
    changed,
    pendingUpdates: info.pending_update_count ?? 0,
    lastError: changed.includes("webhook") ? null : (info.last_error_message ?? null),
    mainMiniApp,
    warnings,
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
      for (const warning of result.warnings ?? []) console.warn(`[bot] ${warning}`);
    } else {
      console.warn(`[bot] setup skipped: ${result.reason}`);
    }
  } catch (e) {
    console.error("[bot] setup failed:", e instanceof Error ? e.message : e);
  }
}
