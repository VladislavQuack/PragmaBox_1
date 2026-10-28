"use client";

import { useCallback, useEffect, useState } from "react";
import { REFERRAL_BONUS_MONTHS, REVIEW_BONUS_MONTHS, monthsLabel } from "@/lib/beta";
import InstallCard from "@/components/beta/InstallCard";


export interface WidgetPrefs {
  income: boolean;
  next: boolean;
  reminders: boolean;
}

const STORAGE_KEY = "trainer-dashboard-prefs-v1";
export const DEFAULT_PREFS: WidgetPrefs = { income: true, next: true, reminders: true };

// Настройки видимости виджетов хранятся на устройстве
export function useWidgetPrefs(): [WidgetPrefs, (p: WidgetPrefs) => void] {
  const [prefs, setPrefsState] = useState<WidgetPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // приватный режим
    }
    if (!raw) return;
    const saved = raw;
    // Читаем после первого рендера, чтобы не было рассинхрона с сервером
    const id = window.setTimeout(() => {
      try {
        setPrefsState({ ...DEFAULT_PREFS, ...(JSON.parse(saved) as Partial<WidgetPrefs>) });
      } catch {
        // поломанные настройки просто игнорируем
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const setPrefs = useCallback((p: WidgetPrefs) => {
    setPrefsState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      // приватный режим и т.п.
    }
  }, []);

  return [prefs, setPrefs];
}

interface SettingsPanelProps {
  prefs: WidgetPrefs;
  onChange: (p: WidgetPrefs) => void;
  onSeed: () => void;
  onOpenBeta?: () => void;
  // Окно «Установить на главный экран»
  onInstall?: () => void;
  // Инструкции по боту и деплою видны только владельцу приложения
  showGuides?: boolean;
}

const WIDGETS: { key: keyof WidgetPrefs; title: string; hint: string }[] = [
  { key: "income", title: "Доход", hint: "Сумма за день и план" },
  { key: "next", title: "Ближайшее окно", hint: "Когда перерыв и сколько он длится" },
  { key: "reminders", title: "Напоминания", hint: "Долги, абонементы, окончания" },
];

export default function SettingsPanel({
  prefs,
  onChange,
  onSeed,
  onOpenBeta,
  onInstall,
  showGuides = false,
}: SettingsPanelProps) {

  return (
    <div className="space-y-4 pb-4">
      {onOpenBeta && (
        <button
          type="button"
          onClick={onOpenBeta}
          className="relative w-full overflow-hidden rounded-[22px] p-4 text-left text-white shadow-lg shadow-[#4A5BF0]/25 transition active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #6C82FF 0%, #4A5BF0 55%, #3D4EDB 100%)" }}
        >
          <span className="hero-pattern pointer-events-none absolute inset-0 opacity-50" />
          <span className="relative flex items-start justify-between gap-4">
            <span>
              <span className="inline-flex rounded-full bg-white/18 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]">
                PragmaBox Beta
              </span>
              <span className="mt-2 block text-[17px] font-bold">Все функции бесплатно</span>
              <span className="mt-1 block text-[12px] leading-relaxed text-white/78">
                Клиенты без лимита. За отзыв — {monthsLabel(REVIEW_BONUS_MONTHS)} Premium, за друга —{" "}
                {monthsLabel(REFERRAL_BONUS_MONTHS)}
              </span>
            </span>
            <span className="mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/18 text-lg font-bold">→</span>
          </span>
        </button>
      )}

      {onInstall && <InstallCard onOpen={onInstall} />}

      <section className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[#5C6B86]">Виджеты на дашборде</p>
        {WIDGETS.map((w) => (
          <label key={w.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <span>
              <span className="block text-sm font-semibold text-[#0F1C33]">{w.title}</span>
              <span className="block text-xs text-[#5C6B86]">{w.hint}</span>
            </span>
            <input
              type="checkbox"
              checked={prefs[w.key]}
              onChange={(e) => onChange({ ...prefs, [w.key]: e.target.checked })}
              className="h-5 w-5 accent-[#4A5BF0]"
            />
          </label>
        ))}
        <p className="px-1 text-xs text-[#5C6B86]">Таймлайн всегда на главном экране: это ядро продукта.</p>
      </section>

      {showGuides && (
        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[#5C6B86]">
            Для владельца
          </p>
          <a
            href="/setup"
            className="block w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold text-[#0F1C33] shadow-sm"
          >
            Запуск в Telegram
            <span className="mt-0.5 block text-xs font-normal text-[#5C6B86]">
              Создать бота и подключить мини-апп
            </span>
          </a>
          <a
            href="/deploy"
            className="block w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold text-[#0F1C33] shadow-sm"
          >
            Публикация на Vercel
            <span className="mt-0.5 block text-xs font-normal text-[#5C6B86]">
              Постоянный адрес и своя база данных
            </span>
          </a>
        </section>
      )}

      <section className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[#5C6B86]">Демо</p>
        <button type="button" onClick={onSeed} className="w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold text-[#0F1C33] shadow-sm">
          Загрузить демо-данные
          <span className="mt-0.5 block text-xs font-normal text-[#5C6B86]">Работает только если база пустая</span>
        </button>
      </section>
    </div>
  );
}
