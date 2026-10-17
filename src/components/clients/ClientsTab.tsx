"use client";

import { useMemo, useState } from "react";
import { post } from "@/lib/client-api";
import { startMs } from "@/lib/analytics";
import { buildSeries, latestWithDelta, metricDef } from "@/lib/metrics";
import { addDays, dayKey, fmtShortDate } from "@/lib/time";
import type { ClientDTO, MeasurementDTO, SessionDTO } from "@/lib/types";
import { IconPlus, IconSearch } from "@/components/ui/icons";
import { Sparkline } from "@/components/charts/Charts";

const AVATAR_COLORS = ["#F43F5E", "#F97316", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6", "#EAB308"];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export const avatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length];

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400";

export default function ClientsTab({
  clients,
  history,
  measurements,
  now,
  onOpen,
  onReload,
  onToast,
}: {
  clients: ClientDTO[];
  history: SessionDTO[];
  measurements: MeasurementDTO[];
  now: Date;
  onOpen: (id: number) => void;
  onReload: () => void;
  onToast: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    total: "8",
    price: "9600",
    paid: true,
    expiresAt: dayKey(addDays(now, 30)),
  });

  const rows = useMemo(() => {
    const todayTs = now.getTime();
    return clients.map((c) => {
      const pkg = c.packages[c.packages.length - 1] ?? null;
      const mine = history.filter((s) => s.clientId === c.id);
      const next = mine
        .filter((s) => s.status === "planned" && startMs(s) >= todayTs)
        .sort((a, b) => startMs(a) - startMs(b))[0];
      const last = mine
        .filter((s) => s.status === "done")
        .sort((a, b) => startMs(b) - startMs(a))[0];
      const debt = mine
        .filter((s) => s.status === "done" && !s.paid && s.price > 0)
        .reduce((acc, s) => acc + s.price, 0);
      const ms = measurements.filter((m) => m.clientId === c.id);
      return {
        client: c,
        pkg,
        next,
        last,
        debt: debt + (pkg && !pkg.paid && pkg.remainingSessions > 0 ? pkg.price : 0),
        weight: latestWithDelta(ms, "weight"),
        spark: buildSeries(ms, "weight", "weeks", 10),
      };
    });
  }, [clients, history, measurements, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter(
          (r) =>
            r.client.name.toLowerCase().includes(q) ||
            (r.client.phone ?? "").toLowerCase().includes(q),
        )
      : rows;
    return [...base].sort((a, b) => a.client.name.localeCompare(b.client.name, "ru"));
  }, [rows, query]);

  const createClient = async () => {
    if (!form.name.trim()) return onToast("Введи имя клиента");
    setBusy(true);
    try {
      await post("/api/clients", {
        name: form.name,
        phone: form.phone,
        package: {
          title: `Абонемент ${form.total} занятий`,
          totalSessions: Number(form.total),
          price: Number(form.price),
          paid: form.paid,
          expiresAt: form.expiresAt || null,
        },
      });
      setAdding(false);
      setForm({ ...form, name: "", phone: "" });
      onToast("Клиент добавлен");
      onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const weightDef = metricDef("weight");

  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или телефону"
            className="w-full rounded-[18px] border border-white/70 bg-white/80 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-300"
          />
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-label="Новый клиент"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] text-white transition active:scale-90"
          style={{ background: "var(--ios-blue)", boxShadow: "0 6px 16px -6px rgba(0,122,255,0.6)" }}
        >
          <IconPlus className="h-5 w-5" />
        </button>
      </div>

      {adding && (
        <div className="space-y-2.5 rounded-[22px] bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Новый клиент</p>
          <input
            autoFocus
            placeholder="Имя"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={input}
          />
          <input
            placeholder="Телефон"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={input}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-slate-500">
              Занятий
              <input
                type="number"
                value={form.total}
                onChange={(e) => setForm({ ...form, total: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-500">
              Сумма, ₽
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className={input}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.paid}
              onChange={(e) => setForm({ ...form, paid: e.target.checked })}
              className="h-4 w-4 accent-emerald-500"
            />
            Абонемент оплачен
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={createClient}
              className="rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="on-bg-dim py-10 text-center text-sm">
          {query ? "Никого не нашлось" : "Клиентов пока нет"}
        </p>
      )}

      <ul className="space-y-2.5">
        {filtered.map((r) => {
          const pkg = r.pkg;
          const low = pkg !== null && pkg.remainingSessions <= 1;
          return (
            <li key={r.client.id}>
              <button
                type="button"
                onClick={() => onOpen(r.client.id)}
                className="flex w-full items-center gap-3 rounded-[22px] bg-white p-3.5 text-left shadow-sm transition active:scale-[0.99]"
              >
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: avatarColor(r.client.id) }}
                >
                  {initials(r.client.name)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[15px] font-bold text-slate-900">{r.client.name}</p>
                    {r.debt > 0 && (
                      <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                        долг
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {pkg ? (
                      <span className={low ? "font-semibold text-amber-600" : ""}>
                        осталось {pkg.remainingSessions} из {pkg.totalSessions}
                      </span>
                    ) : (
                      "без абонемента"
                    )}
                    {r.next
                      ? ` · след. ${fmtShortDate(new Date(r.next.startsAt))}`
                      : r.last
                        ? ` · был ${fmtShortDate(new Date(r.last.startsAt))}`
                        : ""}
                  </p>
                </div>

                {r.weight && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Sparkline points={r.spark} color={weightDef.color} />
                    <div className="text-right">
                      <p className="text-[13px] font-bold tabular-nums text-slate-900">
                        {Math.round(r.weight.value * 10) / 10}
                      </p>
                      <p className="text-[9px] text-slate-400">кг</p>
                    </div>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
