// Абонементы: общие правила для сервера и интерфейса.
// Занятия списываются с последнего абонемента, где они ещё остались (так же решает сервер),
// а в карточке клиента показываем его или — если все закончились — самый свежий.
import { plural } from "./plural";
import type { ClientDTO, PackageDTO } from "./types";

export const PACKAGE_MAX_SESSIONS = 100;
export const PACKAGE_MAX_PRICE = 10_000_000;
export const PACKAGE_SIZES = [4, 8, 12, 16];

export const sessionsWord = (n: number) => plural(n, "занятие", "занятия", "занятий");
export const sessionsLabel = (n: number) => `${n} ${sessionsWord(n)}`;

// Название формируем сами: в старых записях встречается «Абонемент 4 занятий»
export const packageTitle = (total: number) => `Абонемент на ${sessionsLabel(total)}`;

// Абонемент, с которого спишется следующее занятие
export function activePackage(client: ClientDTO | null | undefined): PackageDTO | null {
  if (!client) return null;
  return client.packages.filter((p) => p.remainingSessions > 0).at(-1) ?? null;
}

// Абонемент для карточки клиента: действующий, а если таких нет — последний
export function currentPackage(client: ClientDTO | null | undefined): PackageDTO | null {
  if (!client) return null;
  return activePackage(client) ?? client.packages.at(-1) ?? null;
}

// Цена одного занятия из абонемента: она идёт в доход, когда занятие проведено
export function perSessionPrice(pkg: Pick<PackageDTO, "price" | "totalSessions">): number {
  return pkg.totalSessions > 0 ? Math.round(pkg.price / pkg.totalSessions) : 0;
}

export function isExpired(pkg: Pick<PackageDTO, "expiresAt">, today: Date): boolean {
  if (!pkg.expiresAt) return false;
  const [y, m, d] = pkg.expiresAt.split("-").map(Number);
  return new Date(y, m - 1, d).getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}
