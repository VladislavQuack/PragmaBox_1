"use client";

import { useState, type ReactNode } from "react";
import { del, patch } from "@/lib/client-api";
import { KINDS, MUSCLE_GROUPS, isKindKey, isMuscleKey } from "@/lib/config";
import { fmtDuration, fmtMinute, fmtMoney, minuteOfDay } from "@/lib/time";
import type { SessionDTO } from "@/lib/types";

interface SessionActionsProps {
  session: SessionDTO;
  onClose: () => void;
  onChanged: () => void;
  onEdit: () => void;
  onToast: (msg: string) => void;
}

type Tone = "ok" | "info" | "muted" | "bad";

const TONE_BTN: Record<Tone, string> = {
  ok: "bg-emerald-500 text-white shadow-emerald-500/30",
  info: "bg-sky-500 text-white shadow-sky-500/30",
  muted: "bg-white text-slate-700 border border-slate-200",
  bad: "bg-rose-500 text-white shadow-rose-500/30",
};

export default function SessionActions({ session: s, onChanged, onEdit, onToast }: SessionActionsProps) {
  const [busy, setBusy] = useState(false);
  const startMin = minuteOfDay(new Date(s.startsAt));
  const muscle = isMuscleKey(s.muscleGroup) ? MUSCLE_GROUPS[s.muscleGroup].label : "—";
  const kind = isKindKey(s.kind) ? KINDS[s.kind] : "—";

  const run = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      await patch(`/api/sessions/${s.id}`, body);
      onToast(msg);
      onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Удалить тренировку?")) return;
    setBusy(true);
    try {
      await del(`/api/sessions/${s.id}`);
      onToast("Тренировка удалена");
      onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">
          {fmtMinute(startMin)} – {fmtMinute(startMin + s.durationMin)} · {fmtDuration(s.durationMin)}
        </p>
        <p className="mt-1 text-xl font-semibold text-slate-900">{s.clientName}</p>
        <p className="mt-1 text-sm text-slate-600">
          {muscle} · {kind} · {fmtMoney(s.price)} · {s.paid ? "оплачено" : "не оплачено"}
        </p>
        {s.remainingSessions !== null && (
          <p className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            В абонементе осталось: {s.remainingSessions}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ActionButton tone="ok" disabled={busy} onClick={() => run({ status: "done" }, "Проведено, занятие списано")}>
          ✅ Провести
        </ActionButton>
        <ActionButton tone="info" disabled={busy} onClick={() => run({ paid: !s.paid }, s.paid ? "Оплата снята" : "Оплата отмечена")}>
          💳 {s.paid ? "Снять оплату" : "Оплачено"}
        </ActionButton>
        <ActionButton tone="muted" disabled={busy} onClick={() => run({ status: "cancelled_client" }, "Отмена клиентом")}>
          ↩️ Отменил клиент
        </ActionButton>
        <ActionButton tone="muted" disabled={busy} onClick={() => run({ status: "cancelled_trainer" }, "Отмена тренером")}>
          🚫 Отменил я
        </ActionButton>
        <ActionButton tone="bad" disabled={busy} onClick={() => run({ status: "no_show" }, "Отмечена неявка")}>
          ⚠️ Неявка
        </ActionButton>
        <ActionButton tone="muted" disabled={busy} onClick={() => run({ status: "planned" }, "Возвращено в план")}>
          🔄 В план
        </ActionButton>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700"
        >
          ✏️ Изменить
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-700"
        >
          🗑 Удалить
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: Tone;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-3 py-3.5 text-left text-sm font-semibold shadow-md transition active:scale-[0.97] disabled:opacity-60 ${TONE_BTN[tone]}`}
    >
      {children}
    </button>
  );
}
