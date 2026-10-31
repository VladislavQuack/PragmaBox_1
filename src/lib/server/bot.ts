// Бот PragmaBox: рассказывает о приложении, принимает отзывы, продаёт Premium за звёзды Telegram,
// выдаёт ссылку для друзей и кнопку установки мини-аппа на главный экран.
// Пока идёт бета (BETA в src/lib/beta.ts) — рассказывает о бете и бонусах, Premium видит только владелец.
import {
  BETA,
  MIN_REVIEW_LENGTH,
  PRICE_OPTIONS,
  REFERRAL_BONUS_MONTHS,
  REVIEW_BONUS_MONTHS,
  monthsLabel,
  parseRefPayload,
  referralLink,
  shareUrl,
} from "@/lib/beta";
import { plural } from "@/lib/plural";
import {
  BOT_TIME_ZONE,
  FREE_CLIENT_LIMIT,
  TRIAL_DAYS,
  daysLeft,
  fmtUntil,
  periodLabel,
  planById,
  plansFor,
  termsLines,
} from "@/lib/subscription";
import { upsertTrainer, type Trainer } from "@/lib/server/auth";
import { betaStatus, isMissingTable, recordReferral, savePriceAnswer, submitReview, trainerLabel } from "@/lib/server/beta";
import {
  announcePayment,
  applyPayment,
  checkCheckout,
  getPremiumInfo,
  isAdmin,
  paymentLine,
  paymentsByIds,
  paymentsOfUser,
  paymentsOpenFor,
  premiumStats,
  recentPayments,
  reconcilePending,
  refundPayment,
  sendInvoiceMessage,
  type CheckoutVerdict,
} from "@/lib/server/premium";
import {
  botUsername,
  escapeHtml,
  notifyAdmins,
  sendMessage,
  tgCall,
  trySendMessage,
  type InlineButton,
} from "@/lib/server/telegram";

interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgChat {
  id: number;
  type: string;
}

interface TgSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  successful_payment?: TgSuccessfulPayment;
  reply_to_message?: { message_id: number; from?: TgUser; text?: string };
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
  message?: { message_id: number; chat: TgChat };
}

// Telegram спрашивает перед списанием звёзд: в порядке ли заказ. Ответить нужно за 10 секунд
interface TgPreCheckoutQuery {
  id: string;
  from: TgUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  pre_checkout_query?: TgPreCheckoutQuery;
}

const B = (n: number) => `<b>${monthsLabel(n)}</b>`;

function trainerFor(user: TgUser) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || `id${user.id}`;
  return upsertTrainer({ tgId: String(user.id), name, username: user.username ?? null });
}

// Кнопки, открывающие мини-апп прямо из чата. Telegram принимает только https-адреса.
function appRows(origin: string | null): InlineButton[][] {
  if (!origin?.startsWith("https://")) return [];
  return [
    [{ text: "🚀 Открыть PragmaBox", web_app: { url: `${origin}/` } }],
    [{ text: "📲 Установить на телефон", web_app: { url: `${origin}/?install=1` } }],
  ];
}

function actionRows(): InlineButton[][] {
  if (BETA) {
    return [
      [
        { text: "✍️ Оставить отзыв", callback_data: "review" },
        { text: "🤝 Пригласить друга", callback_data: "invite" },
      ],
      [{ text: "🎁 Мои бонусы", callback_data: "bonus" }],
    ];
  }
  return [
    [{ text: "⭐ Premium — клиенты без лимита", callback_data: "premium" }],
    [
      { text: "✍️ Отзыв", callback_data: "review" },
      { text: "🤝 Пригласить друга", callback_data: "invite" },
    ],
  ];
}

const PRICE_ROWS: InlineButton[][] = [
  PRICE_OPTIONS.slice(0, 2).map((o) => ({ text: o.label, callback_data: `price:${o.id}` })),
  PRICE_OPTIONS.slice(2).map((o) => ({ text: o.label, callback_data: `price:${o.id}` })),
];

