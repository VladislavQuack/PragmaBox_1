"use client";

import { useState } from "react";
import { useBackButton } from "@/lib/back-button";
import { BETA } from "@/lib/beta";
import { isTelegramEnv, post, telegramWebApp } from "@/lib/client-api";
import { plural } from "@/lib/plural";
import {
  FREE_CLIENT_LIMIT,
  daysLeft,
  fmtUntil,
  periodLabel,
  plansFor,
  termsLines,
  type PlanId,
  type PremiumInfo,
} from "@/lib/subscription";
import { IconCheck, IconClose } from "@/components/ui/icons";
import { haptic } from "@/components/dashboard/TimelineCreator";

interface PremiumSheetProps {
  open: boolean;
  onClose: () => void;
  premium: PremiumInfo;
  clientCount: number;
  onToast: (msg: string) => void;
  // Premium включился после оплаты
  onPremium: (premium: PremiumInfo) => void;
}

// Экран Premium: что даёт, сколько стоит, оплата звёздами Telegram прямо в мини-аппе.
export default function PremiumSheet({ open, ...props }: PremiumSheetProps) {
  if (!open) return null;
  return <PremiumSheetBody {...props} />;
}

type Phase = "idle" | "creating" | "paying" | "confirming" | "done";

const card = "rounded-[22px] border border-[#E0E5F1] bg-white p-4";
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

// Окно оплаты есть в Telegram с Bot API 6.1
function invoiceOpener() {
  const tg = telegramWebApp();
  if (!tg?.openInvoice || !isTelegramEnv()) return null;
  try {
    if (tg.isVersionAtLeast && !tg.isVersionAtLeast("6.1")) return null;
  } catch {
    return null;
  }
  return tg.openInvoice.bind(tg);
}

