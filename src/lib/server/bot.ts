// Бот PragmaBox: рассказывает о бете, принимает отзывы, выдаёт ссылку для друзей
// и кнопку установки мини-аппа на главный экран.
import {
  MIN_REVIEW_LENGTH,
  PRICE_OPTIONS,
  REFERRAL_BONUS_MONTHS,
  REVIEW_BONUS_MONTHS,
  monthsLabel,
  parseRefPayload,
  referralLink,
  shareUrl,
} from "@/lib/beta";
import { upsertTrainer } from "@/lib/server/auth";
import { betaStatus, isMissingTable, recordReferral, savePriceAnswer, submitReview, trainerLabel } from "@/lib/server/beta";
import {
  botUsername,
  escapeHtml,
  notifyAdmins,
  sendMessage,
  tgCall,
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

interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
  message?: { message_id: number; chat: TgChat };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
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

const ACTION_ROWS: InlineButton[][] = [
  [
    { text: "✍️ Оставить отзыв", callback_data: "review" },
    { text: "🤝 Пригласить друга", callback_data: "invite" },
  ],
  [{ text: "🎁 Мои бонусы", callback_data: "bonus" }],
];

const PRICE_ROWS: InlineButton[][] = [
  PRICE_OPTIONS.slice(0, 2).map((o) => ({ text: o.label, callback_data: `price:${o.id}` })),
  PRICE_OPTIONS.slice(2).map((o) => ({ text: o.label, callback_data: `price:${o.id}` })),
];

async function sendWelcome(chatId: number, firstName: string, origin: string | null, invitedBy: string | null) {
  const lines = [
    `👋 <b>Привет${firstName ? `, ${escapeHtml(firstName)}` : ""}! Это PragmaBox</b> — рабочий кабинет персонального тренера прямо в Telegram: расписание дня, клиенты, абонементы, оплаты и замеры.`,
    invitedBy ? `🤝 Вас пригласил(а) <b>${escapeHtml(invitedBy)}</b> — добро пожаловать!` : null,
    `🧪 <b>Идёт бета-тест.</b> Все функции открыты и бесплатны, клиентов — сколько угодно.`,
    [
      `🎁 <b>Бонусы участникам беты</b> — Premium, когда выйдет платная версия:`,
      `• ✍️ за отзыв — ${B(REVIEW_BONUS_MONTHS)};`,
      `• 🤝 за друга-тренера, который начнёт пользоваться, — ${B(REFERRAL_BONUS_MONTHS)}.`,
    ].join("\n"),
    origin?.startsWith("https://")
      ? `📲 Нажмите «Установить на телефон» — PragmaBox появится иконкой на главном экране, как обычное приложение.`
      : null,
  ];
  await sendMessage(chatId, lines.filter(Boolean).join("\n\n"), [...appRows(origin), ...ACTION_ROWS]);
}

function sendReviewPrompt(chatId: number) {
  return sendMessage(
    chatId,
    [
      `✍️ <b>Напишите отзыв прямо в этот чат</b> — одним сообщением.`,
      `Что нравится, что неудобно, чего не хватает — пишите как есть, каждый отзыв читает разработчик.`,
      `За отзыв от ${MIN_REVIEW_LENGTH} символов — ${B(REVIEW_BONUS_MONTHS)} Premium после беты.`,
    ].join("\n\n"),
  );
}

async function sendInvite(chatId: number, trainerId: number, alreadyRewarded: boolean) {
  const username = await botUsername();
  if (!username) {
    await sendMessage(chatId, "Не получилось сделать ссылку, попробуйте чуть позже.");
    return;
  }
  const link = referralLink(username, trainerId);
  await sendMessage(
    chatId,
    [
      `🤝 <b>Пригласите друга-тренера</b>`,
      `Ваша личная ссылка:\n${link}`,
      alreadyRewarded
        ? `✅ Бонус за друга уже ваш. Но приглашайте ещё — это очень помогает проекту.`
        : `Когда друг откроет PragmaBox по ней и пройдёт первую настройку, вы получите ${B(REFERRAL_BONUS_MONTHS)} Premium после беты.`,
    ].join("\n\n"),
    [[{ text: "📤 Отправить другу", url: shareUrl(link) }]],
  );
}

async function sendBonus(chatId: number, trainer: Awaited<ReturnType<typeof trainerFor>>) {
  const s = await betaStatus(trainer);
  if (!s.available) {
    await sendMessage(chatId, "🎁 Бонусная программа вот-вот заработает — загляните чуть позже.");
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

function sendInstall(chatId: number, origin: string | null) {
  const rows = appRows(origin);
  if (rows.length === 0) return sendMessage(chatId, "Кнопка установки появится, когда приложение опубликовано по https-адресу.");
  return sendMessage(
    chatId,
    `📲 <b>Установите PragmaBox на телефон</b>\n\nНажмите кнопку ниже — откроется приложение и предложит добавить иконку на главный экран. Дальше PragmaBox запускается одним касанием, как обычное приложение.`,
    [rows[1]],
  );
}

function sendHelp(chatId: number, origin: string | null) {
  return sendMessage(
    chatId,
    [
      `<b>Что умеет бот</b>`,
      [
        `/app — открыть PragmaBox`,
        `/install — установить на главный экран`,
        `/review — оставить отзыв (${monthsLabel(REVIEW_BONUS_MONTHS)} Premium)`,
        `/invite — пригласить друга (${monthsLabel(REFERRAL_BONUS_MONTHS)} Premium)`,
        `/bonus — мои бонусы`,
      ].join("\n"),
      `Вопросы и идеи пишите прямо сюда — их прочитает разработчик.`,
    ].join("\n\n"),
    appRows(origin).slice(0, 1),
  );
}

async function handleCommand(command: string, payload: string, from: TgUser, chatId: number, origin: string | null) {
  const trainer = await trainerFor(from);
  switch (command) {
    case "start": {
      if (payload === "review") return sendReviewPrompt(chatId);
      if (payload === "invite") return sendInvite(chatId, trainer.id, false);
      if (payload === "bonus") return sendBonus(chatId, trainer);
      if (payload === "install") return sendInstall(chatId, origin);
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
    case "id":
      return sendMessage(
        chatId,
        `Ваш Telegram ID: <code>${from.id}</code>\n\nВладельцу бота: впишите его в переменную BOT_ADMIN_IDS на Vercel, чтобы получать отзывы.`,
      );
    default:
      return sendHelp(chatId, origin);
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
  if (result.tooShort && !result.alreadyRewarded) {
    return sendMessage(
      chatId,
      `Спасибо! 🙌 Чтобы получить бонус, напишите чуть подробнее — от ${MIN_REVIEW_LENGTH} символов: что нравится и чего не хватает.`,
    );
  }
  return sendMessage(chatId, "Спасибо, передал разработчику! 🙌 Пишите ещё — каждое сообщение читаем.");
}

async function handleMessage(msg: TgMessage, origin: string | null) {
  // Бот работает только в личке: в группах молчим
  if (msg.chat.type !== "private" || !msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id;
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
  await handleText(text, msg.from, chatId);
}

async function handleCallback(q: TgCallbackQuery) {
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
  if (data === "review") return void (await sendReviewPrompt(chatId));
  if (data === "invite") {
    const s = await betaStatus(trainer);
    return void (await sendInvite(chatId, trainer.id, Boolean(s.referralMonths)));
  }
  if (data === "bonus") return void (await sendBonus(chatId, trainer));
}

export async function handleUpdate(update: TgUpdate, origin: string | null) {
  if (update.message) await handleMessage(update.message, origin);
  else if (update.callback_query) await handleCallback(update.callback_query);
}
