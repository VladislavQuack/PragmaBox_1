// Premium на сервере: пробный период, бонусы беты, счета в звёздах Telegram, оплаты и возвраты.
//
// Как проходит оплата:
// 1. Приложение просит счёт (POST /api/premium) — создаём строку payments (pending)
//    и ссылку на счёт через createInvoiceLink (валюта XTR — звёзды, без платёжного провайдера).
// 2. Telegram перед списанием спрашивает бота (pre_checkout_query) — checkCheckout отвечает,
//    в порядке ли заказ. На ответ у бота 10 секунд.
// 3. После списания бот получает successful_payment — applyPayment отмечает оплату и продлевает
//    Premium. Повторная доставка того же платежа ничего не начислит второй раз.
// Если сообщение об оплате не дошло, reconcile* находит платёж в getStarTransactions.
import { after } from "next/server";
import { and, count, countDistinct, desc, eq, gte, inArray, isNull, ne, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { payments, premium, rewards, trainers } from "@/db/schema";
import { BETA, monthsLabel } from "@/lib/beta";
import {
  BOT_TIME_ZONE,
  FREE_CLIENT_LIMIT,
  PLANS,
  TRIAL_DAYS,
  fmtUntil,
  periodLabel,
  planById,
  type Plan,
  type PlanId,
  type PremiumInfo,
} from "@/lib/subscription";
import { isMissingTable, trainerLabel } from "@/lib/server/beta";
import { TelegramApiError, adminIds, appOrigin, notifyAdmins, tgCall, trySendMessage, type InlineButton } from "@/lib/server/telegram";

type Trainer = typeof trainers.$inferSelect;
export type PremiumRow = typeof premium.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

const DAY_MS = 86_400_000;

export const isAdmin = (tgId: string) => adminIds().includes(tgId);

// Оплата открыта после беты. Пока идёт бета — только владельцу, чтобы проверить её до запуска.
export const paymentsOpenFor = (tgId: string) => !BETA || isAdmin(tgId);

// Демо-тренер в браузере — не пользователь Telegram: писать и возвращать звёзды некуда
const chatIdOf = (tgId: string) => (/^\d+$/.test(tgId) ? tgId : null);

function errorCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code ?? err?.cause?.code;
}

