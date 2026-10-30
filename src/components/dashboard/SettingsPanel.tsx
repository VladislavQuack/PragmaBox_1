"use client";

import { useCallback, useEffect, useState } from "react";
import { patch } from "@/lib/client-api";
import { REFERRAL_BONUS_MONTHS, REVIEW_BONUS_MONTHS, monthsLabel } from "@/lib/beta";
import { fmtMoney } from "@/lib/time";
import InstallCard from "@/components/beta/InstallCard";
import { haptic } from "@/components/dashboard/TimelineCreator";


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
  // Цель на месяц и обычная цена тренировки (задаются в онбординге)
  monthlyGoal: number;
  avgSessionPrice: number;
  onReload: () => void;
  onToast: (msg: string) => void;
  onSeed: () => void;
  // Повтор тура по приложению (сам он запускается после онбординга)
  onStartTutorial?: () => void;
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
  monthlyGoal,
  avgSessionPrice,
  onReload,
  onToast,
  onSeed,
  onStartTutorial,
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

      <GoalsCard monthlyGoal={monthlyGoal} avgSessionPrice={avgSessionPrice} onReload={onReload} onToast={onToast} />

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

      {/* Обычная белая карточка, как остальные пункты профиля: тур и так показывается
          после онбординга, а здесь его можно открыть ещё раз */}
      {onStartTutorial && (
        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[#5C6B86]">Помощь</p>
          <button
            type="button"
            onClick={onStartTutorial}
            className="w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold text-[#0F1C33] shadow-sm"
          >
            Повторить обучение
            <span className="mt-0.5 block text-xs font-normal text-[#5C6B86]">Короткий тур по экранам приложения</span>
          </button>
        </section>
      )}
    </div>
  );
}

// Цель на месяц (прогресс на главном экране) и цена тренировки (подставляется в новые записи)
function GoalsCard({
  monthlyGoal,
  avgSessionPrice,
  onReload,
  onToast,
}: {
  monthlyGoal: number;
  avgSessionPrice: number;
  onReload: () => void;
  onToast: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState(String(monthlyGoal));
  const [price, setPrice] = useState(String(avgSessionPrice));
  const [saving, setSaving] = useState(false);

  const open = () => {
    setGoal(String(monthlyGoal));
    setPrice(String(avgSessionPrice));
    setEditing(true);
  };

  const save = async () => {
    const g = Math.round(Number(goal));
    const p = Math.round(Number(price));
    if (!Number.isFinite(g) || g < 0 || g > 1_000_000) return onToast("Цель — от 0 до 1 000 000 ₽");
    if (!Number.isFinite(p) || p < 0 || p > 100_000) return onToast("Цена — от 0 до 100 000 ₽");
    setSaving(true);
    try {
      await patch("/api/me", { monthlyGoal: g, avgSessionPrice: p });
      haptic("success");
      onToast("Сохранено");
      setEditing(false);
      onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full rounded-xl border border-[#E0E5F1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F1C33] outline-none focus:border-[#4A5BF0]";

  return (
    <section className="space-y-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[#5C6B86]">Цель и цены</p>
      {editing ? (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#5C6B86]">Цель на месяц, ₽</span>
            <input type="number" inputMode="numeric" min={0} value={goal} onChange={(e) => setGoal(e.target.value)} className={input} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#5C6B86]">Обычная цена тренировки, ₽</span>
            <input type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl bg-[#F1F3F9] py-2.5 text-sm font-semibold text-[#5C6B86]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-[#4A5BF0] py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={open} className="w-full divide-y divide-[#EFF1F6] rounded-2xl bg-white px-4 text-left shadow-sm">
          <span className="flex items-center justify-between gap-3 py-3.5">
            <span className="text-sm font-semibold text-[#0F1C33]">Цель на месяц</span>
            <span className="text-sm font-semibold tabular-nums text-[#5C6B86]">{fmtMoney(monthlyGoal)}</span>
          </span>
          <span className="flex items-center justify-between gap-3 py-3.5">
            <span className="text-sm font-semibold text-[#0F1C33]">Цена тренировки</span>
            <span className="text-sm font-semibold tabular-nums text-[#5C6B86]">{fmtMoney(avgSessionPrice)}</span>
          </span>
        </button>
      )}
      <p className="px-1 text-xs text-[#5C6B86]">
        Цена подставляется в новые тренировки и абонементы — её всегда можно поменять при записи.
      </p>
    </section>
  );
}
