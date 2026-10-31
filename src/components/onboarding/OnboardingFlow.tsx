"use client";

import { useMemo, useState } from "react";
import { post } from "@/lib/client-api";
import { BETA } from "@/lib/beta";
import { ONBOARDING_MAX_CLIENTS, TRIAL_DAYS } from "@/lib/subscription";
import { plural } from "@/lib/plural";
import { fmtMoney } from "@/lib/time";
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus } from "@/components/ui/icons";
import { haptic } from "@/components/dashboard/TimelineCreator";
import { TG_HEADER_COLOR, useTelegramHeaderColor } from "@/lib/telegram-shell";
import { useBackButton } from "@/lib/back-button";
import WelcomeFeatures from "./WelcomeFeatures";
import OnboardingFinishing from "./OnboardingFinishing";

type Step = 0 | 1 | 2 | 3;

const GOALS = [30000, 50000, 80000, 120000];
const AVG_TICKETS = [1000, 1500, 2000, 2500];
const WORKING_DAYS_PER_MONTH = 22;

const SHEET_BG = {
  backgroundColor: "#4A5BF0",
  backgroundImage: "var(--noise), var(--grad-purple)",
  backgroundSize: "140px 140px, cover",
  backgroundBlendMode: "overlay, normal",
} as const;

const TILE_BG = {
  backgroundColor: "#4A5BF0",
  backgroundImage: "var(--noise), var(--grad-purple-soft)",
  backgroundSize: "140px 140px, cover",
  backgroundBlendMode: "overlay, normal",
} as const;

