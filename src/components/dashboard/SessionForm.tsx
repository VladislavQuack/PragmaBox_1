"use client";

import { useState, type ReactNode } from "react";
import { patch, post } from "@/lib/client-api";
import { isActive, startMs, endMs } from "@/lib/analytics";
import { KINDS, MUSCLE_GROUPS } from "@/lib/config";
import { dayKey, fmtTime } from "@/lib/time";
import type { ClientDTO, SessionDTO } from "@/lib/types";

interface SessionFormProps {
  day: Date;
  clients: ClientDTO[];
  sessions: SessionDTO[];
  editing?: SessionDTO;
  initialStart?: Date;
  onSaved: (msg: string) => void;
  onToast: (msg: string) => void;
}

const DURATIONS = [30, 45, 60, 75, 90, 120];

const input =
  "w-full rounded-xl border border-[#E0E5F1] bg-white px-3 py-2.5 text-sm text-[#0F1C33] outline-none focus:border-[#4A5BF0]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5C6B86]">{label}</span>
      {children}
    </div>
  );
}

export default function SessionForm({
  day,
  clients,
  sessions,
  editing,
  initialStart,
  onSaved,
  onToast,
}: SessionFormProps) {
  const base = editing ? new Date(editing.startsAt) : (initialStart ?? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10));

  const [clientId, setClientId] = useState<string>(
    editing ? String(editing.clientId) : clients[0] ? String(clients[0].id) : "new",
  );
  const [newName, setNewName] = useState("");
  const [date, setDate] = useState(dayKey(base));
  const [time, setTime] = useState(fmtTime(base));
  const [duration, setDuration] = useState(editing?.durationMin ?? 60);
  const [muscle, setMuscle] = useState<string>(editing?.muscleGroup ?? "full");
  const [kind, setKind] = useState<string>(editing?.kind ?? "individual");
  const [price, setPrice] = useState(String(editing?.price ?? 1200));
  const [paid, setPaid] = useState(editing?.paid ?? false);
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);
  // Занятие по абонементу: его оплата — это оплата абонемента, отдельной галочки нет
  const byPackage = editing !== undefined && editing.packageId !== null;

  const chooseClient = (value: string) => {
    setClientId(value);
    const client = clients.find((c) => String(c.id) === value);
    const pkg = client?.packages.filter((p) => p.remainingSessions > 0).at(-1);
    // Подставляем стоимость одного занятия из активного абонемента
    if (!editing && pkg && pkg.price > 0) setPrice(String(Math.round(pkg.price / pkg.totalSessions)));
  };

  const startTs = new Date(`${date}T${time}`).getTime();
  const validStart = !Number.isNaN(startTs);
  const endTs = validStart ? startTs + duration * 60_000 : 0;
  const overlaps = validStart
    ? sessions.filter(
        (o) => o.id !== editing?.id && isActive(o) && startMs(o) < endTs && startTs < endMs(o),
      )
    : [];

  const submit = async () => {
    if (!validStart) return onToast("Проверьте дату и время");
    if (clientId === "new" && !newName.trim()) return onToast("Введите имя клиента");

    const body: Record<string, unknown> = {
      startsAt: new Date(startTs).toISOString(),
      durationMin: duration,
      muscleGroup: muscle,
      kind,
      price: Number(price) || 0,
      note: note.trim(),
    };
    if (!byPackage) body.paid = paid;

    setSaving(true);
    try {
      if (editing) {
        await patch(`/api/sessions/${editing.id}`, body);
        onSaved("Тренировка обновлена");
      } else {
        const payload = clientId === "new" ? { ...body, newClientName: newName.trim() } : { ...body, clientId: Number(clientId) };
        await post("/api/sessions", payload);
        onSaved("Тренировка записана");
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Клиент">
        <select
          value={clientId}
          disabled={!!editing}
          onChange={(e) => chooseClient(e.target.value)}
          className={input}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="new">+ Новый клиент</option>
        </select>
      </Field>

      {clientId === "new" && (
        <Field label="Имя нового клиента">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Например, Анна" className={input} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </Field>
        <Field label="Начало">
          <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={input} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Длительность">
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={input}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} мин
              </option>
            ))}
          </select>
        </Field>
        <Field label="Тип">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
            {Object.entries(KINDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Группа мышц">
        <div className="flex flex-wrap gap-2">
          {Object.entries(MUSCLE_GROUPS).map(([k, m]) => {
            const active = muscle === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setMuscle(k)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active ? "border-transparent text-white shadow-md" : "border-[#E0E5F1] bg-white text-[#5C6B86]"
                }`}
                style={active ? { backgroundColor: m.color } : undefined}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 items-end gap-3">
        <Field label={byPackage ? "Доля абонемента, ₽" : "Стоимость, ₽"}>
          <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
        </Field>
        {byPackage ? (
          <p className="pb-2.5 text-sm font-medium text-[#5C6B86]">
            По абонементу · {editing?.paid ? "оплачен" : "не оплачен"}
          </p>
        ) : (
          <label className="flex items-center gap-2 pb-2.5 text-sm font-medium text-[#5C6B86]">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-[#4A5BF0]" />
            Оплачено
          </label>
        )}
      </div>

      <Field label="Заметка">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например, болит колено" className={input} />
      </Field>

      {overlaps.length > 0 && (
        <p className="rounded-2xl bg-[#FDECEF] p-3 text-sm text-[#B4232E]">
          ⚠️ Наложение с: {overlaps.map((o) => `${fmtTime(new Date(o.startsAt))} ${o.clientName}`).join(", ")}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="w-full rounded-2xl bg-gradient-to-br from-[#4A5BF0] to-[#3D4EDB] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#F04452]/30 disabled:opacity-60"
      >
        {saving ? "Сохраняю…" : editing ? "Сохранить" : "Записать"}
      </button>
    </div>
  );
}
