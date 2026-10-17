// Конфиг для применения схемы к БОЕВОЙ базе (Neon, Supabase и т.п.).
// Локальная песочница использует drizzle.config.json и этот файл не трогает.
//
// Запуск:
//   DATABASE_URL="postgresql://..." npx drizzle-kit push --config=drizzle.config.prod.ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Нет DATABASE_URL. Передай строку подключения к боевой базе перед командой push.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
