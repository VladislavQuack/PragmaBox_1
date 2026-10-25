// Правила тарифов. Premium-платёж подключим позже, но лимит Free уже защищён на сервере.
export const FREE_CLIENT_LIMIT = 3;

export type SubscriptionTier = "free" | "premium";

export function clientLimitForTier(tier: string | null | undefined): number | null {
  return tier === "premium" ? null : FREE_CLIENT_LIMIT;
}

export function clientLimitText(tier: string | null | undefined): string {
  const limit = clientLimitForTier(tier);
  return limit === null ? "без лимита" : `до ${limit} клиентов`;
}
