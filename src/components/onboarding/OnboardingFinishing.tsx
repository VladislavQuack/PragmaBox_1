"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/components/dashboard/TimelineCreator";

const STEPS = [
  { id: 1, title: "Сохраняем цель и средний чек", subtitle: "Настройка финансовых ориентиров" },
  { id: 2, title: "Формируем базу клиентов", subtitle: "Создание профилей и абонементов" },
  { id: 3, title: "Строим расписание и таймлайн", subtitle: "Калибровка временных слотов дня" },
  { id: 4, title: "Подготавливаем рабочий дашборд", subtitle: "Финальная проверка интерфейса" },
];

export default function OnboardingFinishing({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0); // 0, 1, 2, 3
  const [isDone, setIsDone] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // 4 шага по 1 секунде = 4 секунды в сумме
    const timers = [
      window.setTimeout(() => setCurrentStep(1), 1000),
      window.setTimeout(() => setCurrentStep(2), 2000),
      window.setTimeout(() => setCurrentStep(3), 3000),
      window.setTimeout(() => {
        setIsDone(true);
        haptic("success");
      }, 4000),
      window.setTimeout(() => {
        onCompleteRef.current();
      }, 5300), // Даём 1.3 секунды полюбоваться на готовую Face ID галочку
    ];

    return () => timers.forEach(window.clearTimeout);
  }, []);

  const radius = 54;
  const circumference = 2 * Math.PI * radius; // ~339.29
  // 0s -> 25%, 1s -> 50%, 2s -> 75%, 3s -> 100%
  const progressPct = isDone ? 100 : ((currentStep + 1) / 4) * 100;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  const activeStepData = STEPS[currentStep] || STEPS[3];

  return (
    <main className="setup-transition fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-white">
      <span className="setup-transition-glow" aria-hidden="true" />

      {/* Большое элегантное загрузочное кольцо и Face ID галочка */}
      <div className="relative mt-2 grid h-[140px] w-[140px] place-items-center">
        {/* Волна при успехе */}
        {isDone && (
          <span
            className="faceid-ripple pointer-events-none absolute inset-0 rounded-full border-2 border-white/60"
            aria-hidden="true"
          />
        )}

        <svg width="140" height="140" viewBox="0 0 140 140" className="absolute inset-0">
          {/* Фоновое полупрозрачное кольцо */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.16)"
            strokeWidth="5"
          />

          {/* Активное кольцо прогресса */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#ffffff"
            strokeWidth={isDone ? "5.5" : "5"}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 70 70)"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Содержимое внутри кольца */}
        <div className="relative z-10 grid h-full w-full place-items-center">
          {!isDone ? (
            /* Числовой процент и мягкий свет */
            <div className="flex flex-col items-center leading-none animate-fade-in">
              <span className="num text-[28px] font-bold tracking-tight text-white">
                {Math.round(progressPct)}%
              </span>
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-white/65">
                {currentStep + 1} / 4
              </span>
            </div>
          ) : (
            /* Apple Face ID style анимированная галочка */
            <div className="faceid-pop grid h-[70px] w-[70px] place-items-center rounded-full bg-white text-[#4A5BF0] shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
              <svg
                width="38"
                height="38"
                viewBox="0 0 38 38"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 20.5L16.5 27L28.5 12"
                  stroke="#4A5BF0"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="faceid-checkmark"
                />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Текстовый блок ниже кольца с текущей задачей */}
      <div className="mt-8 flex h-[100px] w-full max-w-[320px] flex-col items-center text-center">
        {!isDone ? (
          <div key={currentStep} className="animate-fade-in flex flex-col items-center">
            <h1 className="text-[19px] font-bold tracking-[-0.02em] text-white">
              {activeStepData.title}
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
              {activeStepData.subtitle}
            </p>
          </div>
        ) : (
          <div className="faceid-pop flex flex-col items-center">
            <h1 className="text-[23px] font-bold tracking-[-0.03em] text-white">
              Всё готово!
            </h1>
            <p className="mt-1.5 text-[14px] font-medium text-white/80">
              Добро пожаловать в PragmaBox
            </p>
          </div>
        )}
      </div>

      {/* 4 аккуратных шаговых индикатора снизу */}
      <div className="absolute bottom-[max(var(--safe-bottom),28px)] flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              isDone
                ? "w-4 bg-white"
                : i === currentStep
                  ? "w-6 bg-white"
                  : i < currentStep
                    ? "w-2 bg-white/70"
                    : "w-1.5 bg-white/25"
            }`}
          />
        ))}
      </div>
    </main>
  );
}