// Приветствие: сначала — что это и чем полезно, условия — одной строкой в конце
async function sendWelcome(chatId: number, firstName: string, origin: string | null, invitedBy: string | null) {
  const lines = [
    `<b>Привет${firstName ? `, ${escapeHtml(firstName)}` : ""}! Это PragmaBox</b> — рабочий кабинет персонального тренера прямо в Telegram.`,
    invitedBy ? `Вас пригласил(а) <b>${escapeHtml(invitedBy)}</b> — добро пожаловать!` : null,
    [
      `Что внутри:`,
      `• расписание дня — клиента можно записать за пару касаний;`,
      `• абонементы — занятия списываются сами, видно, когда пора продлевать;`,
      `• оплаты — кто сколько должен и сколько вы заработали за месяц;`,
      `• замеры клиентов с графиками прогресса.`,
    ].join("\n"),
    BETA
      ? `Сейчас идёт бета: всё бесплатно, клиентов — сколько угодно. Первая настройка займёт около минуты.`
      : `Первые ${TRIAL_DAYS} дней — Premium бесплатно: клиентов сколько угодно. Дальше — бесплатно до ${FREE_CLIENT_LIMIT} клиентов или Premium за звёзды Telegram. Первая настройка займёт около минуты.`,
    BETA
      ? `🎁 За отзыв и приглашённого друга-тренера — до ${B(REVIEW_BONUS_MONTHS + REFERRAL_BONUS_MONTHS)} Premium, когда выйдет платная версия.`
      : null,
  ];
  await sendMessage(chatId, lines.filter(Boolean).join("\n\n"), [...appRows(origin), ...actionRows()]);
}

