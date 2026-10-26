// Правила тарифов. Лимит Free защищён на сервере; в бете (см. beta.ts) его нет.
import { BETA } from "./beta";

export const FREE_CLIENT_LIMIT = 3;

// Сколько клиентов можно вписать прямо на первом запуске. Остальных — из приложения.
export const ONBOARDING_MAX_CLIENTS = 3;

export type SubscriptionTier = "free" | "premium";

export function clientLimitForTier(tier: string | null | undefined): number | null {
  if (BETA) return null;
  return tier === "premium" ? null : FREE_CLIENT_LIMIT;
}

// Подпись тарифа в шапке профиля и на карточке в профиле
export function planLabel(tier: string | null | undefined): string {
  if (BETA) return "Beta";
  return tier === "premium" ? "Premium" : "Free";
}
