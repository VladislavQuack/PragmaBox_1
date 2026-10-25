import { withTrainer } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
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
