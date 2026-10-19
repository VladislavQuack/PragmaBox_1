"use client";

import { useCallback, useEffect, useState } from "react";

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
  onStartTutorial?: () => void;
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
  onStartTutorial,
  showGuides = false,
}: SettingsPanelProps) {
  return (
    <div className="space-y-4 pb-4">
      {onStartTutorial && (
        <button
          type="button"
          onClick={onStartTutorial}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #007aff 0%, #005bb5 100%)",
          }}
        >
          <span>Пройти тур по приложению</span>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-xs font-bold">
            →
          </span>
        </button>
      )}

      <section className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Виджеты на дашборде</p>
        {WIDGETS.map((w) => (
          <label key={w.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <span>
              <span className="block text-sm font-semibold text-slate-900">{w.title}</span>
              <span className="block text-xs text-slate-500">{w.hint}</span>
            </span>
            <input
              type="checkbox"
              checked={prefs[w.key]}
              onChange={(e) => onChange({ ...prefs, [w.key]: e.target.checked })}
              className="h-5 w-5 accent-emerald-500"
            />
          </label>
        ))}
        <p className="px-1 text-xs text-slate-500">Таймлайн всегда на главном экране: это ядро продукта.</p>
      </section>

      {showGuides && (
        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Для владельца
          </p>
          <a
            href="/setup"
            className="block w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold text-slate-900 shadow-sm"
          >
            Запуск в Telegram
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Создать бота и подключить мини-апп
            </span>
          </a>
          <a
            href="/deploy"
            className="block w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold text-slate-900 shadow-sm"
          >
            Публикация на Vercel
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Постоянный адрес и своя база данных
            </span>
          </a>
        </section>
      )}

      <section className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Демо</p>
        <button type="button" onClick={onSeed} className="w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold text-slate-900 shadow-sm">
          Загрузить демо-данные
          <span className="mt-0.5 block text-xs font-normal text-slate-500">Работает только если база пустая</span>
        </button>
      </section>
    </div>
  );
}