function sendReviewPrompt(chatId: number) {
  return sendMessage(
    chatId,
    [
      `✍️ <b>Напишите отзыв прямо в этот чат</b> — одним сообщением.`,
      `Что нравится, что неудобно, чего не хватает — пишите как есть, каждый отзыв читает разработчик.`,
      BETA ? `За отзыв от ${MIN_REVIEW_LENGTH} символов — ${B(REVIEW_BONUS_MONTHS)} Premium после беты.` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

async function sendInvite(chatId: number, trainerId: number, alreadyRewarded: boolean) {
  const username = await botUsername();
  if (!username) {
    await sendMessage(chatId, "Не получилось сделать ссылку, попробуйте чуть позже.");
    return;
  }
  const link = referralLink(username, trainerId);
  const shareText = BETA
    ? undefined
    : `Попробуй PragmaBox — расписание, клиенты и оплаты тренера прямо в Telegram. Первые ${TRIAL_DAYS} дней Premium бесплатно 👇`;
  await sendMessage(
    chatId,
    [
      `🤝 <b>Пригласите друга-тренера</b>`,
      `Ваша личная ссылка:\n${link}`,
      !BETA
        ? `По ней друг откроет PragmaBox, а первые ${TRIAL_DAYS} дней Premium у него бесплатно.`
        : alreadyRewarded
          ? `✅ Бонус за друга уже ваш. Но приглашайте ещё — это очень помогает проекту.`
          : `Когда друг откроет PragmaBox по ней и пройдёт первую настройку, вы получите ${B(REFERRAL_BONUS_MONTHS)} Premium после беты.`,
    ].join("\n\n"),
    [[{ text: "📤 Отправить другу", url: shareUrl(link, shareText) }]],
  );
}

async function sendBonus(chatId: number, trainer: Trainer) {
  const s = await betaStatus(trainer);
  if (!s.available) {
    await sendMessage(chatId, "🎁 Бонусная программа вот-вот заработает — загляните чуть позже.");
    return;
  }
  if (!BETA) {
    // Бета закончилась: заработанные месяцы уже добавлены к сроку Premium
    const info = await getPremiumInfo(trainer, { sync: true });
    await sendMessage(
      chatId,
      s.totalMonths > 0
        ? `🎁 <b>Бонусы беты включены:</b> +${B(s.totalMonths)} Premium.${info.until ? ` Premium до <b>${fmtUntil(info.until, BOT_TIME_ZONE)}</b>.` : ""}`
        : `🎁 Бонусная программа беты завершена — спасибо всем, кто помогал! Premium — /premium.`,
    );
    return;
  }
  const review = s.reviewMonths ? `✅ ${B(s.reviewMonths)}` : "ещё не оставлен";
  const friend = s.referralMonths
    ? `✅ ${B(s.referralMonths)}`
    : s.invited > 0
      ? `приглашено: ${s.invited}, ждём, когда друг пройдёт настройку`
      : "пока никого не приглашали";
  const total = s.totalMonths > 0
    ? `Итого: ${B(s.totalMonths)} Premium после беты.`
    : `Можно получить до ${B(REVIEW_BONUS_MONTHS + REFERRAL_BONUS_MONTHS)} Premium.`;
  const rows: InlineButton[][] = [];
  if (!s.reviewMonths) rows.push([{ text: "✍️ Оставить отзыв", callback_data: "review" }]);
  rows.push([{ text: "🤝 Пригласить друга", callback_data: "invite" }]);
  await sendMessage(chatId, [`🎁 <b>Ваши бонусы</b>`, `✍️ Отзыв: ${review}\n🤝 Друг: ${friend}`, total].join("\n\n"), rows);
}

// ───────── Premium ─────────

async function sendPremium(chatId: number, trainer: Trainer, origin: string | null) {
  if (!paymentsOpenFor(trainer.tgId)) {
    return sendMessage(
      chatId,
      `Сейчас идёт бета: все функции бесплатны, клиентов — без лимита. Premium появится, когда бета закончится.`,
      appRows(origin).slice(0, 1),
    );
  }
  const info = await getPremiumInfo(trainer, { sync: true });
  if (!info.available) return sendMessage(chatId, "⭐ Оплата Premium вот-вот заработает — загляните чуть позже.");

  const left = info.until ? daysLeft(info.until) : 0;
  const status = info.lifetime
    ? `У вас Premium навсегда 🎉`
    : info.active && info.until
      ? info.trial
        ? `Сейчас пробный Premium: ещё ${left} ${plural(left, "день", "дня", "дней")}, до ${fmtUntil(info.until, BOT_TIME_ZONE)}.`
        : `У вас Premium до <b>${fmtUntil(info.until, BOT_TIME_ZONE)}</b>.`
      : !info.trialUsed && !trainer.onboardingComplete && !BETA
        ? `После первой настройки в приложении — ${TRIAL_DAYS} дней Premium бесплатно.`
        : `Сейчас бесплатный план: до ${FREE_CLIENT_LIMIT} клиентов.`;
  const plans = plansFor(info.isAdmin);
  const lines = [
    `⭐ <b>PragmaBox Premium</b> — клиенты без лимита. Всё остальное бесплатно и так.`,
    BETA ? `🧪 Идёт бета: оплата видна только вам, чтобы проверить её до запуска.` : null,
    status,
    info.lifetime
      ? null
      : plans
          .filter((p) => !p.adminOnly)
          .map((p) => `• ${p.title} — ${p.stars} ⭐${p.badge ? ` (${p.badge})` : ""}`)
          .join("\n"),
    info.lifetime
      ? null
      : `Разовая оплата звёздами Telegram, без автосписаний.${info.active ? " Срок прибавится к текущему." : ""}`,
    `Условия — /terms, помощь с оплатой — /paysupport.`,
  ];
  const rows: InlineButton[][] = info.lifetime
    ? []
    : plans.map((p) => [{ text: `${p.title} — ${p.stars} ⭐`, callback_data: `buy:${p.id}` }]);
  if (origin?.startsWith("https://")) rows.push([{ text: "📱 Открыть в приложении", web_app: { url: `${origin}/?premium=1` } }]);
  return sendMessage(chatId, lines.filter(Boolean).join("\n\n"), rows);
}

async function buyInBot(chatId: number, trainer: Trainer, planId: string) {
  const plan = planById(planId);
  if (!plan || (plan.adminOnly && !isAdmin(trainer.tgId))) return sendMessage(chatId, "Такого тарифа нет. Откройте /premium.");
  if (!paymentsOpenFor(trainer.tgId)) return sendMessage(chatId, "Оплата откроется, когда закончится бета.");
  try {
    await sendInvoiceMessage(trainer, plan, chatId);
  } catch (e) {
    if (isMissingTable(e)) return sendMessage(chatId, "⭐ Оплата Premium вот-вот заработает — загляните чуть позже.");
    throw e;
  }
}

function sendTerms(chatId: number) {
  return sendMessage(
    chatId,
    [`📄 <b>Условия PragmaBox Premium</b>`, termsLines().map((l, i) => `${i + 1}. ${l}`).join("\n\n")].join("\n\n"),
  );
}

// Ответ на это сообщение — обращение по оплате. Заголовок по нему и узнаём
const PAYSUPPORT_TITLE = "💳 Помощь с оплатой";

function sendPaySupport(chatId: number) {
  return sendMessage(
    chatId,
    [
      `<b>${PAYSUPPORT_TITLE}</b>`,
      `Опишите, что случилось, <b>ответом на это сообщение</b>: что покупали и когда. Если звёзды списались, а Premium не включился, — включим его или вернём звёзды.`,
      `Отвечаем здесь же, обычно в течение дня.`,
    ].join("\n\n"),
    undefined,
    { reply_markup: { force_reply: true, input_field_placeholder: "Что случилось с оплатой?" } },
  );
}

async function handlePaySupportRequest(text: string, from: TgUser, chatId: number) {
  const trainer = await trainerFor(from);
  let list: Awaited<ReturnType<typeof paymentsOfUser>> = [];
  try {
    list = await paymentsOfUser(trainer.tgId);
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  await notifyAdmins(
    [
      `🆘 <b>Помощь с оплатой</b>`,
      trainerLabel(trainer),
      escapeHtml(text.slice(0, 3000)),
      list.length ? `Платежи:\n${list.map((p) => escapeHtml(paymentLine(p))).join("\n")}` : `Платежей нет.`,
      `Ответить: <code>/reply ${escapeHtml(trainer.tgId)} текст</code> · вернуть звёзды: /refund`,
    ].join("\n\n"),
  );
  return sendMessage(chatId, "Передал разработчику — ответим здесь же 🙌");
}

// ───────── Команды владельца ─────────

const chunk = <T,>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

async function sendStats(chatId: number) {
  const s = await premiumStats();
  const usd = (s.stars * 0.013).toFixed(2);
  await sendMessage(
    chatId,
    [
      `📊 <b>PragmaBox</b>${BETA ? " · идёт бета" : ""}`,
      `Тренеров: ${s.trainers}, прошли настройку: ${s.onboarded}`,
      `Premium сейчас: ${s.premiumActive}, из них пробный: ${s.onTrial}`,
      `Открывали оплату: ${s.openedTrainers} · оплатили: ${s.paidTrainers}`,
      `Оплат: ${s.paidCount} на ${s.stars} ⭐ (≈ $${usd} при выводе)${s.refunds ? ` · возвратов: ${s.refunds}` : ""}`,
      `<i>Тестовые оплаты за 1 ⭐ не считаются.</i>`,
    ].join("\n"),
  );
}

async function sendRefundList(chatId: number) {
  const list = await recentPayments({ status: "paid", limit: 10 });
  if (list.length === 0) return sendMessage(chatId, "Оплат пока нет — возвращать нечего.");
  return sendMessage(
    chatId,
    [
      `↩️ <b>Вернуть звёзды</b>`,
      `Последние оплаты. Нажмите номер — бот переспросит перед возвратом:`,
      list.map((p) => escapeHtml(paymentLine(p))).join("\n"),
    ].join("\n\n"),
    chunk(
      list.map((p) => ({ text: `№${p.id}`, callback_data: `refund:${p.id}` })),
      5,
    ),
  );
}

async function confirmRefund(chatId: number, id: number) {
  const [p] = await paymentsByIds([id]);
  if (!p) return sendMessage(chatId, `Платёж №${id} не найден.`);
  if (p.status !== "paid") return sendMessage(chatId, `№${id}: ${p.status === "refunded" ? "звёзды уже возвращены" : "счёт не оплачен"}.`);
  return sendMessage(
    chatId,
    `Вернуть ${p.stars} ⭐ за №${p.id}?${p.months || p.days ? ` Premium покупателя сократится на ${periodLabel(p)}.` : ""}`,
    [
      [
        { text: "Да, вернуть", callback_data: `refund_ok:${p.id}` },
        { text: "Отмена", callback_data: "refund_no" },
      ],
    ],
  );
}

async function doRefund(chatId: number, id: number) {
  const result = await refundPayment(id);
  if (!result.ok) return sendMessage(chatId, `Не вернули №${id}: ${escapeHtml(result.error)}`);
  const left = result.until && result.until.getTime() > Date.now() ? `Premium покупателя до ${fmtUntil(result.until, BOT_TIME_ZONE)}.` : "Premium покупателя выключен.";
  return sendMessage(chatId, `✅ Вернули ${result.payment.stars} ⭐ за №${id}. ${left}`);
}

async function sendReply(chatId: number, payload: string) {
  const match = /^(\d{3,15})\s+([\s\S]+)$/.exec(payload.trim());
  if (!match) return sendMessage(chatId, "Формат: <code>/reply ID текст</code>. ID есть в сообщении об обращении.");
  const delivered = await trySendMessage(match[1], `💬 <b>Ответ поддержки PragmaBox</b>\n\n${escapeHtml(match[2].trim())}`);
  return sendMessage(
    chatId,
    delivered ? "Отправлено ✅" : "Не доставлено: пользователь не запускал бота или заблокировал его.",
  );
}

async function sendSync(chatId: number) {
  const { checked, found } = await reconcilePending(7);
  return sendMessage(
    chatId,
    checked === 0
      ? "Неоплаченных счетов за 7 дней нет — сверять нечего."
      : `Проверил неоплаченные счета за 7 дней: ${checked}. Нашёл оплат, которые не дошли до бота: ${found}.`,
  );
}

// Команды владельца. true — команда обработана
async function handleAdminCommand(command: string, payload: string, chatId: number): Promise<boolean> {
  try {
    switch (command) {
      case "stats":
        await sendStats(chatId);
        return true;
      case "refund": {
        const id = Number(payload.replace(/^№/, "").trim());
        await (Number.isSafeInteger(id) && id > 0 ? confirmRefund(chatId, id) : sendRefundList(chatId));
        return true;
      }
      case "sync":
        await sendSync(chatId);
        return true;
      case "reply":
        await sendReply(chatId, payload);
        return true;
      default:
        return false;
    }
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    await sendMessage(chatId, "Таблиц Premium ещё нет в базе: выполните sql/2026-11-premium.sql в Neon (SQL Editor).");
    return true;
  }
}

function sendInstall(chatId: number, origin: string | null) {
  const rows = appRows(origin);
  if (rows.length === 0) return sendMessage(chatId, "Кнопка установки появится, когда приложение опубликовано по https-адресу.");
  return sendMessage(
    chatId,
    `📲 <b>Установите PragmaBox на телефон</b>\n\nНажмите кнопку ниже — откроется приложение и предложит добавить иконку на главный экран. Дальше PragmaBox запускается одним касанием, как обычное приложение.`,
    [rows[1]],
  );
}

function sendHelp(chatId: number, origin: string | null, admin: boolean) {
  const commands = BETA
    ? [
        `/app — открыть PragmaBox`,
        `/install — установить на главный экран`,
        `/review — оставить отзыв (${monthsLabel(REVIEW_BONUS_MONTHS)} Premium)`,
        `/invite — пригласить друга (${monthsLabel(REFERRAL_BONUS_MONTHS)} Premium)`,
        `/bonus — мои бонусы`,
      ]
    : [
        `/app — открыть PragmaBox`,
        `/premium — Premium: клиенты без лимита`,
        `/install — установить на главный экран`,
        `/review — оставить отзыв`,
        `/invite — пригласить друга`,
        `/terms — условия Premium`,
        `/paysupport — помощь с оплатой`,
      ];
  return sendMessage(
    chatId,
    [
      `<b>Что умеет бот</b>`,
      commands.join("\n"),
      `Вопросы и идеи пишите прямо сюда — их прочитает разработчик.`,
      admin
        ? [
            `<b>Для владельца</b>`,
            `/stats — тренеры, пробный период и оплаты`,
            `/premium — проверить оплату${BETA ? " (в бете видно только вам)" : ""}`,
            `/refund — вернуть звёзды`,
            `/sync — сверить неоплаченные счета с Telegram`,
            `/reply ID текст — ответить пользователю от имени бота`,
          ].join("\n")
        : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    appRows(origin).slice(0, 1),
  );
}

async function handleCommand(command: string, payload: string, from: TgUser, chatId: number, origin: string | null) {
  const trainer = await trainerFor(from);
  const admin = isAdmin(trainer.tgId);
  if (admin && (await handleAdminCommand(command, payload, chatId))) return;
  switch (command) {
    case "start": {
      if (payload === "review") return sendReviewPrompt(chatId);
      if (payload === "invite") return sendInvite(chatId, trainer.id, false);
      if (payload === "bonus") return sendBonus(chatId, trainer);
      if (payload === "install") return sendInstall(chatId, origin);
      if (payload === "premium") return sendPremium(chatId, trainer, origin);
      if (payload === "paysupport") return sendPaySupport(chatId);
      let invitedBy: string | null = null;
      const inviterId = parseRefPayload(payload);
      if (inviterId) {
        try {
          invitedBy = (await recordReferral(trainer, inviterId))?.name ?? null;
        } catch (e) {
          if (!isMissingTable(e)) throw e;
        }
      }
      return sendWelcome(chatId, from.first_name ?? "", origin, invitedBy);
    }
    case "app":
      return sendMessage(chatId, "🚀 Открываем рабочий день:", appRows(origin).slice(0, 1));
    case "install":
      return sendInstall(chatId, origin);
    case "review":
      return sendReviewPrompt(chatId);
    case "invite": {
      const s = await betaStatus(trainer);
      return sendInvite(chatId, trainer.id, Boolean(s.referralMonths));
    }
    case "bonus":
      return sendBonus(chatId, trainer);
    case "premium":
      return sendPremium(chatId, trainer, origin);
    case "terms":
      return sendTerms(chatId);
    case "paysupport":
      return sendPaySupport(chatId);
    case "id":
      return sendMessage(
        chatId,
        `Ваш Telegram ID: <code>${from.id}</code>\n\nВладельцу бота: впишите его в переменную BOT_ADMIN_IDS на Vercel, чтобы получать отзывы и уведомления об оплатах.`,
      );
    default:
      return sendHelp(chatId, origin, admin);
  }
}

async function handleText(text: string, from: TgUser, chatId: number) {
  const trainer = await trainerFor(from);
  let result;
  try {
    result = await submitReview(trainer, text, "bot");
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    // Таблиц беты ещё нет — хотя бы перешлём сообщение владельцу
    await notifyAdmins(`📝 <b>Сообщение в боте</b>\n${trainerLabel(trainer)}\n\n${escapeHtml(text.slice(0, 3000))}`);
    return sendMessage(chatId, "Спасибо, передал разработчику! 🙌");
  }
  if (result.rewarded) {
    return sendMessage(
      chatId,
      [
        `🙏 <b>Спасибо за отзыв!</b>`,
        `${B(REVIEW_BONUS_MONTHS)} Premium закреплены за вами — включатся, когда закончится бета.`,
        `И последний вопрос: сколько вы были бы готовы платить за PragmaBox в месяц?`,
      ].join("\n\n"),
      PRICE_ROWS,
    );
  }
  if (BETA && result.tooShort && !result.alreadyRewarded) {
    return sendMessage(
      chatId,
      `Спасибо! 🙌 Чтобы получить бонус, напишите чуть подробнее — от ${MIN_REVIEW_LENGTH} символов: что нравится и чего не хватает.`,
    );
  }
  return sendMessage(chatId, "Спасибо, передал разработчику! 🙌 Пишите ещё — каждое сообщение читаем.");
}

// Звёзды списаны: отмечаем оплату и продлеваем Premium
async function handleSuccessfulPayment(msg: TgMessage, from: TgUser, sp: TgSuccessfulPayment) {
  const trainer = await trainerFor(from);
  try {
    const result = await applyPayment({
      payload: sp.invoice_payload,
      chargeId: sp.telegram_payment_charge_id,
      amount: sp.total_amount,
      tgId: String(from.id),
      trainerId: trainer.id,
    });
    await announcePayment(result);
  } catch (e) {
    console.error("[premium] payment not applied:", e);
    await notifyAdmins(
      [
        `⚠️ <b>Оплата не записалась</b>`,
        trainerLabel(trainer),
        `${sp.total_amount} ⭐ · charge <code>${escapeHtml(sp.telegram_payment_charge_id)}</code>`,
        `Запустите /sync. Если не поможет — включите Premium вручную или верните звёзды.`,
      ].join("\n"),
    );
    await trySendMessage(
      msg.chat.id,
      "⭐ Оплата получена! Premium включится в течение нескольких минут. Если этого не случится — напишите /paysupport.",
    );
  }
}

async function handleMessage(msg: TgMessage, origin: string | null) {
  // Бот работает только в личке: в группах молчим
  if (msg.chat.type !== "private" || !msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id;
  if (msg.successful_payment) {
    await handleSuccessfulPayment(msg, msg.from, msg.successful_payment);
    return;
  }
  const text = (msg.text ?? msg.caption ?? "").trim();
  if (!text) {
    await sendMessage(chatId, "Я пока понимаю только текст 🙂 Напишите отзыв или вопрос словами — их прочитает разработчик.");
    return;
  }
  if (text.startsWith("/")) {
    const [raw, ...rest] = text.split(/\s+/);
    const command = raw.slice(1).split("@")[0].toLowerCase();
    await handleCommand(command, rest.join(" "), msg.from, chatId, origin);
    return;
  }
  const replyTo = msg.reply_to_message;
  if (replyTo?.from?.is_bot && replyTo.text?.startsWith(PAYSUPPORT_TITLE)) {
    await handlePaySupportRequest(text, msg.from, chatId);
    return;
  }
  await handleText(text, msg.from, chatId);
}

async function handleCallback(q: TgCallbackQuery, origin: string | null) {
  const chatId = q.message?.chat.id;
  const data = q.data ?? "";
  if (!chatId || q.message?.chat.type !== "private") {
    await tgCall("answerCallbackQuery", { callback_query_id: q.id });
    return;
  }
  const trainer = await trainerFor(q.from);

  if (data.startsWith("price:")) {
    let label: string | null = null;
    try {
      label = await savePriceAnswer(trainer, data.slice("price:".length), "bot");
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }
    await tgCall("answerCallbackQuery", { callback_query_id: q.id, text: label ? "Спасибо, записал!" : undefined });
    if (label && q.message) {
      // Убираем кнопки, чтобы не ответить дважды
      await tgCall("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: { inline_keyboard: [] },
      }).catch(() => undefined);
      await sendMessage(chatId, `Записал: <b>${escapeHtml(label)}</b>. Спасибо, это очень поможет выбрать честную цену!`);
    }
    return;
  }

  await tgCall("answerCallbackQuery", { callback_query_id: q.id });

  // Возврат звёзд — только владельцу
  const refund = /^refund(_ok)?:(\d+)$/.exec(data);
  if ((refund || data === "refund_no") && isAdmin(trainer.tgId)) {
    if (q.message) {
      await tgCall("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: { inline_keyboard: [] },
      }).catch(() => undefined);
    }
    if (data === "refund_no") return void (await sendMessage(chatId, "Ок, ничего не возвращаем."));
    const id = Number(refund![2]);
    return void (await (refund![1] ? doRefund(chatId, id) : confirmRefund(chatId, id)));
  }

  if (data.startsWith("buy:")) return void (await buyInBot(chatId, trainer, data.slice("buy:".length)));
  if (data === "premium") return void (await sendPremium(chatId, trainer, origin));
  if (data === "review") return void (await sendReviewPrompt(chatId));
  if (data === "invite") {
    const s = await betaStatus(trainer);
    return void (await sendInvite(chatId, trainer.id, Boolean(s.referralMonths)));
  }
  if (data === "bonus") return void (await sendBonus(chatId, trainer));
}

async function handlePreCheckout(q: TgPreCheckoutQuery) {
  let verdict: CheckoutVerdict;
  try {
    verdict = await checkCheckout({
      payload: q.invoice_payload,
      tgId: String(q.from.id),
      amount: q.total_amount,
      currency: q.currency,
    });
  } catch (e) {
    if (!isMissingTable(e)) console.error("[premium] checkout check failed:", e);
    verdict = { ok: false, error: "Оплата временно недоступна. Попробуйте через пару минут." };
  }
  await tgCall(
    "answerPreCheckoutQuery",
    verdict.ok
      ? { pre_checkout_query_id: q.id, ok: true }
      : { pre_checkout_query_id: q.id, ok: false, error_message: verdict.error },
  );
}

export async function handleUpdate(update: TgUpdate, origin: string | null) {
  if (update.pre_checkout_query) await handlePreCheckout(update.pre_checkout_query);
  else if (update.message) await handleMessage(update.message, origin);
  else if (update.callback_query) await handleCallback(update.callback_query, origin);
}