function PremiumSheetBody({ onClose, premium, clientCount, onToast, onPremium }: Omit<PremiumSheetProps, "open">) {
  const plans = plansFor(premium.isAdmin);
  const [selected, setSelected] = useState<PlanId>("month");
  const [phase, setPhase] = useState<Phase>("idle");
  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  useBackButton(true, onClose);

  const plan = plans.find((p) => p.id === selected) ?? plans[0];
  const busy = phase !== "idle" && phase !== "done";
  const left = premium.until ? daysLeft(premium.until) : 0;

  // После «оплачено» ждём, когда бот получит сообщение об оплате и продлит Premium
  const confirm = async (paymentId: number) => {
    setPhase("confirming");
    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(attempt === 0 ? 900 : 1500);
      try {
        const res = await post<{ status: string; premium: PremiumInfo }>("/api/premium/check", { paymentId });
        if (res.status === "paid") {
          haptic("success");
          onPremium(res.premium);
          setPaidUntil(res.premium.until);
          setPhase("done");
          return;
        }
      } catch {
        // сеть моргнула — проверим ещё раз
      }
    }
    setPhase("idle");
    onToast("Оплата обрабатывается — Premium включится в течение пары минут");
  };

  const pay = async () => {
    if (busy || !plan) return;
    const openInvoice = invoiceOpener();
    if (!openInvoice) {
      onToast("Оплата работает внутри Telegram");
      return;
    }
    haptic("select");
    setPhase("creating");
    try {
      const { link, paymentId } = await post<{ link: string; paymentId: number }>("/api/premium", { plan: plan.id });
      setPhase("paying");
      openInvoice(link, (status) => {
        if (status === "paid" || status === "pending") {
          void confirm(paymentId);
          return;
        }
        setPhase("idle");
        if (status === "failed") {
          haptic("warn");
          onToast("Оплата не прошла");
        }
      });
    } catch (e) {
      setPhase("idle");
      onToast(e instanceof Error ? e.message : "Не удалось открыть оплату");
    }
  };

  const title = premium.lifetime
    ? "Premium навсегда"
    : premium.active
      ? premium.trial
        ? "Пробный Premium"
        : "Premium активен"
      : "Клиенты без лимита";
  const subtitle = premium.lifetime
    ? "Клиенты без лимита. Спасибо, что вы с нами!"
    : premium.active && premium.until
      ? premium.trial
        ? `Ещё ${left} ${plural(left, "день", "дня", "дней")} — до ${fmtUntil(premium.until)}. Потом бесплатно до ${FREE_CLIENT_LIMIT} клиентов или Premium.`
        : `Клиенты без лимита до ${fmtUntil(premium.until)}. Продлить можно заранее — срок прибавится.`
      : BETA
        ? `После беты бесплатно можно будет вести до ${FREE_CLIENT_LIMIT} клиентов. Premium снимает лимит — всё остальное бесплатно и так.`
        : `Сейчас бесплатный план: до ${FREE_CLIENT_LIMIT} клиентов${clientCount > 0 ? `, у вас ${clientCount}` : ""}. Premium снимает лимит — всё остальное бесплатно и так.`;

  const payLabel =
    phase === "creating"
      ? "Открываем оплату…"
      : phase === "paying"
        ? "Ждём оплату…"
        : phase === "confirming"
          ? "Проверяем оплату…"
          : `${premium.active ? "Продлить" : "Оплатить"} · ${plan?.stars ?? 0} ⭐`;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-[#0F1C33]/55 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="PragmaBox Premium"
        className="sheet-surface no-scrollbar relative max-h-[calc(100dvh-var(--app-safe-top)-8px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[30px] bg-[#F7F8FC] shadow-2xl animate-sheet-up"
      >
        <div className="hero-blue relative overflow-hidden px-5 pb-7 pt-5">
          <div className="hero-pattern pointer-events-none absolute inset-0 opacity-60" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/18 text-white transition active:scale-90"
          >
            <IconClose className="h-4 w-4" />
          </button>
          <div className="relative pr-12">
            <span className="inline-flex rounded-full bg-white/18 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
              PragmaBox Premium
            </span>
            <h2 className="mt-3 text-[27px] font-bold leading-[1.05] tracking-[-0.04em] text-white">{title}</h2>
            <p className="mt-3 max-w-[310px] text-[13px] leading-relaxed text-white/78">{subtitle}</p>
          </div>
        </div>

        <div className="space-y-3 px-4 pb-[max(var(--safe-bottom),20px)] pt-4">
          {BETA && premium.isAdmin && (
            <div className="rounded-[20px] bg-[#FFF6E5] px-4 py-3 text-[12px] leading-relaxed text-[#8A5A00]">
              🧪 Идёт бета: этот экран видите только вы. Проверьте оплату до запуска — тест за 1 ⭐ продлит Premium на
              день, а звезду вернёт команда /refund в боте.
            </div>
          )}

          {phase === "done" && (
            <div className="rounded-[22px] bg-[#E5F7EC] px-4 py-4 text-center">
              <p className="text-[26px] leading-none">🎉</p>
              <p className="mt-2 text-[16px] font-bold text-[#0F1C33]">Premium подключён</p>
              <p className="mt-1 text-[13px] text-[#218B58]">
                {paidUntil ? `Клиенты без лимита до ${fmtUntil(paidUntil)}` : "Клиенты без лимита"}
              </p>
            </div>
          )}

          <div className={card}>
            <p className="text-[15px] font-bold text-[#0F1C33]">Что даёт Premium</p>
            <ul className="mt-2.5 space-y-2">
              <Feature title="Клиенты без лимита" text={`Бесплатно — до ${FREE_CLIENT_LIMIT} клиентов`} />
              <Feature title="Всё остальное — для всех" text="Расписание, абонементы, оплаты и замеры бесплатны и без Premium" />
            </ul>
            {premium.bonusMonths > 0 && (
              <p className="mt-3 rounded-xl bg-[#EEF1FF] px-3 py-2 text-[12px] font-medium text-[#4A5BF0]">
                🎁 Бонус беты: +{premium.bonusMonths} {plural(premium.bonusMonths, "месяц", "месяца", "месяцев")} уже в сроке
              </p>
            )}
          </div>

          {!premium.available && (
            <div className={card}>
              <p className="text-[14px] font-bold text-[#0F1C33]">Оплата вот-вот заработает</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#5C6B86]">Загляните сюда чуть позже.</p>
            </div>
          )}

          {premium.canBuy && (
            <>
              <div role="radiogroup" aria-label="Срок Premium" className="space-y-2">
                {plans.map((p) => {
                  const active = p.id === plan?.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={busy}
                      onClick={() => {
                        if (!active) haptic("select");
                        setSelected(p.id);
                      }}
                      className={`flex w-full items-center gap-3 rounded-[20px] border-2 px-4 py-3.5 text-left transition active:scale-[0.99] disabled:opacity-70 ${
                        active ? "border-[#4A5BF0] bg-[#EEF1FF]" : "border-transparent bg-white shadow-sm"
                      }`}
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                          active ? "border-[#4A5BF0] bg-[#4A5BF0] text-white" : "border-[#C4CCDD]"
                        }`}
                      >
                        {active && <IconCheck className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-[#0F1C33]">{p.title}</span>
                        <span className="block text-[12px] text-[#5C6B86]">{p.note ?? periodLabel(p)}</span>
                      </span>
                      <span className="num shrink-0 text-[18px] text-[#0F1C33]">{p.stars} ⭐</span>
                    </button>
                  );
                })}
              </div>

              {/* Кнопка оплаты прилипает к низу: на невысоких экранах её видно, не листая */}
              <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-[#F7F8FC] from-70% to-[#F7F8FC]/0 px-4 pb-[max(var(--safe-bottom),12px)] pt-4">
                <button
                  type="button"
                  onClick={pay}
                  disabled={busy}
                  className="w-full rounded-[18px] bg-[#4A5BF0] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#4A5BF0]/25 transition active:scale-[0.98] disabled:opacity-70"
                >
                  {payLabel}
                </button>
              </div>

              <p className="px-1 text-[11px] leading-relaxed text-[#7D8AA6]">
                Разовая оплата звёздами Telegram, без автосписаний. Не хватает звёзд — Telegram предложит докупить их прямо в
                окне оплаты. Когда срок закончится, Premium просто выключится: клиенты и данные останутся.
              </p>
            </>
          )}

          <div className="px-1 text-[11px] leading-relaxed text-[#7D8AA6]">
            {premium.canBuy ? `Нажимая «${premium.active ? "Продлить" : "Оплатить"}», вы соглашаетесь с ` : "Подробнее — в "}
            <button
              type="button"
              onClick={() => setShowTerms((v) => !v)}
              aria-expanded={showTerms}
              className="font-semibold text-[#4A5BF0] underline underline-offset-2"
            >
              условиями Premium
            </button>
            . Вопрос по оплате — напишите боту /paysupport.
          </div>

          {showTerms && (
            <ol className={`${card} list-decimal space-y-2 pl-8 text-[12px] leading-relaxed text-[#24324B]`}>
              {termsLines().map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#E5F7EC] text-[#1DB871]">
        <IconCheck className="h-3 w-3" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[#0F1C33]">{title}</span>
        <span className="block text-[12px] text-[#5C6B86]">{text}</span>
      </span>
    </li>
  );
}
