"use client";

import { useState } from "react";
import { del, patch, post } from "@/lib/client-api";
import { confirmAction } from "@/lib/telegram-actions";
import {
  PACKAGE_MAX_PRICE,
  PACKAGE_MAX_SESSIONS,
  PACKAGE_SIZES,
  perSessionPrice,
  sessionsLabel,
  sessionsWord,
} from "@/lib/packages";
import { addMonths, dayKey, fmtDayLong, fmtMoney, parseDayKey } from "@/lib/time";
import type { PackageDTO } from "@/lib/types";
import { haptic } from "@/components/dashboard/TimelineCreator";
import { fieldInput } from "./ClientForm";

// ───────── Поля абонемента: и в карточке клиента, и в форме нового клиента ─────────

export interface PackageDraft {
  total: number;
  price: string;
  // Цену меняли руками — больше не пересчитываем её от количества занятий
  priceTouched: boolean;
  paid: boolean;
  // "" — без срока
  expiresAt: string;
  // Только при изменении существующего абонемента
  remaining?: number;
}

const EXPIRY_PRESETS = [1, 2, 3];

export function newPackageDraft({
  today,
  perSession,
  total = 8,
  price,
}: {
  today: Date;
  perSession: number;
  total?: number;
  price?: number;
}): PackageDraft {
  return {
    total,
    price: String(price ?? total * perSession),
    priceTouched: false,
    paid: true,
    expiresAt: dayKey(addMonths(today, 1)),
  };
}

export function draftPrice(draft: PackageDraft): number {
  const n = Number(draft.price.replace(/\s+/g, ""));
  return Number.isFinite(n) ? Math.round(n) : Number.NaN;
}

// Ошибка заполнения или null
export function validateDraft(draft: PackageDraft): string | null {
  if (draft.total < 1 || draft.total > PACKAGE_MAX_SESSIONS) {
    return `Количество занятий — от 1 до ${PACKAGE_MAX_SESSIONS}`;
  }
  const price = draftPrice(draft);
  if (!Number.isFinite(price) || price < 0 || price > PACKAGE_MAX_PRICE) return "Проверьте стоимость абонемента";
  return null;
}

