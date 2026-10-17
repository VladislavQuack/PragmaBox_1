import { notFound } from "next/navigation";
import SetupGuide from "@/components/SetupGuide";
import { guidesEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  // В витринном режиме страницы-инструкции недоступны
  if (!guidesEnabled()) notFound();
  // Токен не показываем, только факт его наличия
  return <SetupGuide hasToken={Boolean(process.env.TELEGRAM_BOT_TOKEN)} />;
}
