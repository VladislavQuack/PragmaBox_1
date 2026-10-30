"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/components/dashboard/TimelineCreator";

// Короткое подтверждение после онбординга. Настройки к этому моменту уже сохранены,
// поэтому никаких «калибровок» не изображаем: кольцо, галочка, что сохранили — и дашборд.
const FILL_MS = 650;
const DONE_AT_MS = 700;
const LEAVE_AT_MS = 2200;

export default function OnboardingFinishing({
  onComplete,
  summary = [],
}: {
  onComplete: () => void;
  // Что именно настроено: «Цель — 50 000 ₽ в месяц», «В базе 2 клиента»
  summary?: string[];
}) {
  const [filled, setFilled] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const timers = [
      // Кольцо заполняется со следующего кадра — иначе браузер не покажет анимацию
      window.setTimeout(() => setFilled(true), 30),
      window.setTimeout(() => {
        setIsDone(true);
        haptic("success");
      }, DONE_AT_MS),
      window.setTimeout(() => onCompleteRef.current(), LEAVE_AT_MS),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <main className="setup-transition fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-white">
      <span className="setup-transition-glow" aria-hidden="true" />

      <div className="relative mt-2 grid h-[140px] w-[140px] place-items-center">
        {isDone && (
          <span
            className="faceid-ripple pointer-events-none absolute inset-0 rounded-full border-2 border-white/60"
            aria-hidden="true"
          />
        )}

        <svg width="140" height="140" viewBox="0 0 140 140" className="absolute inset-0" aria-hidden="true">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255, 255, 255, 0.16)" strokeWidth="5" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#ffffff"
            strokeWidth={isDone ? "5.5" : "5"}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={filled ? 0 : circumference}
            transform="rotate(-90 70 70)"
            style={{ transition: `stroke-dashoffset ${FILL_MS}ms ease-out` }}
          />
        </svg>

        {isDone && (
          <div className="faceid-pop relative z-10 grid h-[70px] w-[70px] place-items-center rounded-full bg-white text-[#4A5BF0] shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
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

      <div className="mt-8 flex min-h-[100px] w-full max-w-[320px] flex-col items-center text-center">
        {isDone && (
          <div className="faceid-pop flex flex-col items-center">
            <h1 className="text-[23px] font-bold tracking-[-0.03em] text-white">Всё готово</h1>
            {summary.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-[14px] font-medium text-white/80">
                {summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[14px] font-medium text-white/80">Добро пожаловать в PragmaBox</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
