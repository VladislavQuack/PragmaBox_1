// Запросы к Bot API от имени бота: сообщения в чат, кнопки, настройка вебхука.
import crypto from "node:crypto";

// Адрес Bot API можно подменить только для тестов с имитацией Telegram.
const API_BASE = (process.env.TELEGRAM_API_URL?.trim() || "https://api.telegram.org").replace(/\/$/, "");

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export class TelegramApiError extends Error {
  constructor(
    public method: string,
    public code: number,
    public description: string,
  ) {
    super(`Telegram ${method}: ${code} ${description}`);
  }
}

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string; error_code?: number }
    | null;
  if (!data?.ok) {
    throw new TelegramApiError(method, data?.error_code ?? res.status, data?.description ?? `HTTP ${res.status}`);
  }
  return data.result as T;
}

// Секрет вебхука выводим из токена: отдельная переменная окружения не нужна,
// а подделать запрос «от Telegram», не зная токена, нельзя.
export function webhookSecret(): string | null {
  const token = botToken();
  if (!token) return null;
  return crypto.createHmac("sha256", "pragmabox-webhook-v1").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export interface BotInfo {
  username: string | null;
  // Включено ли главное мини-приложение (BotFather → Configure Mini App).
  // Иконка на главном экране телефона открывает именно его
  hasMainWebApp: boolean;
}

// Данные бота из getMe. Имя нужно для ссылок-приглашений — узнаём один раз на процесс;
// fresh — перечитать (настройки в BotFather могли поменяться).
let infoCache: BotInfo | null = null;
export async function botInfo(fresh = false): Promise<BotInfo | null> {
  if (infoCache && !fresh) return infoCache;
  if (!botToken()) return null;
  try {
    const me = await tgCall<{ username?: string; has_main_web_app?: boolean }>("getMe");
    infoCache = { username: me.username ?? null, hasMainWebApp: me.has_main_web_app === true };
  } catch (e) {
    console.error("[bot] getMe failed:", e instanceof Error ? e.message : e);
  }
  return infoCache;
}

export async function botUsername(): Promise<string | null> {
  return (await botInfo())?.username ?? null;
}

// Постоянный адрес приложения — для кнопок мини-аппа в чате и адреса вебхука.
// На Vercel он известен сам (адрес продакшена), в других местах задаётся APP_URL.
export function appOrigin(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// extra — остальные параметры sendMessage, например reply_markup с force_reply
export function sendMessage(
  chatId: number | string,
  text: string,
  buttons?: InlineButton[][],
  extra: Record<string, unknown> = {},
) {
  return tgCall<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    ...extra,
  });
}

// Сообщение, которое может не дойти (пользователь не запускал бота или заблокировал его):
// это не ошибка приложения, просто пропускаем.
export async function trySendMessage(chatId: number | string, text: string, buttons?: InlineButton[][]) {
  try {
    await sendMessage(chatId, text, buttons);
    return true;
  } catch (e) {
    console.warn("[bot] message not delivered:", e instanceof Error ? e.message : e);
    return false;
  }
}

// Владельцы бота получают отзывы и новости беты. ID узнать — команда /id в боте.
export function adminIds(): string[] {
  return (process.env.BOT_ADMIN_IDS ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s));
}

export async function notifyAdmins(text: string) {
  await Promise.all(adminIds().map((id) => trySendMessage(id, text)));
}
