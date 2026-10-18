"use client";

import { useCallback, useEffect, useState } from "react";
import { THEMES, type ThemeId } from "@/lib/theme";
import { IconCheck } from "@/components/ui/icons";

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
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
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
  theme,
  onTheme,
  onStartTutorial,
  showGuides = false,
}: SettingsPanelProps) {
  return (
    <div className="space-y-5 pb-4">
      {onStartTutorial && (
        <section className="rounded-3xl p-4 bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase">
                Для интервью и демонстрации
              </span>
              <h3 className="mt-1.5 text-base font-bold">Обучающий тур</h3>
              <p className="mt-1 text-xs leading-relaxed text-sky-100">
                Пошаговый интерактивный гид с подсветкой кнопок, таймлайна и фич для клиентов.
              </p>
            </div>
            <span className="text-2xl">💡</span>
          </div>
          <button
            type="button"
            onClick={onStartTutorial}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-2.5 text-sm font-bold text-sky-600 shadow-sm active:scale-95 transition"
          >
            <span>Пройти тур по приложению</span>
            <span>→</span>
          </button>
        </section>
      )}

      <section className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Фон приложения</p>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTheme(t.id)}
                className={`overflow-hidden rounded-2xl bg-white text-left shadow-sm transition active:scale-[0.97] ${
                  active ? "ring-2 ring-sky-500" : ""
                }`}
              >
                <span className="relative block h-16 w-full" style={{ background: t.swatch }}>
                  {active && (
                    <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-white text-sky-600 shadow">
                      <IconCheck className="h-3 w-3" />
                    </span>
                  )}
                </span>
                <span className="block px-2.5 py-2">
                  <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
                  <span className="block text-[11px] leading-tight text-slate-500">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

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
