import AppShell from "@/components/AppShell";
import { guidesEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <AppShell showGuides={guidesEnabled()} />;
}