// Вызвать после ответа пользователю. Вне обработчика запроса after() недоступен — тогда сразу.
function later(task: () => Promise<unknown>) {
  const run = () => task().catch((e) => console.error("[premium] background task failed:", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

export async function loadPremium(trainerId: number): Promise<PremiumRow | null> {
  const [row] = await db.select().from(premium).where(eq(premium.trainerId, trainerId)).limit(1);
  return row ?? null;
}

async function rewardMonths(trainerId: number): Promise<number> {
  try {
    const [row] = await db.select({ total: sum(rewards.months) }).from(rewards).where(eq(rewards.trainerId, trainerId));
    return Number(row?.total ?? 0);
  } catch (e) {
    if (isMissingTable(e)) return 0;
    throw e;
  }
}

const interval = (months: number, days: number) => sql`make_interval(months => ${months}::int, days => ${days}::int)`;
// Новый срок: от текущего, если Premium ещё действует, иначе от сегодня
const extendedUntil = (months: number, days: number) =>
  sql`greatest(coalesce(${premium.activeUntil}, now()), now()) + ${interval(months, days)}`;

export interface SyncResult {
  row: PremiumRow | null;
  trialGranted: boolean;
  bonusAdded: number;
}

// Пробный период и бонусы беты. Пока идёт бета, ничего не начисляем — лимита и так нет.
// После беты: пробный период — когда тренер прошёл первую настройку (один раз),
// бонусные месяцы за отзыв и друга — сразу, тоже один раз. Можно вызывать сколько угодно.
export async function syncPremium(trainer: Trainer): Promise<SyncResult> {
  let row = await loadPremium(trainer.id);
  if (BETA) return { row, trialGranted: false, bonusAdded: 0 };

  let trialGranted = false;
  if (trainer.onboardingComplete && !row?.trialStartedAt) {
    const [granted] = await db
      .insert(premium)
      .values({ trainerId: trainer.id, activeUntil: sql`now() + ${interval(0, TRIAL_DAYS)}`, trialStartedAt: sql`now()` })
      .onConflictDoUpdate({
        target: premium.trainerId,
        set: { activeUntil: extendedUntil(0, TRIAL_DAYS), trialStartedAt: sql`now()`, updatedAt: sql`now()` },
        setWhere: isNull(premium.trialStartedAt),
      })
      .returning();
    if (granted) {
      row = granted;
      trialGranted = true;
    }
  }

  let bonusAdded = 0;
  const total = await rewardMonths(trainer.id);
  const before = row?.bonusMonths ?? 0;
  if (total > before) {
    const [updated] = await db
      .insert(premium)
      .values({ trainerId: trainer.id, activeUntil: sql`now() + ${interval(total, 0)}`, bonusMonths: total })
      .onConflictDoUpdate({
        target: premium.trainerId,
        set: {
          activeUntil: sql`greatest(coalesce(${premium.activeUntil}, now()), now()) + make_interval(months => ${total}::int - ${premium.bonusMonths})`,
          bonusMonths: total,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${premium.bonusMonths} < ${total}`,
      })
      .returning();
    if (updated) {
      bonusAdded = total - before;
      row = updated;
      const chatId = chatIdOf(trainer.tgId);
      const until = updated.activeUntil;
      if (chatId && until) {
        later(() =>
          trySendMessage(
            chatId,
            `🎁 <b>Бета закончилась — спасибо, что помогали!</b>\nВаши бонусы включены: +${monthsLabel(bonusAdded)} Premium. Клиенты без лимита до <b>${fmtUntil(until, BOT_TIME_ZONE)}</b>.`,
          ),
        );
      }
    }
  }
  return { row, trialGranted, bonusAdded };
}

export function premiumInfo(trainer: Trainer, row: PremiumRow | null, available: boolean, now = new Date()): PremiumInfo {
  const lifetime = trainer.subscriptionTier === "premium";
  const until = row?.activeUntil ?? null;
  const activeByDate = Boolean(until && until.getTime() > now.getTime());
  const trialEnd = row?.trialStartedAt ? row.trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS : null;
  return {
    available,
    active: lifetime || activeByDate,
    until: !lifetime && until ? until.toISOString() : null,
    lifetime,
    // Срок не дальше конца пробного периода — значит, ничего не докупали
    trial: !lifetime && activeByDate && trialEnd !== null && until!.getTime() <= trialEnd + 60_000,
    trialUsed: Boolean(row?.trialStartedAt),
    bonusMonths: row?.bonusMonths ?? 0,
    canBuy: available && !lifetime && paymentsOpenFor(trainer.tgId),
    isAdmin: isAdmin(trainer.tgId),
  };
}

// Состояние Premium для приложения. sync — заодно выдать пробный период и бонусы, если пора.
// Сбой здесь не должен ломать приложение: без таблиц или при ошибке базы — available: false
// (лимита нет, оплата недоступна).
export async function getPremiumInfo(trainer: Trainer, { sync = false } = {}): Promise<PremiumInfo> {
  try {
    const row = sync ? (await syncPremium(trainer)).row : await loadPremium(trainer.id);
    return premiumInfo(trainer, row, true);
  } catch (e) {
    if (!isMissingTable(e)) console.error("[premium] status failed:", e);
    return premiumInfo(trainer, null, false);
  }
}

// Сколько клиентов можно вести. null — без лимита. Пока таблиц Premium нет — тоже без лимита.
export async function clientLimitForTrainer(trainer: Trainer): Promise<number | null> {
  if (BETA || trainer.subscriptionTier === "premium") return null;
  try {
    const { row } = await syncPremium(trainer);
    return row?.activeUntil && row.activeUntil.getTime() > Date.now() ? null : FREE_CLIENT_LIMIT;
  } catch (e) {
    if (!isMissingTable(e)) console.error("[premium] limit check failed:", e);
    return null;
  }
}

// ───────── Счета ─────────

// Полезная нагрузка счёта — по ней узнаём заказ, когда Telegram сообщает об оплате (до 128 байт)
export const paymentPayload = (paymentId: number, plan: PlanId) => `prem:${paymentId}:${plan}`;

export function parsePayload(payload: string | undefined | null): { id: number; plan: PlanId } | null {
  const m = /^prem:(\d{1,12}):(month|year|test)$/.exec(payload ?? "");
  return m ? { id: Number(m[1]), plan: m[2] as PlanId } : null;
}

export function invoiceParams(paymentId: number, plan: Plan) {
  return {
    title: plan.invoiceTitle,
    description: plan.adminOnly
      ? "Проверка оплаты: Premium на 1 день за 1 звезду. Звезду можно вернуть командой /refund."
      : `Клиенты без лимита на ${periodLabel(plan)}. Разовая оплата звёздами, без автосписаний.`,
    payload: paymentPayload(paymentId, plan.id),
    currency: "XTR",
    prices: [{ label: plan.label, amount: plan.stars }],
  };
}

async function newPayment(trainer: Trainer, plan: Plan) {
  const [row] = await db
    .insert(payments)
    .values({ trainerId: trainer.id, tgId: trainer.tgId, plan: plan.id, stars: plan.stars, months: plan.months, days: plan.days })
    .returning({ id: payments.id });
  return row.id;
}

// Ссылка на счёт для мини-аппа: приложение открывает её через Telegram.WebApp.openInvoice
export async function createInvoiceLink(trainer: Trainer, plan: Plan): Promise<{ link: string; paymentId: number }> {
  const paymentId = await newPayment(trainer, plan);
  try {
    const link = await tgCall<string>("createInvoiceLink", invoiceParams(paymentId, plan));
    return { link, paymentId };
  } catch (e) {
    // Счёт не создан — не считаем, что тренер открывал оплату
    await db.delete(payments).where(eq(payments.id, paymentId)).catch(() => undefined);
    throw e;
  }
}

// Счёт сообщением в чат с ботом — для покупки прямо из бота
export async function sendInvoiceMessage(trainer: Trainer, plan: Plan, chatId: number) {
  const paymentId = await newPayment(trainer, plan);
  try {
    await tgCall("sendInvoice", { chat_id: chatId, ...invoiceParams(paymentId, plan) });
  } catch (e) {
    await db.delete(payments).where(eq(payments.id, paymentId)).catch(() => undefined);
    throw e;
  }
}

// ───────── Перед списанием ─────────

export type CheckoutVerdict = { ok: true } | { ok: false; error: string };

// Ответ на pre_checkout_query. Текст ошибки Telegram покажет покупателю.
export async function checkCheckout(q: { payload: string; tgId: string; amount: number; currency: string }): Promise<CheckoutVerdict> {
  const fail = (error: string): CheckoutVerdict => ({ ok: false, error });
  const parsed = parsePayload(q.payload);
  if (!parsed || q.currency !== "XTR") return fail("Не нашли этот счёт. Откройте оплату в PragmaBox заново.");
  const [p] = await db.select().from(payments).where(eq(payments.id, parsed.id)).limit(1);
  if (!p || p.tgId !== q.tgId || p.plan !== parsed.plan) return fail("Не нашли этот счёт. Откройте оплату в PragmaBox заново.");
  if (p.status !== "pending") {
    return fail("Этот счёт уже оплачен. Чтобы продлить Premium ещё, откройте оплату в PragmaBox заново.");
  }
  const plan = planById(p.plan);
  if (!plan || plan.stars !== p.stars || q.amount !== p.stars) return fail("Цена изменилась. Откройте оплату в PragmaBox заново.");
  if (plan.adminOnly && !isAdmin(q.tgId)) return fail("Этот тариф недоступен.");
  if (!paymentsOpenFor(q.tgId)) return fail("Оплата откроется, когда закончится бета.");
  return { ok: true };
}

// ───────── После списания ─────────

export interface PaymentResult {
  status: "applied" | "duplicate";
  payment: PaymentRow;
  // Новый срок Premium (null — платёж не продлевает Premium)
  until: Date | null;
}

const planByStars = (stars: number) => PLANS.find((p) => !p.adminOnly && p.stars === stars) ?? null;

// Отмечает оплату и продлевает Premium. Повторная доставка того же платежа (тот же chargeId) — duplicate.
// Если тот же счёт оплатили дважды или заказ не нашёлся, звёзды всё равно пришли: записываем
// отдельную оплату и продлеваем Premium — лишнее можно вернуть через /refund.
export async function applyPayment(input: {
  payload: string;
  chargeId: string;
  amount: number;
  tgId: string;
  trainerId?: number | null;
}): Promise<PaymentResult> {
  try {
    return await db.transaction(async (tx) => {
      const [dup] = await tx.select().from(payments).where(eq(payments.chargeId, input.chargeId)).limit(1);
      if (dup) return { status: "duplicate" as const, payment: dup, until: null };

      const parsed = parsePayload(input.payload);
      const [row] = parsed
        ? await tx.select().from(payments).where(eq(payments.id, parsed.id)).for("update").limit(1)
        : [];
      const now = new Date();
      let paid: PaymentRow;
      if (row && row.status === "pending" && row.tgId === input.tgId) {
        [paid] = await tx
          .update(payments)
          .set({ status: "paid", chargeId: input.chargeId, paidAt: now, stars: input.amount })
          .where(eq(payments.id, row.id))
          .returning();
      } else {
        const plan = planById(row?.plan ?? parsed?.plan) ?? planByStars(input.amount);
        [paid] = await tx
          .insert(payments)
          .values({
            trainerId: row?.tgId === input.tgId ? row.trainerId : (input.trainerId ?? null),
            tgId: input.tgId,
            plan: plan?.id ?? "unknown",
            stars: input.amount,
            months: plan?.months ?? 0,
            days: plan?.days ?? 0,
            status: "paid",
            chargeId: input.chargeId,
            paidAt: now,
          })
          .returning();
      }

      let until: Date | null = null;
      if (paid.trainerId && (paid.months || paid.days)) {
        const [p] = await tx
          .insert(premium)
          .values({ trainerId: paid.trainerId, activeUntil: sql`now() + ${interval(paid.months, paid.days)}` })
          .onConflictDoUpdate({
            target: premium.trainerId,
            set: { activeUntil: extendedUntil(paid.months, paid.days), updatedAt: sql`now()` },
          })
          .returning({ until: premium.activeUntil });
        until = p?.until ?? null;
      }
      return { status: "applied" as const, payment: paid, until };
    });
  } catch (e) {
    // Тот же платёж пришёл одновременно дважды: второй упёрся в уникальный charge_id
    if (errorCode(e) === "23505") {
      const [dup] = await db.select().from(payments).where(eq(payments.chargeId, input.chargeId)).limit(1);
      if (dup) return { status: "duplicate", payment: dup, until: null };
    }
    throw e;
  }
}

function appButton(): InlineButton[][] {
  const origin = appOrigin();
  return origin?.startsWith("https://") ? [[{ text: "🚀 Открыть PragmaBox", web_app: { url: `${origin}/` } }]] : [];
}

const planTitle = (p: Pick<PaymentRow, "plan" | "months" | "days">) =>
  planById(p.plan)?.label ?? (p.months || p.days ? `Premium на ${periodLabel(p)}` : "Неизвестный счёт");

// Сообщения покупателю и владельцу после оплаты
export async function announcePayment(result: PaymentResult) {
  if (result.status !== "applied") return;
  const p = result.payment;
  const chatId = chatIdOf(p.tgId);
  if (chatId) {
    const text =
      p.plan === "test"
        ? `✅ <b>Тестовая оплата прошла.</b>${result.until ? ` Premium продлён до ${fmtUntil(result.until, BOT_TIME_ZONE)}.` : ""}\nВернуть звезду — /refund.`
        : result.until
          ? `⭐ <b>Premium подключён!</b>\nКлиенты без лимита до <b>${fmtUntil(result.until, BOT_TIME_ZONE)}</b>.\nСпасибо, что поддерживаете PragmaBox 🙌`
          : `⭐ Оплата получена, спасибо! Если Premium не включился, напишите /paysupport — разберёмся.`;
    await trySendMessage(chatId, text, p.plan === "test" ? undefined : appButton());
  }
  const [trainer] = p.trainerId ? await db.select().from(trainers).where(eq(trainers.id, p.trainerId)).limit(1) : [];
  const who = trainer ? trainerLabel(trainer) : `id ${p.tgId}`;
  const stats = await premiumStats().catch(() => null);
  await notifyAdmins(
    [
      `⭐ <b>Оплата</b> · ${planTitle(p)} · ${p.stars} ⭐`,
      who,
      result.until ? `Premium до ${fmtUntil(result.until, BOT_TIME_ZONE)}` : `⚠️ Срок не продлён: тариф не распознан (№${p.id}). Проверьте /refund.`,
      stats ? `Всего: ${stats.paidCount} опл. на ${stats.stars} ⭐ · открывали оплату: ${stats.openedTrainers}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

// ───────── Сверка с Telegram ─────────

interface StarTransaction {
  id: string;
  amount: number;
  date: number;
  source?: { type: string; user?: { id: number }; invoice_payload?: string };
}

// Входящие платежи бота из getStarTransactions. Страниц не больше maxPages по 100 платежей.
async function fetchStarTransactions(maxPages = 20): Promise<StarTransaction[]> {
  const all: StarTransaction[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await tgCall<{ transactions: StarTransaction[] }>("getStarTransactions", { offset: page * 100, limit: 100 });
    all.push(...res.transactions);
    if (res.transactions.length < 100) break;
  }
  return all.filter((t) => t.source?.type === "user" && t.source.invoice_payload);
}

async function applyFound(p: PaymentRow, list: StarTransaction[]): Promise<PaymentResult | null> {
  const payload = paymentPayload(p.id, p.plan as PlanId);
  const hit = list.find((t) => t.source?.invoice_payload === payload && String(t.source?.user?.id) === p.tgId);
  if (!hit) return null;
  const result = await applyPayment({ payload, chargeId: hit.id, amount: hit.amount, tgId: p.tgId, trainerId: p.trainerId });
  if (result.status === "applied") await announcePayment(result);
  return result;
}

// Когда последний раз искали платёж в Telegram: не чаще раза в 3 секунды на счёт
const lastLookup = new Map<number, number>();

// Приложение получило «оплачено», а сообщение об оплате ещё не дошло: ищем платёж в Telegram сами.
// Только для свежих счетов — старые сверяет владелец командой /sync.
export async function reconcilePayment(paymentId: number, tgId: string): Promise<PaymentRow | null> {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!p || p.tgId !== tgId) return null;
  if (p.status !== "pending" || Date.now() - p.createdAt.getTime() > DAY_MS) return p;
  const last = lastLookup.get(p.id) ?? 0;
  if (Date.now() - last < 3000) return p;
  lastLookup.set(p.id, Date.now());
  if (lastLookup.size > 500) lastLookup.clear();
  const result = await applyFound(p, await fetchStarTransactions(5));
  return result?.payment ?? p;
}

// /sync у владельца: все неоплаченные счета за последние дни
export async function reconcilePending(days = 7): Promise<{ checked: number; found: number }> {
  const since = new Date(Date.now() - days * DAY_MS);
  const pending = await db
    .select()
    .from(payments)
    .where(and(eq(payments.status, "pending"), gte(payments.createdAt, since)));
  if (pending.length === 0) return { checked: 0, found: 0 };
  const list = await fetchStarTransactions();
  let found = 0;
  for (const p of pending) {
    if (await applyFound(p, list)) found++;
  }
  return { checked: pending.length, found };
}

// ───────── Возвраты ─────────

export type RefundResult = { ok: true; payment: PaymentRow; until: Date | null } | { ok: false; error: string };

// Возвращает звёзды и сокращает Premium на оплаченный срок
export async function refundPayment(paymentId: number): Promise<RefundResult> {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!p) return { ok: false, error: "Платёж не найден" };
  if (p.status === "refunded") return { ok: false, error: "Звёзды за этот платёж уже возвращены" };
  if (p.status !== "paid" || !p.chargeId) return { ok: false, error: "Этот счёт не оплачен" };
  const userId = Number(p.tgId);
  if (!Number.isSafeInteger(userId)) return { ok: false, error: "У платежа нет Telegram ID покупателя" };

  try {
    await tgCall("refundStarPayment", { user_id: userId, telegram_payment_charge_id: p.chargeId });
  } catch (e) {
    const already = e instanceof TelegramApiError && /CHARGE_ALREADY_REFUNDED/i.test(e.description);
    if (!already) {
      return { ok: false, error: e instanceof TelegramApiError ? e.description : "Telegram не ответил, попробуйте позже" };
    }
  }

  const result = await db.transaction(async (tx) => {
    const [done] = await tx
      .update(payments)
      .set({ status: "refunded", refundedAt: new Date() })
      .where(and(eq(payments.id, p.id), eq(payments.status, "paid")))
      .returning();
    if (!done) return null;
    let until: Date | null = null;
    if (done.trainerId && (done.months || done.days)) {
      const [row] = await tx
        .update(premium)
        .set({ activeUntil: sql`${premium.activeUntil} - ${interval(done.months, done.days)}`, updatedAt: sql`now()` })
        .where(eq(premium.trainerId, done.trainerId))
        .returning({ until: premium.activeUntil });
      until = row?.until ?? null;
    }
    return { payment: done, until };
  });
  if (!result) return { ok: false, error: "Звёзды за этот платёж уже возвращены" };

  const chatId = chatIdOf(p.tgId);
  if (chatId) {
    const left = result.until && result.until.getTime() > Date.now() ? `Premium до ${fmtUntil(result.until, BOT_TIME_ZONE)}.` : "Premium выключен.";
    await trySendMessage(chatId, `↩️ Вернули ${p.stars} ⭐ за «${planTitle(p)}». ${left}`);
  }
  return { ok: true, ...result };
}

// ───────── Для владельца ─────────

export interface PaymentListItem extends PaymentRow {
  name: string | null;
  username: string | null;
}

export async function recentPayments({ status, tgId, limit = 10 }: { status?: string; tgId?: string; limit?: number } = {}) {
  const where = and(status ? eq(payments.status, status) : undefined, tgId ? eq(payments.tgId, tgId) : undefined);
  const rows = await db
    .select({ p: payments, name: trainers.name, username: trainers.username })
    .from(payments)
    .leftJoin(trainers, eq(trainers.id, payments.trainerId))
    .where(where)
    .orderBy(desc(payments.id))
    .limit(limit);
  return rows.map((r) => ({ ...r.p, name: r.name, username: r.username })) as PaymentListItem[];
}

export function paymentLine(p: PaymentListItem | PaymentRow): string {
  const when = (p.paidAt ?? p.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" });
  const who = "name" in p && p.name ? ` · ${p.name}${p.username ? ` (@${p.username})` : ""}` : "";
  const status = p.status === "paid" ? "" : p.status === "refunded" ? " · возвращено" : " · не оплачен";
  return `№${p.id} · ${when}${who} · ${planTitle(p)} · ${p.stars} ⭐${status}`;
}

export interface PremiumStats {
  trainers: number;
  onboarded: number;
  premiumActive: number;
  onTrial: number;
  openedTrainers: number;
  paidTrainers: number;
  paidCount: number;
  stars: number;
  refunds: number;
}

// Воронка для /stats. Тестовые оплаты владельца за 1 звезду не считаем.
export async function premiumStats(): Promise<PremiumStats> {
  const notTest = ne(payments.plan, "test");
  const now = new Date();
  const [[t], [p], [opened], [paid], [refunds]] = await Promise.all([
    db
      .select({ total: count(), onboarded: count(sql`case when ${trainers.onboardingComplete} then 1 end`) })
      .from(trainers),
    db
      .select({
        active: count(),
        trial: count(
          sql`case when ${premium.trialStartedAt} is not null and ${premium.activeUntil} <= ${premium.trialStartedAt} + make_interval(days => ${TRIAL_DAYS}::int) + interval '1 minute' then 1 end`,
        ),
      })
      .from(premium)
      .where(sql`${premium.activeUntil} > ${now}`),
    db.select({ trainers: countDistinct(payments.tgId) }).from(payments).where(notTest),
    db
      .select({ trainers: countDistinct(payments.tgId), count: count(), stars: sum(payments.stars) })
      .from(payments)
      .where(and(notTest, eq(payments.status, "paid"))),
    db.select({ count: count() }).from(payments).where(and(notTest, eq(payments.status, "refunded"))),
  ]);
  return {
    trainers: Number(t?.total ?? 0),
    onboarded: Number(t?.onboarded ?? 0),
    premiumActive: Number(p?.active ?? 0),
    onTrial: Number(p?.trial ?? 0),
    openedTrainers: Number(opened?.trainers ?? 0),
    paidTrainers: Number(paid?.trainers ?? 0),
    paidCount: Number(paid?.count ?? 0),
    stars: Number(paid?.stars ?? 0),
    refunds: Number(refunds?.count ?? 0),
  };
}

// Для pay-support: последние платежи тренера
export async function paymentsOfUser(tgId: string) {
  return recentPayments({ tgId, limit: 5 });
}

// Платежи по номерам (кнопки возврата)
export async function paymentsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  return db.select().from(payments).where(inArray(payments.id, ids));
}
