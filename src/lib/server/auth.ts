// Авторизация через Telegram Mini App.
// Telegram передаёт строку initData, подписанную ботом. Проверяем подпись на сервере,
// чтобы никто не мог представиться чужим аккаунтом.
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trainers } from "@/db/schema";

export const INIT_DATA_HEADER = "x-telegram-init-data";
const MAX_AGE_SEC = 24 * 60 * 60;

export type Trainer = typeof trainers.$inferSelect;

export class AuthError extends Error {}

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

// Алгоритм из документации Telegram (Node crypto: сначала key, затем message):
// secret_key = HMAC-SHA256(key="WebAppData", data=botToken);
// hash = HMAC-SHA256(key=secret_key, data=data_check_string).
// Для bot-token проверки исключаем только hash. Если присутствует signature,
// оно тоже входит в подписанные поля (signature исключается только при Ed25519-проверке).
export function verifyInitData(initData: string, botToken: string): TgUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // HMAC key/message order is significant: key=WebAppData, message=botToken.
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;

  const rawUser = params.get("user");
  if (!rawUser) return null;
  try {
    const user = JSON.parse(rawUser) as TgUser;
    return typeof user.id === "number" ? user : null;
  } catch {
    return null;
  }
}

async function upsertTrainer(input: {
  tgId: string;
  name: string;
  username?: string | null;
  photoUrl?: string | null;
}): Promise<Trainer> {
  const [existing] = await db.select().from(trainers).where(eq(trainers.tgId, input.tgId)).limit(1);
  if (existing) {
    const changed =
      existing.name !== input.name ||
      existing.username !== (input.username ?? null) ||
      existing.photoUrl !== (input.photoUrl ?? null);
    if (!changed) return existing;
    const [updated] = await db
      .update(trainers)
      .set({ name: input.name, username: input.username ?? null, photoUrl: input.photoUrl ?? null })
      .where(eq(trainers.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(trainers)
    .values({
      tgId: input.tgId,
      name: input.name,
      username: input.username ?? null,
      photoUrl: input.photoUrl ?? null,
    })
    .returning();
  return created;
}

// Демо-режим нужен, пока бот не подключён: приложение открывается в обычном браузере.
function demoAllowed(): boolean {
  return !process.env.TELEGRAM_BOT_TOKEN || process.env.ALLOW_BROWSER_DEMO === "1";
}

export async function requireTrainer(req: Request): Promise<Trainer> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const initData = (req.headers.get(INIT_DATA_HEADER) ?? "").trim();

  if (token && initData) {
    const user = verifyInitData(initData, token);
    if (!user) {
      console.error(
        `[telegram-auth] Bad signature: headerLen=${initData.length} hasToken=${Boolean(token)} ua=${(req.headers.get("user-agent") ?? "-").slice(0, 80)}`,
      );
      throw new AuthError("Подпись Telegram не подошла");
    }
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || `id${user.id}`;
    return upsertTrainer({
      tgId: String(user.id),
      name,
      username: user.username ?? null,
      photoUrl: user.photo_url ?? null,
    });
  }

  if (!demoAllowed()) {
    // Токен задан, но initData пуст: приложение открыли не через кнопку бота,
    // либо SDK Telegram ещё не успел загрузиться, либо клиент закэширован.
    console.error(
      `[telegram-auth] Empty initData: headerLen=${initData.length} hasToken=${Boolean(token)} ua=${(req.headers.get("user-agent") ?? "-").slice(0, 80)}`,
    );
    throw new AuthError(
      initData
        ? "Подпись не подошла. Проверь, что токен бота от того же бота, через который открываешь"
        : "Telegram не передал данные. Закрой мини-апп и открой снова кнопкой бота",
    );
  }
  return upsertTrainer({ tgId: "demo", name: "Демо-тренер" });
}

export function unauthorized(message: string) {
  return Response.json({ error: message, code: "TELEGRAM_AUTH_FAILED" }, { status: 401 });
}

// Обёртка для роутов: отдельно обрабатываем ожидаемую ошибку Telegram и сбой сервера.
// Ошибка БД или отсутствующая таблица — это 500, не маскируем её под «неверный вход».
export async function withTrainer(
  req: Request,
  handler: (trainer: Trainer) => Promise<Response>,
): Promise<Response> {
  let trainer: Trainer;
  try {
    trainer = await requireTrainer(req);
  } catch (e) {
    if (e instanceof AuthError) return unauthorized(e.message);

    // Не логируем initData или bot token — только серверную ошибку.
    console.error("[telegram-auth] Could not resolve trainer:", e);
    return Response.json(
      {
        error:
          "Не удалось завершить вход: сервер не смог связаться с базой или найти таблицы приложения.",
        code: "AUTH_BACKEND_ERROR",
      },
      { status: 500 },
    );
  }
  return handler(trainer);
}
