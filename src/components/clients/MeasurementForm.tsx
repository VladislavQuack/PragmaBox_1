"use client";

import { useState } from "react";
import { post } from "@/lib/client-api";
import { METRICS, type MetricKey, metricDef } from "@/lib/metrics";
import { dayKey } from "@/lib/time";
import type { MeasurementDTO } from "@/lib/types";
import { haptic } from "@/components/dashboard/TimelineCreator";

// Ввод замера: почти без клавиатуры — кнопки «−» и «+» с шагом показателя.
export default function MeasurementForm({
  clientId,
  history,
  today,
  onSaved,
  onCancel,
  onToast,
}: {
  clientId: number;
  history: MeasurementDTO[];
  today: Date;
  onSaved: (msg: string) => void;
  onCancel: () => void;
  onToast: (msg: string) => void;
}) {
  const [date, setDate] = useState(dayKey(today));

  // Последнее известное значение показателя — от него и пляшем
  const lastOf = (key: MetricKey): number | null => {
    const withValue = history
      .filter((m) => m[key] !== null)
      .sort((a, b) => a.takenOn.localeCompare(b.takenOn));
    return withValue.length ? (withValue[withValue.length - 1][key] as number) : null;
  };

  const existing = history.find((m) => m.takenOn === date);

  const initial = () => {
    const out: Partial<Record<MetricKey, number>> = {};
    for (const m of METRICS) {
      const fromExisting = existing?.[m.key];
      if (fromExisting !== null && fromExisting !== undefined) out[m.key] = fromExisting;
      else if (lastOf(m.key) !== null && m.key === "weight") out[m.key] = lastOf(m.key)!;
    }
    if (Object.keys(out).length === 0) out.weight = lastOf("weight") ?? metricDef("weight").fallback;
    return out;
  };

  const [values, setValues] = useState<Partial<Record<MetricKey, number>>>(initial);
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);

  const activeKeys = METRICS.filter((m) => values[m.key] !== undefined);
  const restKeys = METRICS.filter((m) => values[m.key] === undefined);

  const bump = (key: MetricKey, dir: 1 | -1) => {
    const def = metricDef(key);
    haptic("select");
    setValues((v) => {
      const next = Math.round(((v[key] ?? def.fallback) + dir * def.step) * 10) / 10;
      return { ...v, [key]: Math.min(def.max, Math.max(def.min, next)) };
    });
  };

  const addMetric = (key: MetricKey) => {
    haptic("select");
    setValues((v) => ({ ...v, [key]: lastOf(key) ?? metricDef(key).fallback }));
  };

  const removeMetric = (key: MetricKey) =>
    setValues((v) => {
      const next = { ...v };
      delete next[key];
      return next;
    });

  const save = async () => {
    if (activeKeys.length === 0 && !note.trim()) return onToast("Добавь хотя бы один показатель");
    setSaving(true);
    try {
      await post("/api/measurements", { clientId, takenOn: date, ...values, note });
      haptic("success");
      onSaved(existing ? "Замер обновлён" : "Замер сохранён");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Не удалось сохранить");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[20px] bg-white p-3.5 shadow-sm">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Дата замера</span>
          <input
            type="date"
            value={date}
            max={dayKey(today)}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400"
          />
        </label>
        {existing && (
          <p className="mt-2 rounded-xl bg-amber-50 p-2 text-[11px] text-amber-900">
            На эту дату замер уже есть — он будет обновлён.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {activeKeys.map((def) => {
          const value = values[def.key] ?? def.fallback;
          const prev = lastOf(def.key);
          const diff = prev !== null ? Math.round((value - prev) * 10) / 10 : null;
          return (
            <div key={def.key} className="rounded-[20px] bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: def.color }} />
                  {def.label}
                </span>
                <button
                  type="button"
                  onClick={() => removeMetric(def.key)}
                  className="text-[11px] font-medium text-slate-400"
                >
                  убрать
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bump(def.key, -1)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-700 active:scale-90"
                >
                  −
                </button>
                <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={def.step}
                    value={value}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [def.key]: Number(e.target.value) || 0 }))
                    }
                    className="w-20 border-0 bg-transparent p-0 text-center text-2xl font-bold tabular-nums text-slate-900 outline-none"
                  />
                  <span className="text-xs text-slate-500">{def.unit}</span>
                </div>
                <button
                  type="button"
                  onClick={() => bump(def.key, 1)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-700 active:scale-90"
                >
                  +
                </button>
              </div>
              {diff !== null && diff !== 0 && (
                <p className="mt-1.5 text-center text-[11px] text-slate-500">
                  было {prev} {def.unit} · {diff > 0 ? "+" : "−"}
                  {Math.abs(diff)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {restKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {restKeys.map((def) => (
            <button
              key={def.key}
              type="button"
              onClick={() => addMetric(def.key)}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm active:scale-95"
            >
              + {def.short}
            </button>
          ))}
        </div>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Заметка (необязательно)"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400"
      />

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-slate-600"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-2xl bg-[var(--ios-blue)] py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
