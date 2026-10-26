// Бета-тест: все функции бесплатны, а за помощь проекту тренер получает Premium
// после запуска платной версии. Условия меняются здесь — бот и приложение берут их отсюда.

// true — лимита клиентов нет ни у кого. Когда бета закончится, поставь false.
export const BETA = true;

// Бонусы складываются: отзыв + приглашённый друг = 18 месяцев Premium.
export const REVIEW_BONUS_MONTHS = 6;
export const REFERRAL_BONUS_MONTHS = 12;

// Короткое «ок» — не отзыв: бонус не начисляем и просим написать подробнее.
export const MIN_REVIEW_LENGTH = 30;
export const MAX_REVIEW_LENGTH = 3000;

// Ответы на вопрос «сколько вы готовы платить в месяц» — по ним потом выберем цену.
export const PRICE_OPTIONS = [
  { id: "0", label: "Не готов платить" },
  { id: "200", label: "До 200 ₽" },
  { id: "400", label: "200–400 ₽" },
  { id: "700", label: "400–700 ₽" },
  { id: "more", label: "Больше 700 ₽" },
] as const;

export type PriceOptionId = (typeof PRICE_OPTIONS)[number]["id"];
export type RewardKind = "review" | "referral";

export const priceOption = (id: unknown) => PRICE_OPTIONS.find((o) => o.id === id) ?? null;

// Ссылка-приглашение: бот получит /start ref_<id> и запомнит, кто позвал друга.
export const REF_PREFIX = "ref_";
export const referralLink = (botUsername: string, trainerId: number) =>
  `https://t.me/${botUsername}?start=${REF_PREFIX}${trainerId}`;

export function parseRefPayload(payload: string | null | undefined): number | null {
  const match = /^ref_(\d{1,10})$/.exec((payload ?? "").trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const SHARE_TEXT =
  "Попробуй PragmaBox — расписание, клиенты и оплаты тренера прямо в Telegram. Сейчас бета, всё бесплатно 👇";

// Окно «Поделиться» Telegram: друг выбирает чат, ссылка уходит с текстом.
export const shareUrl = (link: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(SHARE_TEXT)}`;

// 1 месяц, 2 месяца, 6 месяцев, 12 месяцев, 18 месяцев
export function monthsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "месяц"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "месяца"
        : "месяцев";
  return `${n} ${word}`;
}

// Ответ GET /api/beta
export interface BetaStatus {
  // false — таблицы беты ещё не созданы в базе: бонусы временно недоступны
  available: boolean;
  botUsername: string | null;
  referralLink: string | null;
  reviewMonths: number | null;
  referralMonths: number | null;
  totalMonths: number;
  invited: number;
  activated: number;
  priceAnswered: boolean;
}
