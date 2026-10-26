import { withTrainer } from "@/lib/server/auth";
import { betaStatus } from "@/lib/server/beta";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withTrainer(req, async (trainer) => Response.json(await betaStatus(trainer)));
}
