"use client";

import { useState } from "react";
import { patch } from "@/lib/client-api";
import type { ClientDTO } from "@/lib/types";
import { haptic } from "@/components/dashboard/TimelineCreator";

export const fieldInput =
  "w-full rounded-xl border border-[#E0E5F1] bg-white px-3 py-2.5 text-sm text-[#0F1C33] outline-none placeholder:text-[#9AA6BE] focus:border-[#4A5BF0]";

// Редактирование карточки клиента: имя, телефон, заметка
export default function ClientForm({
  client,
  onSaved,
  onCancel,
  onToast,
}: {
  client: ClientDTO;
  onSaved: (msg: string) => void;
  onCancel: () => void;
  onToast: (msg: string) => void;
}) {
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone ?? "");
  const [note, setNote] = useState(client.note ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return onToast("Введите имя клиента");
    setSaving(true);
    try {
      await patch(`/api/clients/${client.id}`, { name, phone, note });
      haptic("success");
      onSaved("Данные клиента сохранены");
    } catch (e) {
      haptic("warn");
      onToast(e instanceof Error ? e.message : "Не удалось сохранить");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pb-3">
      <section className="space-y-3 rounded-[22px] bg-white p-4 shadow-sm">
        <h3 className="text-[15px] font-bold text-[#0F1C33]">Данные клиента</h3>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#5C6B86]">Имя</span>
          <input
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Анна Смирнова"
            className={fieldInput}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#5C6B86]">Телефон</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            maxLength={40}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 900 000-00-00"
            className={fieldInput}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#5C6B86]">Заметка</span>
          <textarea
            value={note}
            maxLength={1000}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Цели, травмы, противопоказания"
            className={`${fieldInput} resize-none leading-relaxed`}
          />
        </label>
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
          disabled={saving}
          onClick={save}
          className="rounded-2xl bg-[#4A5BF0] py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
