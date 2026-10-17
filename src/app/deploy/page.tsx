import { notFound } from "next/navigation";
import DeployGuide from "@/components/DeployGuide";
import { guidesEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default function DeployPage() {
  // В витринном режиме страницы-инструкции недоступны
  if (!guidesEnabled()) notFound();
  return <DeployGuide />;
}
