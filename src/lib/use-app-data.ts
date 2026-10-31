"use client";

// Общие данные приложения: грузим один раз и отдаём всем вкладкам.
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, getInitData, isTelegramEnv, waitForInitData } from "@/lib/client-api";
import { addDays, dayKey, parseDayKey } from "@/lib/time";
import type { ClientDTO, MeasurementDTO, SessionDTO } from "@/lib/types";
import type { PremiumInfo } from "@/lib/subscription";

export interface TrainerInfo {
  id: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  isDemo: boolean;
  subscriptionTier: string;
  monthlyGoal: number;
  avgSessionPrice: number;
  onboardingComplete: boolean;
  premium: PremiumInfo;
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
      // Ждём именно непустой initData (до 5 сек), иначе запрос уйдёт без
      // подписи и сервер вернёт 401 «Telegram не передал данные».
      await waitForInitData(5000);
      if (cancelled) return;
      // Внутри Telegram без initData дальше идти бессмысленно — покажем
      // экран с кнопкой «Попробовать снова», а не вечную загрузку.
      if (!getInitData() && isTelegramEnv()) {
        setAuthError("Telegram не передал данные. Закройте мини-апп и откройте снова кнопкой бота");
        return;
      }
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
      // Захватываем неделю вперёд: карта показывает неделю целиком
      const weekEnd = addDays(day, 8);
      const histTo = weekEnd.getTime() > monthEnd.getTime() ? weekEnd : monthEnd;

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

  // Мгновенное оптимистичное обновление сессий в памяти (без ожидания ответа сервера)
  const optimisticUpdateSession = useCallback((id: number, updates: Partial<SessionDTO>) => {
    setDaySessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
    setHistory((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  const optimisticDeleteSession = useCallback((id: number) => {
    setDaySessions((prev) => prev.filter((s) => s.id !== id));
    setHistory((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const optimisticUpdatePackage = useCallback((pkgId: number, updates: Partial<ClientDTO["packages"][number]>) => {
    setClients((prev) =>
      prev.map((c) => ({
        ...c,
        packages: c.packages.map((p) => (p.id === pkgId ? { ...p, ...updates } : p)),
      }))
    );
  }, []);

  // Клиент удалён на сервере: сразу убираем его и все его данные из памяти.
  // remainingClients — ответ сервера; при 0 сервер сбросил флаг онбординга,
  // повторяем это локально, чтобы онбординг открылся без ожидания перезагрузки.
  const optimisticDeleteClient = useCallback((clientId: number, remainingClients?: number) => {
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    setDaySessions((prev) => prev.filter((s) => s.clientId !== clientId));
    setHistory((prev) => prev.filter((s) => s.clientId !== clientId));
    setMeasurements((prev) => prev.filter((m) => m.clientId !== clientId));
    if (remainingClients === 0) {
      setMe((prev) => (prev ? { ...prev, onboardingComplete: false } : prev));
    }
  }, []);

  // Premium включился после оплаты — показываем сразу, не перезагружая всё
  const setPremium = useCallback((premium: PremiumInfo) => {
    setMe((prev) => (prev ? { ...prev, premium } : prev));
  }, []);

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
    optimisticUpdateSession,
    optimisticDeleteSession,
    optimisticUpdatePackage,
    optimisticDeleteClient,
    setPremium,
  };
}

export type AppData = ReturnType<typeof useAppData>;
