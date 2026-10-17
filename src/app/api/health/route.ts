import { db } from "@/db";
import { trainers } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    // Подтверждаем, что в этой базе применена схема приложения, а не только есть соединение.
    await db.select({ id: trainers.id }).from(trainers).limit(0);
    return Response.json({ ok: true, database: true, schema: true });
  } catch (error) {
    console.error("[health] Database or schema check failed:", error);
    return Response.json(
      { ok: false, database: false, schema: false, error: "Проверь DATABASE_URL и применение схемы Drizzle" },
      { status: 500 },
    );
  }
}
