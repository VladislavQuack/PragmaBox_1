// Правила тарифов: что даёт Premium, сколько стоит и сколько длится пробный период.
// Цены и сроки меняются здесь — приложение, бот и сервер берут их отсюда.
// Лимит Free защищён на сервере (src/lib/server/premium.ts); пока идёт бета (см. beta.ts), лимита нет.
import { BETA } from "./beta";
import { plural } from "./plural";

// Сколько клиентов можно вести без Premium
export const FREE_CLIENT_LIMIT = 3;

// Сколько клиентов можно вписать прямо на первом запуске. Остальных — из приложения.
export const ONBOARDING_MAX_CLIENTS = 3;

// Пробный Premium для новых тренеров: начинается после первой настройки, выдаётся один раз.
// Когда бета закончится, его получат и те, кто уже пользуется приложением, — с первого входа после запуска.
export const TRIAL_DAYS = 14;

export type PlanId = "month" | "year" | "test";

export interface Plan {
  id: PlanId;
  // Название на экране Premium
  title: string;
  // Заголовок счёта в Telegram — не длиннее 32 символов
  invoiceTitle: string;
  // Строка с суммой в счёте
  label: string;
  // Цена в звёздах Telegram
  stars: number;
  // На сколько продлевается Premium
  months: number;
  days: number;
  // Подпись под названием на экране Premium
  note?: string;
  // Выгода тарифа — показываем и в боте
  badge?: string;
  // Только для владельца (BOT_ADMIN_IDS): проверить оплату за одну звезду
  adminOnly?: boolean;
}

// Разовые покупки, без автосписаний: когда срок закончится, Premium просто выключится.
export const PLANS: Plan[] = [
  {
    id: "month",
    title: "Месяц",
    invoiceTitle: "PragmaBox Premium — месяц",
    label: "Premium на месяц",
    stars: 200,
    months: 1,
    days: 0,
    note: "Разово, без автосписаний",
  },
  {
    id: "year",
    title: "Год",
    invoiceTitle: "PragmaBox Premium — год",
    label: "Premium на год",
    stars: 2000,
    months: 12,
    days: 0,
    note: "2 месяца в подарок",
    badge: "2 месяца в подарок",
  },
  {
    id: "test",
    title: "Проверка оплаты",
    invoiceTitle: "PragmaBox Premium — тест",
    label: "Premium на 1 день",
    stars: 1,
    months: 0,
    days: 1,
    note: "1 день · видно только вам",
    adminOnly: true,
  },
];

export const planById = (id: unknown): Plan | null => PLANS.find((p) => p.id === id) ?? null;

// Планы, которые видит тренер: тестовый — только владельцу
export const plansFor = (isAdmin: boolean) => PLANS.filter((p) => !p.adminOnly || isAdmin);

// «1 месяц», «12 месяцев», «1 день»
export function periodLabel(plan: Pick<Plan, "months" | "days">): string {
  if (plan.months) return `${plan.months} ${plural(plan.months, "месяц", "месяца", "месяцев")}`;
  return `${plan.days} ${plural(plan.days, "день", "дня", "дней")}`;
}

// Состояние Premium тренера — сервер отдаёт его в /api/me и /api/premium
export interface PremiumInfo {
  // false — таблицы Premium ещё не созданы в базе (не выполнен SQL): лимита нет, оплата недоступна
  available: boolean;
  // Premium действует прямо сейчас
  active: boolean;
  // До какого момента действует (ISO). null — не было ни разу или выдан навсегда
  until: string | null;
  // Выдан навсегда вручную: в базе subscription_tier = 'premium'
  lifetime: boolean;
  // Сейчас идёт пробный период
  trial: boolean;
  // Пробный период уже выдавался (второй раз не выдаётся)
  trialUsed: boolean;
  // Бонусные месяцы беты, уже добавленные к сроку
  bonusMonths: number;
  // Можно оплатить: после беты — всем, пока идёт бета — только владельцу, для проверки
  canBuy: boolean;
  // Владелец бота (BOT_ADMIN_IDS): видит тестовый план за 1 звезду
  isAdmin: boolean;
}

// Сколько клиентов можно вести. null — без лимита.
// Пока таблиц Premium нет (available: false), лимит не включаем: иначе выкатка кода раньше SQL
// заблокировала бы всех.
export function clientLimit(premium: PremiumInfo | null | undefined): number | null {
  if (BETA) return null;
  if (!premium || !premium.available || premium.active) return null;
  return FREE_CLIENT_LIMIT;
}

// Подпись тарифа в шапке профиля
export function planLabel(premium: PremiumInfo | null | undefined): string {
  if (BETA) return "Beta";
  return premium?.active ? "Premium" : "Free";
}

// Сколько дней осталось (неполный день считается целым)
export function daysLeft(untilIso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((Date.parse(untilIso) - now.getTime()) / 86_400_000));
}

// «30 ноября 2026». В приложении — по часам телефона, в сообщениях бота — по Москве
export function fmtUntil(iso: string | Date, timeZone?: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d
    .toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone })
    .replace(/\s*г\.$/, "");
}

// Часовой пояс для дат в сообщениях бота: сервер работает по UTC, а тренеры — в основном по Москве
export const BOT_TIME_ZONE = "Europe/Moscow";

// Условия покупки: команда /terms в боте и «Условия» на экране Premium
export function termsLines(): string[] {
  const month = planById("month")!;
  const year = planById("year")!;
  return [
    `Premium снимает лимит на число клиентов. Без Premium можно вести до ${FREE_CLIENT_LIMIT} клиентов, остальные функции бесплатны.`,
    `Новым пользователям — ${TRIAL_DAYS} дней Premium бесплатно после первой настройки.`,
    `Оплата — звёздами Telegram, разово: месяц — ${month.stars} ⭐, год — ${year.stars} ⭐. Автосписаний нет.`,
    `Срок считается со дня оплаты. Если Premium уже действует, новый срок прибавляется к текущему.`,
    `Когда срок закончится, Premium выключится. Клиенты и все данные останутся, но добавить новых сверх ${FREE_CLIENT_LIMIT} будет нельзя.`,
    `Если после оплаты Premium не включился или что-то пошло не так, напишите боту /paysupport — разберёмся и при необходимости вернём звёзды.`,
    `Поддержка Telegram не помогает с покупками в этом боте — пишите нам через /paysupport.`,
  ];
}
