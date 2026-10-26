import { after } from "next/server";
import { withTrainer } from "@/lib/server/auth";
import { ensureBotSetupOnce } from "@/lib/server/bot-setup";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  // Приложение открывают сразу после деплоя — заодно (уже после ответа) проверяем,
  // что бот подключён к этому деплою: вебхук, команды, описание.
  after(() => ensureBotSetupOnce());
  return withTrainer(req, async (trainer) =>
    Response.json({
      trainer: {
        id: trainer.id,
        name: trainer.name,
        username: trainer.username,
        photoUrl: trainer.photoUrl,
        isDemo: trainer.tgId === "demo",
        subscriptionTier: trainer.subscriptionTier,
        monthlyGoal: trainer.monthlyGoal,
        avgSessionPrice: trainer.avgSessionPrice,
        onboardingComplete: trainer.onboardingComplete,
      },
    }),
  );
}
