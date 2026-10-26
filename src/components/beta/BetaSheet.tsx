"use client";

import { useEffect, useState } from "react";
import { api, post } from "@/lib/client-api";
import {
  MAX_REVIEW_LENGTH,
  MIN_REVIEW_LENGTH,
  PRICE_OPTIONS,
  REFERRAL_BONUS_MONTHS,
  REVIEW_BONUS_MONTHS,
  monthsLabel,
  shareUrl,
  type BetaStatus,
} from "@/lib/beta";
import { openTelegramLink } from "@/lib/telegram-actions";
import { IconCheck, IconClose } from "@/components/ui/icons";
import { haptic } from "@/components/dashboard/TimelineCreator";
import InstallCard from "./InstallCard";

interface BetaSheetProps {
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

// Экран беты: всё бесплатно, а за отзыв и приглашённого друга — Premium после запуска.
export default function BetaSheet({ open, onClose, onToast }: BetaSheetProps) {
  if (!open) return null;
  return <BetaSheetBody onClose={onClose} onToast={onToast} />;
}

interface ReviewResponse {
  rewarded: boolean;
  alreadyRewarded: boolean;
  tooShort: boolean;
}

const card = "rounded-[22px] border border-[#E0E5F1] bg-white p-4";

function BetaSheetBody({ onClose, onToast }: Omit<BetaSheetProps, "open">) {
  const [status, setStatus] = useState<BetaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [review, setReview] = useState("");
  const [sending, setSending] = useState(false);
  const [reviewHint, setReviewHint] = useState<string | null>(null);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<BetaStatus>("/api/beta")
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Не удалось загрузить бонусы");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const sendReview = async () => {
    const text = review.trim();
    if (!text || sending) return;
    setSending(true);
    setReviewHint(null);
    try {
      const res = await post<ReviewResponse>("/api/beta/review", { text });
      if (res.rewarded) {
        haptic("success");
        setReview("");
        setStatus((s) =>
          s ? { ...s, reviewMonths: REVIEW_BONUS_MONTHS, totalMonths: s.totalMonths + REVIEW_BONUS_MONTHS } : s,
        );
      } else if (res.tooShort && !res.alreadyRewarded) {
        setReviewHint(`Спасибо! Чтобы получить бонус, напишите чуть подробнее — от ${MIN_REVIEW_LENGTH} символов.`);
      } else {
        setReview("");
        onToast("Спасибо, передали разработчику!");
      }
    } catch (e) {
      setReviewHint(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  const answerPrice = async (option: string) => {
    try {
      const res = await post<{ label: string }>("/api/beta/price", { option });
      haptic("select");
      setPriceLabel(res.label);
      setStatus((s) => (s ? { ...s, priceAnswered: true } : s));
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Не удалось сохранить ответ");
    }
  };

  const link = status?.referralLink ?? null;
  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      onToast("Ссылка скопирована");
    } catch {
      onToast(link);
    }
  };

  const maxMonths = REVIEW_BONUS_MONTHS + REFERRAL_BONUS_MONTHS;
  const showPrice = Boolean(status?.reviewMonths) && !status?.priceAnswered && !priceLabel;

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
        aria-label="PragmaBox Beta"
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
              PragmaBox Beta
            </span>
            <h2 className="mt-3 text-[27px] font-bold leading-[1.05] tracking-[-0.04em] text-white">
              Все функции —
              <br />
              бесплатно
            </h2>
            <p className="mt-3 max-w-[300px] text-[13px] leading-relaxed text-white/78">
              Идёт бета-тест: клиенты без лимита, все возможности открыты. Помогите сделать PragmaBox лучше —
              и получите Premium, когда выйдет платная версия.
            </p>
          </div>
        </div>

        <div className="space-y-3 px-4 pb-[max(var(--safe-bottom),20px)] pt-4">
          <div className="rounded-[20px] bg-[#EEF1FF] px-4 py-3 text-center">
            <p className="text-[12px] font-medium text-[#5C6B86]">
              {status && status.totalMonths > 0 ? "Ваш бонус после беты" : "Можно получить после беты"}
            </p>
            <p className="num mt-0.5 text-[22px] leading-tight text-[#4A5BF0]">
              {monthsLabel(status && status.totalMonths > 0 ? status.totalMonths : maxMonths)} Premium
            </p>
          </div>

          {loadError && (
            <div className={`${card} text-center`}>
              <p className="text-[13px] text-[#B4232E]">{loadError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null);
                  setAttempt((n) => n + 1);
                }}
                className="mt-2 text-[13px] font-bold text-[#4A5BF0]"
              >
                Попробовать снова
              </button>
            </div>
          )}

          {!status && !loadError && <div className={`${card} h-[132px] animate-pulse bg-white/70`} />}

          {status && !status.available && (
            <div className={card}>
              <p className="text-[14px] font-bold text-[#0F1C33]">Бонусная программа вот-вот заработает</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#5C6B86]">
                Загляните сюда чуть позже — отзывы и приглашения появятся в ближайшем обновлении.
              </p>
            </div>
          )}

          {status?.available && (
            <>
              <div className={card}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-bold text-[#0F1C33]">✍️ Отзыв</p>
                    <p className="mt-0.5 text-[12px] text-[#5C6B86]">
                      {monthsLabel(REVIEW_BONUS_MONTHS)} Premium за отзыв от {MIN_REVIEW_LENGTH} символов
                    </p>
                  </div>
                  {status.reviewMonths ? <Done /> : null}
                </div>

                {status.reviewMonths ? (
                  <p className="mt-3 text-[13px] text-[#218B58]">Спасибо за отзыв! Бонус закреплён за вами.</p>
                ) : (
                  <>
                    <textarea
                      value={review}
                      onChange={(e) => {
                        setReview(e.target.value.slice(0, MAX_REVIEW_LENGTH));
                        setReviewHint(null);
                      }}
                      rows={4}
                      placeholder="Что нравится, что неудобно, чего не хватает?"
                      className="mt-3 w-full resize-none rounded-2xl border border-[#E6EAF3] bg-[#F7F8FC] p-3 text-[14px] text-[#0F1C33] outline-none placeholder:text-[#9AA6BE] focus:border-[#4A5BF0]"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span
                        className={`text-[12px] ${review.trim().length >= MIN_REVIEW_LENGTH ? "text-[#218B58]" : "text-[#9AA6BE]"}`}
                      >
                        {review.trim().length} / {MIN_REVIEW_LENGTH}
                      </span>
                      <button
                        type="button"
                        onClick={sendReview}
                        disabled={sending || review.trim().length === 0}
                        className="rounded-xl bg-[#4A5BF0] px-4 py-2.5 text-[13px] font-bold text-white transition active:scale-95 disabled:opacity-50"
                      >
                        {sending ? "Отправляем…" : "Отправить отзыв"}
                      </button>
                    </div>
                    {reviewHint && <p className="mt-2 text-[12px] leading-relaxed text-[#B26A00]">{reviewHint}</p>}
                  </>
                )}

                {showPrice && (
                  <div className="mt-4 border-t border-[#EEF1F7] pt-3">
                    <p className="text-[13px] font-semibold text-[#0F1C33]">
                      И последний вопрос: сколько вы были бы готовы платить за PragmaBox в месяц?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {PRICE_OPTIONS.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => answerPrice(o.id)}
                          className="rounded-full border border-[#D9DEEC] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#24324B] transition active:scale-95"
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {priceLabel && (
                  <p className="mt-3 text-[12px] text-[#5C6B86]">
                    Записали: <b className="text-[#0F1C33]">{priceLabel}</b>. Спасибо, это поможет выбрать честную цену!
                  </p>
                )}
              </div>

              <div className={card}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-bold text-[#0F1C33]">🤝 Друг-тренер</p>
                    <p className="mt-0.5 text-[12px] text-[#5C6B86]">
                      {monthsLabel(REFERRAL_BONUS_MONTHS)} Premium, когда друг начнёт пользоваться
                    </p>
                  </div>
                  {status.referralMonths ? <Done /> : null}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-[#5C6B86]">
                  {status.referralMonths
                    ? "Бонус за друга уже ваш. Приглашайте ещё — это очень помогает проекту."
                    : "Отправьте другу ссылку. Бонус начислим, когда он откроет PragmaBox по ней и пройдёт первую настройку."}
                </p>
                {status.invited > 0 && (
                  <p className="mt-1.5 text-[12px] font-semibold text-[#24324B]">
                    Приглашено: {status.invited} · начали пользоваться: {status.activated}
                  </p>
                )}
                {link ? (
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptic("select");
                        openTelegramLink(shareUrl(link));
                      }}
                      className="rounded-xl bg-[#4A5BF0] py-2.5 text-[13px] font-bold text-white transition active:scale-95"
                    >
                      Пригласить друга
                    </button>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="rounded-xl bg-[#F1F3F9] px-4 py-2.5 text-[13px] font-semibold text-[#5C6B86] transition active:scale-95"
                    >
                      Скопировать
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-[#F1F3F9] p-3 text-[12px] text-[#5C6B86]">
                    Ссылка появится, когда к приложению подключён бот.
                  </p>
                )}
              </div>
            </>
          )}

          <InstallCard />

          <p className="px-2 pt-1 text-center text-[11px] leading-relaxed text-[#9AA6BE]">
            Бонусы включатся сами, когда выйдет платная версия. Бонусы за отзыв и за друга складываются.
          </p>
        </div>
      </section>
    </div>
  );
}

function Done() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E5F7EC] text-[#1DB871]">
      <IconCheck className="h-4 w-4" />
    </span>
  );
}