export function PackageFields({
  draft,
  onChange,
  today,
  priceFor,
}: {
  draft: PackageDraft;
  onChange: (next: PackageDraft) => void;
  today: Date;
  // Цена абонемента на столько-то занятий, пока её не меняли руками
  priceFor: (total: number) => number;
}) {
  const price = draftPrice(draft);
  const perSession = Number.isFinite(price) && draft.total > 0 ? Math.round(price / draft.total) : 0;

  const setTotal = (raw: number) => {
    const total = Math.min(PACKAGE_MAX_SESSIONS, Math.max(1, raw));
    haptic("select");
    const next: PackageDraft = { ...draft, total };
    if (!draft.priceTouched) next.price = String(priceFor(total));
    // Изменили размер абонемента — проведённые занятия остаются проведёнными
    if (draft.remaining !== undefined) {
      next.remaining = Math.min(total, Math.max(0, draft.remaining + (total - draft.total)));
    }
    onChange(next);
  };

  const presetMonths = EXPIRY_PRESETS.find((m) => draft.expiresAt === dayKey(addMonths(today, m))) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-medium text-[#5C6B86]">Занятий в абонементе</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Меньше занятий"
            onClick={() => setTotal(draft.total - 1)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#F1F3F9] text-xl font-bold text-[#5C6B86] active:scale-90"
          >
            −
          </button>
          <p className="flex-1 text-center text-[22px] font-bold tabular-nums text-[#0F1C33]">
            {draft.total} <span className="text-sm font-semibold text-[#5C6B86]">{sessionsWord(draft.total)}</span>
          </p>
          <button
            type="button"
            aria-label="Больше занятий"
            onClick={() => setTotal(draft.total + 1)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#F1F3F9] text-xl font-bold text-[#5C6B86] active:scale-90"
          >
            +
          </button>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {PACKAGE_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTotal(n)}
              className={`rounded-xl py-2 text-sm font-bold transition active:scale-95 ${
                draft.total === n ? "bg-[#4A5BF0] text-white" : "bg-[#F1F3F9] text-[#5C6B86]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {draft.remaining !== undefined && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-[#5C6B86]">Осталось занятий</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Меньше осталось"
              onClick={() => onChange({ ...draft, remaining: Math.max(0, (draft.remaining ?? 0) - 1) })}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#F1F3F9] text-xl font-bold text-[#5C6B86] active:scale-90"
            >
              −
            </button>
            <p className="flex-1 text-center text-[22px] font-bold tabular-nums text-[#0F1C33]">
              {draft.remaining} <span className="text-sm font-semibold text-[#5C6B86]">из {draft.total}</span>
            </p>
            <button
              type="button"
              aria-label="Больше осталось"
              onClick={() => onChange({ ...draft, remaining: Math.min(draft.total, (draft.remaining ?? 0) + 1) })}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#F1F3F9] text-xl font-bold text-[#5C6B86] active:scale-90"
            >
              +
            </button>
          </div>
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[#5C6B86]">Стоимость абонемента, ₽</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.price}
          onChange={(e) => onChange({ ...draft, price: e.target.value, priceTouched: true })}
          className={`${fieldInput} text-base font-semibold`}
        />
        <span className="mt-1 block text-[11px] text-[#9AA6BE]">
          {perSession > 0 ? `≈ ${fmtMoney(perSession)} за одно занятие` : "Бесплатный абонемент"}
        </span>
      </label>

      <div>
        <p className="mb-1.5 text-xs font-medium text-[#5C6B86]">Срок действия</p>
        <div className="grid grid-cols-4 gap-1.5">
          {EXPIRY_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...draft, expiresAt: dayKey(addMonths(today, m)) })}
              className={`rounded-xl py-2 text-[12px] font-bold transition active:scale-95 ${
                presetMonths === m ? "bg-[#4A5BF0] text-white" : "bg-[#F1F3F9] text-[#5C6B86]"
              }`}
            >
              {m} мес
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...draft, expiresAt: "" })}
            className={`rounded-xl py-2 text-[12px] font-bold transition active:scale-95 ${
              draft.expiresAt === "" ? "bg-[#4A5BF0] text-white" : "bg-[#F1F3F9] text-[#5C6B86]"
            }`}
          >
            Без срока
          </button>
        </div>
        <label className="relative mt-2 flex items-center justify-between rounded-xl border border-[#E0E5F1] bg-white px-3 py-2.5 text-sm">
          <span className="text-[#5C6B86]">Действует до</span>
          <span className="font-semibold text-[#0F1C33]">
            {draft.expiresAt ? fmtDayLong(parseDayKey(draft.expiresAt)) : "без срока"}
          </span>
          <input
            type="date"
            aria-label="Дата окончания абонемента"
            value={draft.expiresAt}
            onChange={(e) => onChange({ ...draft, expiresAt: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-[#5C6B86]">Оплата</p>
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[#F1F3F9] p-1">
          {[
            { value: true, label: "Оплачен" },
            { value: false, label: "Оплатит позже" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={draft.paid === o.value}
              onClick={() => onChange({ ...draft, paid: o.value })}
              className={`rounded-xl py-2.5 text-sm font-bold transition ${
                draft.paid === o.value
                  ? o.value
                    ? "bg-white text-[#0E7A47] shadow-sm"
                    : "bg-white text-[#B4232E] shadow-sm"
                  : "text-[#5C6B86]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {!draft.paid && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#9AA6BE]">
            Сумма абонемента попадёт в «Кто должен», пока вы не отметите оплату.
          </p>
        )}
      </div>
    </div>
  );
}

// ───────── Форма абонемента в карточке клиента ─────────

export type PackageFormMode = "new" | "renew" | "edit";

export default function PackageForm({
  mode,
  clientId,
  pkg,
  defaultPrice,
  today,
  onSaved,
  onCancel,
  onToast,
}: {
  mode: PackageFormMode;
  clientId: number;
  // Для продления — прошлый абонемент (берём из него количество и цену), для изменения — сам абонемент
  pkg?: PackageDTO | null;
  // Обычная цена тренировки из профиля
  defaultPrice: number;
  today: Date;
  onSaved: (msg: string) => void;
  onCancel: () => void;
  onToast: (msg: string) => void;
}) {
  const perSession = pkg && pkg.price > 0 ? perSessionPrice(pkg) : defaultPrice;
  const priceFor = (total: number) => (pkg && total === pkg.totalSessions && pkg.price > 0 ? pkg.price : total * perSession);

  const [draft, setDraft] = useState<PackageDraft>(() => {
    if (mode === "edit" && pkg) {
      return {
        total: pkg.totalSessions,
        price: String(pkg.price),
        priceTouched: true,
        paid: pkg.paid,
        expiresAt: pkg.expiresAt ?? "",
        remaining: pkg.remainingSessions,
      };
    }
    const total = pkg?.totalSessions ?? 8;
    return newPackageDraft({ today, perSession, total, price: priceFor(total) });
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    const error = validateDraft(draft);
    if (error) return onToast(error);
    setSaving(true);
    const body = {
      totalSessions: draft.total,
      price: draftPrice(draft),
      paid: draft.paid,
      expiresAt: draft.expiresAt || null,
    };
    try {
      if (mode === "edit" && pkg) {
        await patch(`/api/packages/${pkg.id}`, { ...body, remainingSessions: draft.remaining });
      } else {
        await post("/api/packages", { ...body, clientId });
      }
      haptic("success");
      onSaved(mode === "edit" ? "Абонемент сохранён" : mode === "renew" ? "Абонемент продлён" : "Абонемент оформлен");
    } catch (e) {
      haptic("warn");
      onToast(e instanceof Error ? e.message : "Не удалось сохранить абонемент");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pkg || deleting) return;
    const ok = await confirmAction(
      "Тренировки из него останутся в истории, но станут разовыми. Отменить удаление нельзя.",
      { title: "Удалить абонемент?", okText: "Удалить", destructive: true },
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await del(`/api/packages/${pkg.id}`);
      haptic("success");
      onSaved("Абонемент удалён");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Не удалось удалить абонемент");
      setDeleting(false);
    }
  };

  const title = mode === "edit" ? "Абонемент" : mode === "renew" ? "Продление абонемента" : "Новый абонемент";
  const hint =
    mode === "renew"
      ? pkg && pkg.remainingSessions > 0
        ? `В прошлом абонементе осталось ${sessionsLabel(pkg.remainingSessions)} — они не пропадут и спишутся после нового.`
        : "Прошлый абонемент останется в истории клиента."
      : mode === "new"
        ? "Занятия будут списываться сами, когда вы отмечаете тренировку проведённой."
        : null;

  return (
    <div className="space-y-3 pb-3">
      <section className="rounded-[22px] bg-white p-4 shadow-sm">
        <h3 className="text-[15px] font-bold text-[#0F1C33]">{title}</h3>
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-[#5C6B86]">{hint}</p>}
        <div className="mt-4">
          <PackageFields draft={draft} onChange={setDraft} today={today} priceFor={priceFor} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl bg-white py-3 text-sm font-semibold text-[#5C6B86] shadow-sm transition active:scale-[0.98]"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={saving || deleting}
          onClick={save}
          className="rounded-2xl bg-[#4A5BF0] py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? "Сохраняем…" : mode === "edit" ? "Сохранить" : mode === "renew" ? "Продлить" : "Оформить"}
        </button>
      </div>

      {mode === "edit" && pkg && (
        <button
          type="button"
          onClick={remove}
          disabled={saving || deleting}
          className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-[#F04452] shadow-sm transition active:scale-[0.98] disabled:opacity-60"
        >
          {deleting ? "Удаляем…" : "Удалить абонемент"}
        </button>
      )}
    </div>
  );
}
