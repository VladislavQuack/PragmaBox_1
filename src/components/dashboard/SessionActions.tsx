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
  onOptimisticUpdate?: (id: number, updates: Partial<SessionDTO>) => void;
  onOptimisticDelete?: (id: number) => void;
}

type Tone = "ok" | "info" | "muted" | "bad";

const TONE_BTN: Record<Tone, string> = {
  ok: "bg-[#1DB871] text-white shadow-[#1DB871]/30",
  info: "bg-[#4A5BF0] text-white shadow-[#4A5BF0]/30",
  muted: "bg-white text-[#5C6B86] border border-[#E0E5F1]",
  bad: "bg-[#F04452] text-white shadow-[#F04452]/30",
};

export default function SessionActions({
  session: s,
  onClose,
  onChanged,
  onEdit,
  onToast,
  onOptimisticUpdate,
  onOptimisticDelete,
}: SessionActionsProps) {
  const [busy, setBusy] = useState(false);
  const startMin = minuteOfDay(new Date(s.startsAt));
  const muscle = isMuscleKey(s.muscleGroup) ? MUSCLE_GROUPS[s.muscleGroup].label : "—";
  const kind = isKindKey(s.kind) ? KINDS[s.kind] : "—";

  const run = async (body: Record<string, unknown>, msg: string) => {
    // Мгновенное обновление в памяти
    if (onOptimisticUpdate) {
      onOptimisticUpdate(s.id, body as Partial<SessionDTO>);
    }
    onToast(msg);
    onClose();

    try {
      await patch(`/api/sessions/${s.id}`, body);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка сохранения");
      onChanged();
    }
  };

  const remove = async () => {
    if (!window.confirm("Удалить тренировку?")) return;
    if (onOptimisticDelete) {
      onOptimisticDelete(s.id);
    }
    onToast("Тренировка удалена");
    onClose();

    try {
      await del(`/api/sessions/${s.id}`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка удаления");
      onChanged();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-[#5C6B86]">
          {fmtMinute(startMin)} – {fmtMinute(startMin + s.durationMin)} · {fmtDuration(s.durationMin)}
        </p>
        <p className="mt-1 text-xl font-semibold text-[#0F1C33]">{s.clientName}</p>
        <p className="mt-1 text-sm text-[#5C6B86]">
          {muscle} · {kind} · {fmtMoney(s.price)} · {s.paid ? "оплачено" : "не оплачено"}
        </p>
        {s.remainingSessions !== null && (
          <p className="mt-2 inline-block rounded-full bg-[#F1F3F9] px-2.5 py-1 text-xs font-medium text-[#5C6B86]">
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
          className="rounded-2xl border border-[#E0E5F1] bg-white py-3 text-sm font-semibold text-[#5C6B86]"
        >
          ✏️ Изменить
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-2xl border border-[#F3C2C7] bg-[#FDECEF] py-3 text-sm font-semibold text-[#B4232E]"
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
