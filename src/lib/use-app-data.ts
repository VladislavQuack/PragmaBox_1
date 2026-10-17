"use client";

// Общие данные приложения: грузим один раз и отдаём всем вкладкам.
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, waitForTelegram } from "@/lib/client-api";
import { addDays, dayKey, parseDayKey } from "@/lib/time";
import type { ClientDTO, MeasurementDTO, SessionDTO } from "@/lib/types";

export interface TrainerInfo {
  id: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  isDemo: boolean;
}

const encode = (d: Date) => encodeURIComponent(d.toISOString());
const errText = (e: unknown) => (e instanceof Error ? e.message : "Что-то пошло не так");

export function useAppData() {
  const [now, setNow] = useState<Date | null>(null);
  // null = сегодня, иначе ключ выбранного дня YYYY-MM-DD
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [daySessions, setDaySessions] = useState<SessionDTO[]>([]);
  const [history, setHistory] = useState<SessionDTO[]>([]);
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementDTO[]>([]);
  const [me, setMe] = useState<TrainerInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const todayKey = now ? dayKey(now) : null;
  const activeKey = viewKey ?? todayKey;

  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    // Красная линия «сейчас» обновляется раз в 30 секунд
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!activeKey || !todayKey) return;
    let cancelled = false;
    const dayKey = activeKey;
    const todayKeyStr = todayKey;
    (async () => {
      // Сначала дожидаемся SDK Telegram, чтобы в запрос попал initData
      await waitForTelegram(2500);
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
    async function load() {
      const day = parseDayKey(dayKey);
      const today = parseDayKey(todayKeyStr);
      const dayEnd = addDays(day, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const histFrom = addDays(today, -400);
      const histTo = dayEnd.getTime() > monthEnd.getTime() ? dayEnd : monthEnd;

      try {
        const [d, h, c, ms, m] = await Promise.all([
          api<{ sessions: SessionDTO[] }>(`/api/sessions?from=${encode(day)}&to=${encode(dayEnd)}`),
          api<{ sessions: SessionDTO[] }>(`/api/sessions?from=${encode(histFrom)}&to=${encode(histTo)}`),
          api<{ clients: ClientDTO[] }>("/api/clients"),
          api<{ measurements: MeasurementDTO[] }>("/api/measurements"),
          api<{ trainer: TrainerInfo }>("/api/me"),
        ]);
        if (cancelled) return;
        setDaySessions(d.sessions);
        setHistory(h.sessions);
        setClients(c.clients);
        setMeasurements(ms.measurements);
        setMe(m.trainer);
        setError(null);
        setAuthError(null);
        setLoaded(true);
      } catch (e: unknown) {
        if (cancelled) return;
        // Отдельный экран для проблем входа Telegram и backend-конфигурации.
        if (
          e instanceof ApiError &&
          (e.status === 401 || e.code === "AUTH_BACKEND_ERROR")
        ) {
          setAuthError(e.message);
        } else {
          setError(errText(e));
        }
      }
    }
  }, [activeKey, todayKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    now,
    todayKey,
    activeKey,
    viewKey,
    setViewKey,
    daySessions,
    history,
    clients,
    measurements,
    me,
    loaded,
    error,
    authError,
    reload,
  };
}

export type AppData = ReturnType<typeof useAppData>;
