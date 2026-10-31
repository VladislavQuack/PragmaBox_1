import { db } from "@/db";
import { payments, premium, trainers } from "@/db/schema";
import { sql } from "drizzle-orm";
import { BETA } from "@/lib/beta";

export const dynamic = "force-dynamic";

export async function GET() {
  // Проверяем, задана ли переменная вообще
  const hasEnvUrl = Boolean(process.env.DATABASE_URL);
  
  if (!hasEnvUrl) {
    return Response.json(
      {
        ok: false,
        reason: "NO_DATABASE_URL",
        detail: "Переменная DATABASE_URL вообще не найдена в окружении Vercel. Добавь её в Settings -> Environment Variables и нажми Redeploy.",
      },
      { status: 500 },
    );
  }

  // 1. Проверяем само физическое подключение к PostgreSQL
  try {
    await db.execute(sql`select 1`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        ok: false,
        stage: "CONNECTION_FAILED",
        detail: message,
        hint: message.includes("SSL") || message.includes("ssl")
          ? "Добавь ?sslmode=require в конец строки подключения в Vercel"
          : message.includes("password") || message.includes("authentication")
            ? "Неверный пароль в DATABASE_URL в Vercel"
            : "Vercel не смог достучаться до сервера базы данных",
      },
      { status: 500 },
    );
  }

  // 2. Подключение есть — проверяем наличие таблицы trainers
  try {
    await db.select({ id: trainers.id }).from(trainers).limit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        ok: false,
        stage: "SCHEMA_MISSING",
        detail: message,
        hint: "Подключение к базе успешное, но таблицы trainers в ней нет. Возможно, в Vercel указана другая база данных, чем в локальном .env",
      },
      { status: 500 },
    );
  }

  // 3. Таблицы Premium (sql/2026-11-premium.sql). Без них приложение работает, но оплата недоступна
  let premiumTables = true;
  try {
    await Promise.all([
      db.select({ id: premium.trainerId }).from(premium).limit(0),
      db.select({ id: payments.id }).from(payments).limit(0),
    ]);
  } catch {
    premiumTables = false;
  }

  return Response.json({
    ok: true,
    database: true,
    schema: true,
    beta: BETA,
    premiumTables,
    ...(premiumTables
      ? {}
      : { hint: "Нет таблиц Premium: выполни sql/2026-11-premium.sql в Neon → SQL Editor, иначе оплата не заработает" }),
    nodeEnv: process.env.NODE_ENV,
    isVercel: Boolean(process.env.VERCEL),
  });
}
