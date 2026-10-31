import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { trainers } from "@/db/schema";
import { withTrainer, type Trainer } from "@/lib/server/auth";
import { ensureBotSetupOnce } from "@/lib/server/bot-setup";
import { toInt } from "@/lib/server/data";
import { getPremiumInfo } from "@/lib/server/premium";
import type { PremiumInfo } from "@/lib/subscription";

export const dynamic = "force-dynamic";

const toInfo = (trainer: Trainer, premium: PremiumInfo) => ({
  id: trainer.id,
  name: trainer.name,
  username: trainer.username,
  photoUrl: trainer.photoUrl,
  isDemo: trainer.tgId === "demo",
  subscriptionTier: trainer.subscriptionTier,
  monthlyGoal: trainer.monthlyGoal,
  avgSessionPrice: trainer.avgSessionPrice,
  onboardingComplete: trainer.onboardingComplete,
  // Premium: пробный период, срок, можно ли оплатить (см. src/lib/server/premium.ts)
  premium,
});

export function GET(req: Request) {
  // Приложение открывают сразу после деплоя — заодно (уже после ответа) проверяем,
  // что бот подключён к этому деплою: вебхук, команды, описание.
  after(() => ensureBotSetupOnce());
  // Заодно выдаём пробный период и бонусы беты, если пора (только после беты)
  return withTrainer(req, async (trainer) =>
    Response.json({ trainer: toInfo(trainer, await getPremiumInfo(trainer, { sync: true })) }),
  );
}

// Цель на месяц и обычная цена тренировки — их задают в онбординге и меняют в профиле
export function PATCH(req: Request) {
  return withTrainer(req, async (trainer) => {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const updates: Partial<typeof trainers.$inferInsert> = {};
    if (body.monthlyGoal !== undefined) {
      updates.monthlyGoal = Math.min(Math.max(toInt(body.monthlyGoal, trainer.monthlyGoal), 0), 1_000_000);
    }
    if (body.avgSessionPrice !== undefined) {
      updates.avgSessionPrice = Math.min(Math.max(toInt(body.avgSessionPrice, trainer.avgSessionPrice), 0), 100_000);
    }
    if (Object.keys(updates).length === 0) {
      return Response.json({ trainer: toInfo(trainer, await getPremiumInfo(trainer)) });
    }

    const [updated] = await db.update(trainers).set(updates).where(eq(trainers.id, trainer.id)).returning();
    return Response.json({ trainer: toInfo(updated ?? trainer, await getPremiumInfo(updated ?? trainer)) });
  });
}
