"use client";

import { useMemo, useState } from "react";
import { ApiError, post } from "@/lib/client-api";
import { FREE_CLIENT_LIMIT } from "@/lib/subscription";
import { startMs } from "@/lib/analytics";
import { buildSeries, latestWithDelta, metricDef } from "@/lib/metrics";
import { addDays, dayKey, fmtShortDate } from "@/lib/time";
import type { ClientDTO, MeasurementDTO, SessionDTO } from "@/lib/types";
import { IconPlus, IconSearch } from "@/components/ui/icons";
import { Sparkline } from "@/components/charts/Charts";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export const avatarColor = (_id: number) => "#4A5BF0";

const input =
  "w-full rounded-xl border border-[#E0E5F1] bg-white px-3 py-2.5 text-sm text-[#0F1C33] outline-none focus:border-[#4A5BF0]";

export default function ClientsTab({
  clients,
  history,
  measurements,
  now,
  onOpen,
  onReload,
  onToast,
  subscriptionTier,
  onOpenPremium,
}: {
  clients: ClientDTO[];
  history: SessionDTO[];
  measurements: MeasurementDTO[];
  now: Date;
  onOpen: (id: number) => void;
  onReload: () => void;
  onToast: (msg: string) => void;
  subscriptionTier: string;
  onOpenPremium: () => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [limitPrompt, setLimitPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const freeAtLimit = subscriptionTier !== "premium" && clients.length >= FREE_CLIENT_LIMIT;
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
      if (e instanceof ApiError && e.code === "FREE_CLIENT_LIMIT") {
        setAdding(false);
        setLimitPrompt(true);
      } else {
        onToast(e instanceof Error ? e.message : "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  };

  const weightDef = metricDef("weight");

  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA6BE]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или телефону"
            className="w-full rounded-[18px] border border-[#E6EAF3] bg-white py-2.5 pl-9 pr-3 text-sm text-[#0F1C33] outline-none placeholder:text-[#9AA6BE] focus:border-[#4A5BF0]"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (freeAtLimit) {
              setAdding(false);
              setLimitPrompt(true);
              return;
            }
            setAdding((v) => !v);
          }}
          aria-label="Новый клиент"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-[#4A5BF0] text-white transition active:scale-90"
          style={{ boxShadow: "0 8px 18px -8px rgba(74,91,240,0.8)" }}
        >
          <IconPlus className="h-5 w-5" />
        </button>
      </div>

      {adding && (
        <div className="space-y-2.5 rounded-[22px] border border-[#E6EAF3] bg-white p-4">
          <p className="text-sm font-bold text-[#0F1C33]">Новый клиент</p>
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
            <label className="space-y-1 text-xs text-[#5C6B86]">
              Занятий
              <input
                type="number"
                value={form.total}
                onChange={(e) => setForm({ ...form, total: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1 text-xs text-[#5C6B86]">
              Сумма, ₽
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className={input}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#0F1C33]">
            <input
              type="checkbox"
              checked={form.paid}
              onChange={(e) => setForm({ ...form, paid: e.target.checked })}
              className="h-4 w-4 accent-[#4A5BF0]"
            />
            Абонемент оплачен
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-xl bg-[#F1F3F9] py-2.5 text-sm font-semibold text-[#5C6B86]"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={createClient}
              className="rounded-xl bg-[#4A5BF0] py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}

      {limitPrompt && (
        <section className="relative overflow-hidden rounded-[22px] p-4 text-white" style={{ background: "linear-gradient(135deg, #6C82FF 0%, #4A5BF0 58%, #3D4EDB 100%)" }}>
          <span className="hero-pattern pointer-events-none absolute inset-0 opacity-50" />
          <button
            type="button"
            onClick={() => setLimitPrompt(false)}
            aria-label="Скрыть предложение Premium"
            className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/18 text-white"
          >
            ×
          </button>
          <div className="relative pr-8">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">Лимит Free достигнут</span>
            <h2 className="mt-1 text-[18px] font-bold">{FREE_CLIENT_LIMIT} из {FREE_CLIENT_LIMIT} клиентов уже в базе</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/78">
              Оформите Premium, чтобы добавлять клиентов без лимита и получить расширенную аналитику.
            </p>
            <button
              type="button"
              onClick={onOpenPremium}
              className="mt-3 rounded-full bg-white px-3.5 py-2 text-[12px] font-bold text-[#4A5BF0] transition active:scale-95"
            >
              Оформить Premium →
            </button>
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-[#9AA6BE]">
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
                className="flex w-full items-center gap-3 rounded-[22px] border border-[#E6EAF3] bg-white p-3.5 text-left transition active:scale-[0.99]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#EEF1FF] text-sm font-bold text-[#4A5BF0]">
                  {initials(r.client.name)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[15px] font-bold text-[#0F1C33]">{r.client.name}</p>
                    {r.debt > 0 && (
                      <span className="shrink-0 rounded-full bg-[#FDECEF] px-1.5 py-0.5 text-[9px] font-bold text-[#F04452]">
                        долг
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[#9AA6BE]">
                    {pkg ? (
                      <span className={low ? "font-semibold text-[#FF9F0A]" : ""}>
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
                      <p className="text-[13px] font-bold tabular-nums text-[#0F1C33]">
                        {Math.round(r.weight.value * 10) / 10}
                      </p>
                      <p className="text-[9px] text-[#9AA6BE]">кг</p>
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