export default function OnboardingFlow({
  trainerName,
  onDone,
  onBeta,
  preview = false,
}: {
  trainerName: string;
  onDone: () => void;
  onBeta?: () => void;
  preview?: boolean;
}) {
  const [step, setStep] = useState<Step>(0);
  const [goal, setGoal] = useState(50000);
  const [averageTicket, setAverageTicket] = useState(1500);
  const [names, setNames] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Верх онбординга белый: шапка Telegram в тон, чтобы в полноэкранном режиме
  // значки строки состояния стали тёмными. Финальный экран — фиолетовый.
  useTelegramHeaderColor(finishing ? TG_HEADER_COLOR : "#FFFFFF");

  const validNames = useMemo(
    () => [...new Set(names.map((n) => n.trim()).filter(Boolean))],
    [names],
  );
  const dailyGoal = Math.ceil(goal / WORKING_DAYS_PER_MONTH);
  const dailyClientGoal = averageTicket > 0 ? Math.ceil(dailyGoal / averageTicket) : 0;

  const go = (next: Step) => {
    haptic("select");
    setError(null);
    setStep(next);
  };

  const save = async () => {
    if (preview) {
      setFinishing(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await post("/api/onboarding", {
        monthlyGoal: goal,
        averageTicket,
        clientNames: validNames,
      });
      setFinishing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить настройки");
      setSaving(false);
    }
  };

  const advance = () => (step === 3 ? save() : go((step + 1) as Step));
  const updateName = (i: number, value: string) =>
    setNames((old) => old.map((n, idx) => (idx === i ? value : n)));
  const removeName = (i: number) => setNames((old) => old.filter((_, idx) => idx !== i));

  const firstName = trainerName.split(" ")[0] || "тренер";

  // «Назад» в Telegram — предыдущий шаг настройки
  useBackButton(step > 0 && !finishing && !saving, () => go((step - 1) as Step));

  if (finishing) {
    const count = validNames.length;
    return (
      <OnboardingFinishing
        onComplete={onDone}
        summary={[
          `Цель — ${fmtMoney(goal)} в месяц`,
          count > 0
            ? `В базе ${count} ${plural(count, "клиент", "клиента", "клиентов")}`
            : "Клиентов добавите на главном экране",
        ]}
      />
    );
  }

  // Высота фиолетового блока меняется по шагам и анимируется плавно:
  // шаг 1 — заметно меньше половины экрана, шаг 2 — около половины.
  // Доля считается от экрана без строки состояния и кнопок Telegram (--safe-top),
  // иначе в полноэкранном режиме блок вырастает и закрывает картинку сверху.
  const sheetHeight =
    step === 0
      ? "h-[min(340px,calc((100dvh-var(--safe-top))*0.42))]"
      : step === 1
        ? "h-[min(430px,calc((100dvh-var(--safe-top))*0.5))]"
        : step === 2
          ? "h-[min(520px,calc((100dvh-var(--safe-top))*0.64))]"
          : "h-[min(560px,calc((100dvh-var(--safe-top))*0.72))]";

  return (
    <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-white">
      {/* ── Верх: белая сцена (своя на каждый шаг) ── */}
      <div className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <span className="absolute left-5 top-[calc(var(--safe-top)+24px)] z-10 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9AA6BE]">
          PragmaBox · {preview ? "предпросмотр" : "первый запуск"}
        </span>
        {step === 0 && <WelcomeFeatures compact />}
        {step === 1 && <SceneGoal goal={goal} />}
        {step === 2 && (
          <SceneDaily goal={goal} dailyGoal={dailyGoal} dailyClientGoal={dailyClientGoal} averageTicket={averageTicket} />
        )}
        {step === 3 && <SceneClients count={validNames.length} />}
      </div>

      {/* ── Низ: фиолетовый лист как в макете ── */}
      {/* Высота блока анимируется при смене шага; контент внутри листается отдельно */}
      <section
        className={`relative z-10 mx-3 mb-3 flex ${sheetHeight} shrink-0 flex-col overflow-hidden rounded-[34px] px-5 pb-[max(var(--safe-bottom),16px)] pt-4 text-white transition-[height] duration-300 ease-out`}
        style={{ ...SHEET_BG, boxShadow: "0 18px 40px -24px rgba(74,91,240,0.9)" }}
      >
        <div className="flex shrink-0 items-center justify-between">
          <span className="text-[12px] font-semibold text-white/75">Шаг {step + 1} из 4</span>
          <div className="flex items-center gap-2" role="group" aria-label="Прогресс">
            {([0, 1, 2, 3] as Step[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Шаг ${s + 1} из 4`}
                onClick={() => go(s)}
                className={`h-2.5 rounded-full transition-all ${
                  step === s ? "w-6 bg-white" : "w-2.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {step === 0 && (
            <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
              Привет, {firstName}!
              <br />
              Настроим приложение
            </h1>
          )}

          {step === 1 && (
            <>
              <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                Сколько вы планируете
                <br />
                зарабатывать?
              </h1>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {GOALS.map((v) => {
                  const active = goal === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setGoal(v)}
                      className={`rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.97] ${
                        active ? "bg-white text-[#4A5BF0]" : "bg-white/14 text-white"
                      }`}
                    >
                      <span className="num block text-[19px] leading-none">{fmtMoney(v)}</span>
                      <span className={`mt-1 block text-[11px] ${active ? "text-[#7C87E8]" : "text-white/70"}`}>
                        в месяц
                      </span>
                    </button>
                  );
                })}
              </div>
              <label className="mt-2.5 block rounded-2xl bg-white/14 px-3.5 py-2.5">
                <span className="text-[11px] font-medium text-white/70">Своя сумма, ₽</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000000}
                  value={goal}
                  onChange={(e) => setGoal(Math.max(0, Number(e.target.value) || 0))}
                  className="num mt-0.5 w-full border-0 bg-transparent p-0 text-[24px] text-white outline-none placeholder:text-white/50"
                />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                Сколько стоит тренировка
                <br />
                в среднем?
              </h1>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {AVG_TICKETS.map((ticket) => {
                  const active = averageTicket === ticket;
                  return (
                    <button
                      key={ticket}
                      type="button"
                      onClick={() => setAverageTicket(ticket)}
                      aria-pressed={active}
                      className={`rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.97] ${
                        active ? "bg-white text-[#4A5BF0]" : "bg-white/14 text-white"
                      }`}
                    >
                      <span className="num block text-[19px] leading-none">{fmtMoney(ticket)}</span>
                      <span className={`mt-1 block text-[11px] ${active ? "text-[#7C87E8]" : "text-white/70"}`}>
                        за тренировку
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/12 px-3 py-2.5">
                  <span className="block text-[10px] font-medium text-white/68">Зарабатывать в день</span>
                  <span className="num mt-0.5 block text-[17px] leading-none text-white">
                    {fmtMoney(dailyGoal)}
                  </span>
                  <span className="mt-0.5 block text-[9px] text-white/58">
                    из {WORKING_DAYS_PER_MONTH} рабочих дней
                  </span>
                </div>
                <div className="rounded-2xl bg-white/12 px-3 py-2.5">
                  <span className="block text-[10px] font-medium text-white/68">Клиентов в день</span>
                  <span className="num mt-0.5 block text-[17px] leading-none text-white">
                    ≈ {dailyClientGoal}
                  </span>
                  <span className="mt-0.5 block text-[9px] text-white/58">
                    чтобы выйти на {fmtMoney(goal)}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/60">
                Считаем от вашей месячной цели: {fmtMoney(goal)} ÷ {WORKING_DAYS_PER_MONTH} дней ÷ {fmtMoney(averageTicket)} за тренировку.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                Добавим первых
                <br />
                клиентов
              </h1>
              <div className="mt-3 space-y-2.5">
                {names.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-2xl bg-white/14 p-2 pl-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/95 text-[13px] font-bold text-[#4A5BF0]">
                      {i + 1}
                    </span>
                    <input
                      autoFocus={i === 0}
                      value={name}
                      onChange={(e) => updateName(i, e.target.value)}
                      placeholder={`Имя клиента ${i + 1}`}
                      className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-white outline-none placeholder:font-medium placeholder:text-white/50"
                    />
                    {names.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeName(i)}
                        aria-label="Убрать клиента"
                        className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-white/85"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {names.length < ONBOARDING_MAX_CLIENTS && (
                  <button
                    type="button"
                    onClick={() => setNames((n) => [...n, ""])}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/40 py-2.5 text-[13px] font-bold text-white transition active:scale-[0.98]"
                  >
                    <IconPlus className="h-4 w-4" />
                    Добавить клиента
                  </button>
                )}
                <div className="rounded-2xl bg-white/14 p-3.5">
                  <p className="text-[14px] font-bold">Клиентов больше трёх?</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/78">
                    {BETA
                      ? "Остальных добавите уже в приложении: идёт бета, лимита нет и все функции бесплатны."
                      : `Остальных добавите уже в приложении: первые ${TRIAL_DAYS} дней Premium бесплатно, клиентов — без лимита.`}
                  </p>
                  {onBeta && (
                    <button
                      type="button"
                      onClick={onBeta}
                      className="mt-2.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#4A5BF0] transition active:scale-95"
                    >
                      Что даёт бета →
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {error && <p className="mt-3 rounded-2xl bg-white/20 p-3 text-sm text-white">{error}</p>}
        </div>

        {/* Управление: на первом шаге — одна большая кнопка на всю ширину */}
        <div className="mt-3 shrink-0">
          {step === 0 ? (
            <button
              type="button"
              onClick={advance}
              aria-label="Начать настройку"
              className="flex w-full items-center justify-between gap-3 rounded-[24px] bg-white px-5 py-4 text-left transition active:scale-[0.98]"
            >
              <span>
                <span className="block text-[16px] font-bold text-[#0F1C33]">Начать настройку</span>
                <span className="mt-0.5 block text-[12px] font-medium text-[#5C6B86]">
                  Займёт около минуты
                </span>
              </span>
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white"
                style={TILE_BG}
              >
                <IconChevronRight className="h-5 w-5" />
              </span>
            </button>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => go((step - 1) as Step)}
                aria-label="Назад"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/35 text-white transition active:scale-90"
              >
                <IconChevronLeft className="h-5 w-5" />
              </button>
              {/* Подпись стоит у стрелки «вперёд» и нажимается вместе с ней */}
              <button
                type="button"
                onClick={advance}
                disabled={saving}
                className="group flex min-w-0 items-center gap-3 disabled:opacity-60"
              >
                <span className="min-w-0 truncate text-[14px] font-semibold text-white">
                  {saving ? "Сохраняем…" : step === 3 ? (preview ? "Открыть демо-дашборд" : "Открыть дашборд") : "Дальше"}
                </span>
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-white text-white transition group-active:scale-90">
                  <IconChevronRight className="h-5 w-5" />
                </span>
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Сцены ─────────────────────────────────────────────── */

// Шаг 1: превью выбранной месячной цели + мини-график из плиток.
function SceneGoal({ goal }: { goal: number }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col px-5 pb-8 pt-[calc(var(--safe-top)+56px)]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9AA6BE]">Ваша цель</p>
      <p className="num mt-1 text-[44px] leading-none text-[#0F1C33]">{fmtMoney(goal)}</p>
      <p className="mt-1 text-[13px] text-[#9AA6BE]">в месяц · можно поменять ниже</p>
      <div className="mt-auto flex items-end gap-2.5 pt-4">
        {[56, 88, 68, 104].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-[18px]"
            style={{ ...TILE_BG, height: h, opacity: i === 3 ? 1 : 0.45 + i * 0.15 }}
          />
        ))}
        <div className="grid h-[104px] flex-1 place-items-center rounded-[18px] bg-[#EEF1FF]">
          <span className="num text-[22px] text-[#4A5BF0]">₽</span>
        </div>
      </div>
    </div>
  );
}

// Шаг 2: выбранный средний чек и производные ориентиры — крупно и наглядно.
function SceneDaily({
  goal,
  dailyGoal,
  dailyClientGoal,
  averageTicket,
}: {
  goal: number;
  dailyGoal: number;
  dailyClientGoal: number;
  averageTicket: number;
}) {
  return (
    <div className="flex h-full min-h-[300px] flex-col px-5 pb-8 pt-[calc(var(--safe-top)+56px)]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9AA6BE]">
        Средний чек
      </p>
      <p className="num mt-1 text-[44px] leading-none text-[#0F1C33]">{fmtMoney(averageTicket)}</p>
      <p className="mt-1 text-[13px] text-[#9AA6BE]">за одну тренировку</p>
      <div className="mt-auto grid grid-cols-2 gap-2.5 pt-4">
        <div className="rounded-[22px] border border-[#E6EAF3] bg-white p-4 shadow-[0_2px_14px_-6px_rgba(16,28,60,0.14)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9AA6BE]">
            Зарабатывать в день
          </p>
          <p className="num mt-1 text-[24px] leading-none text-[#4A5BF0]">{fmtMoney(dailyGoal)}</p>
          <p className="mt-1 text-[11px] text-[#5C6B86]">при {WORKING_DAYS_PER_MONTH} рабочих днях</p>
        </div>
        <div className="rounded-[22px] border border-[#E6EAF3] bg-white p-4 shadow-[0_2px_14px_-6px_rgba(16,28,60,0.14)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9AA6BE]">
            Клиентов в день
          </p>
          <p className="num mt-1 text-[24px] leading-none text-[#4A5BF0]">≈ {dailyClientGoal}</p>
          <p className="mt-1 text-[11px] text-[#5C6B86]">чтобы выйти на {fmtMoney(goal)}</p>
        </div>
      </div>
    </div>
  );
}

// Шаг 3: счётчик клиентов + аватары.
function SceneClients({ count }: { count: number }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col px-5 pb-8 pt-[calc(var(--safe-top)+56px)]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9AA6BE]">Первые клиенты</p>
      <p className="num mt-1 text-[44px] leading-none text-[#0F1C33]">
        {count}
        <span className="text-[22px] text-[#9AA6BE]"> / {ONBOARDING_MAX_CLIENTS}</span>
      </p>
      <div className="mt-auto flex items-center gap-3 pt-4">
        <div className="flex -space-x-3">
          {Array.from({ length: ONBOARDING_MAX_CLIENTS }, (_, i) => (
            <span
              key={i}
              className={`grid h-12 w-12 place-items-center rounded-full border-[3px] border-white text-[15px] font-bold ${
                i < count ? "text-white" : "bg-[#EEF1FF] text-[#9AA6BE]"
              }`}
              style={i < count ? TILE_BG : undefined}
            >
              {i < count ? <IconCheck className="h-5 w-5" /> : i + 1}
            </span>
          ))}
        </div>
        <p className="text-[12px] leading-snug text-[#9AA6BE]">
          Для старта — трое.
          <br />
          Остальных добавите потом.
        </p>
      </div>
    </div>
  );
}
