// Бета-тест на сервере: отзывы, бонусные месяцы Premium и приглашения друзей.
import { and, count, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { feedback, referrals, rewards, trainers } from "@/db/schema";
import {
  BETA,
  MAX_REVIEW_LENGTH,
  MIN_REVIEW_LENGTH,
  REFERRAL_BONUS_MONTHS,
  REVIEW_BONUS_MONTHS,
  monthsLabel,
  priceOption,
  referralLink,
  type BetaStatus,
  type RewardKind,
} from "@/lib/beta";
import { botUsername, escapeHtml, notifyAdmins, trySendMessage } from "@/lib/server/telegram";

type Trainer = typeof trainers.$inferSelect;

// Таблицы беты ещё не созданы в базе (не выполнен drizzle-kit push).
// Drizzle заворачивает ошибку Postgres, поэтому код ищем и в cause.
export function isMissingTable(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "42P01" || err?.cause?.code === "42P01";
}

// «Новый» тренер — запись создана только что. Чужая ссылка-приглашение,
// открытая старым пользователем, приглашением не считается.
const FRESH_MS = 15 * 60 * 1000;
export const isFreshTrainer = (t: Trainer) => Date.now() - t.createdAt.getTime() < FRESH_MS;

// Подпись тренера в сообщениях владельцу
export function trainerLabel(t: Trainer): string {
  const user = t.username ? ` (@${escapeHtml(t.username)})` : "";
  return `${escapeHtml(t.name)}${user} · id ${escapeHtml(t.tgId)}`;
}

// Демо-тренер в браузере — не настоящий пользователь Telegram, писать ему некуда.
const chatIdOf = (t: Trainer) => (/^\d+$/.test(t.tgId) ? t.tgId : null);

// Начисляет бонус, если такого ещё не было. true — начислен именно сейчас.
export async function grantReward(trainerId: number, kind: RewardKind, months: number): Promise<boolean> {
  const inserted = await db
    .insert(rewards)
    .values({ trainerId, kind, months })
    .onConflictDoNothing()
    .returning({ id: rewards.id });
  return inserted.length > 0;
}

async function hasReward(trainerId: number, kind: RewardKind): Promise<boolean> {
  const [row] = await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(and(eq(rewards.trainerId, trainerId), eq(rewards.kind, kind)))
    .limit(1);
  return Boolean(row);
}

export interface ReviewResult {
  rewarded: boolean;
  alreadyRewarded: boolean;
  tooShort: boolean;
}

// Отзыв сохраняем всегда, а бонус — один раз и только за развёрнутый текст.
// Бонусы — программа беты: после неё отзывы просто доходят до разработчика.
export async function submitReview(trainer: Trainer, rawText: string, source: "bot" | "app"): Promise<ReviewResult> {
  const text = rawText.trim().slice(0, MAX_REVIEW_LENGTH);
  await db.insert(feedback).values({ trainerId: trainer.id, kind: "review", text, source });

  const tooShort = text.length < MIN_REVIEW_LENGTH;
  const rewarded = tooShort || !BETA ? false : await grantReward(trainer.id, "review", REVIEW_BONUS_MONTHS);
  const alreadyRewarded = rewarded || !BETA ? false : await hasReward(trainer.id, "review");

  const status = !BETA
    ? "после беты, без бонуса"
    : rewarded
      ? `начислено ${monthsLabel(REVIEW_BONUS_MONTHS)}`
      : alreadyRewarded
        ? "бонус уже был"
        : "коротко, без бонуса";
  const where = source === "app" ? "из приложения" : "в боте";
  // Владельцу — после ответа пользователю, чтобы не задерживать его
  after(() =>
    notifyAdmins(`📝 <b>Отзыв</b> ${where} · ${status}\n${trainerLabel(trainer)}\n\n${escapeHtml(text)}`),
  );
  return { rewarded, alreadyRewarded, tooShort };
}

export async function savePriceAnswer(trainer: Trainer, optionId: unknown, source: "bot" | "app") {
  const option = priceOption(optionId);
  if (!option) return null;
  await db.insert(feedback).values({ trainerId: trainer.id, kind: "price", text: option.label, source });
  after(() => notifyAdmins(`💰 ${trainerLabel(trainer)} готов платить: <b>${option.label}</b>`));
  return option.label;
}

// Новый тренер пришёл по ссылке друга. Возвращает пригласившего, если приглашение записано сейчас.
export async function recordReferral(invitee: Trainer, inviterId: number): Promise<Trainer | null> {
  if (inviterId === invitee.id || !isFreshTrainer(invitee)) return null;
  const [inviter] = await db.select().from(trainers).where(eq(trainers.id, inviterId)).limit(1);
  if (!inviter) return null;
  const inserted = await db
    .insert(referrals)
    .values({ inviteeId: invitee.id, inviterId })
    .onConflictDoNothing()
    .returning({ id: referrals.inviteeId });
  return inserted.length > 0 ? inviter : null;
}

// Тренер прошёл первую настройку. Если его пригласили — пригласивший получает бонус
// (один раз, за первого друга; только пока идёт бета), а владелец узнаёт о новом пользователе.
export async function onTrainerActivated(trainer: Trainer, clientCount: number) {
  let inviter: Trainer | null = null;
  let granted = false;
  try {
    const [ref] = await db
      .update(referrals)
      .set({ activatedAt: new Date() })
      .where(and(eq(referrals.inviteeId, trainer.id), isNull(referrals.activatedAt)))
      .returning({ inviterId: referrals.inviterId });
    if (ref) {
      [inviter] = await db.select().from(trainers).where(eq(trainers.id, ref.inviterId)).limit(1);
    }
    if (inviter) {
      granted = BETA ? await grantReward(inviter.id, "referral", REFERRAL_BONUS_MONTHS) : false;
      const chatId = chatIdOf(inviter);
      const name = escapeHtml(trainer.name);
      if (chatId) {
        await trySendMessage(
          chatId,
          granted
            ? `🎉 <b>Ваш друг ${name} начал пользоваться PragmaBox!</b>\n${monthsLabel(REFERRAL_BONUS_MONTHS)} Premium после беты — ваши. Спасибо, что рассказываете о нас!`
            : `🎉 Ещё один друг с нами: <b>${name}</b>. Спасибо, что рассказываете о PragmaBox!`,
        );
      }
    }
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }

  const isNew = Date.now() - trainer.createdAt.getTime() < 24 * 60 * 60 * 1000;
  if (inviter) {
    await notifyAdmins(
      `🤝 ${trainerLabel(trainer)} пришёл по приглашению ${trainerLabel(inviter)} и прошёл настройку · клиентов: ${clientCount}` +
        (granted ? `\nПригласившему начислено ${monthsLabel(REFERRAL_BONUS_MONTHS)}` : ""),
    );
  } else if (isNew) {
    await notifyAdmins(`✅ Новый тренер прошёл настройку: ${trainerLabel(trainer)} · клиентов: ${clientCount}`);
  }
}

export async function betaStatus(trainer: Trainer): Promise<BetaStatus> {
  const username = await botUsername();
  const base = {
    botUsername: username,
    referralLink: username ? referralLink(username, trainer.id) : null,
  };
  try {
    const [rows, [refs], [price]] = await Promise.all([
      db
        .select({ kind: rewards.kind, months: rewards.months })
        .from(rewards)
        .where(eq(rewards.trainerId, trainer.id)),
      db
        .select({ invited: count(), activated: count(referrals.activatedAt) })
        .from(referrals)
        .where(eq(referrals.inviterId, trainer.id)),
      db
        .select({ id: feedback.id })
        .from(feedback)
        .where(and(eq(feedback.trainerId, trainer.id), eq(feedback.kind, "price")))
        .limit(1),
    ]);
    const months = (kind: RewardKind) => rows.find((r) => r.kind === kind)?.months ?? null;
    return {
      available: true,
      ...base,
      reviewMonths: months("review"),
      referralMonths: months("referral"),
      totalMonths: rows.reduce((sum, r) => sum + r.months, 0),
      invited: Number(refs?.invited ?? 0),
      activated: Number(refs?.activated ?? 0),
      priceAnswered: Boolean(price),
    };
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    return {
      available: false,
      ...base,
      reviewMonths: null,
      referralMonths: null,
      totalMonths: 0,
      invited: 0,
      activated: 0,
      priceAnswered: false,
    };
  }
}
