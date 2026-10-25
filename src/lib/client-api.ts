// Тонкая обёртка над fetch для клиентских компонентов.
// В каждый запрос подкладываем initData от Telegram: по нему сервер узнаёт тренера.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

interface TgWebApp {
  initData?: string;
  initDataUnsafe?: { query_id?: string; user?: { id?: number } };
  platform?: string;
  version?: string;
  ready?: () => void;
  expand?: () => void;
  viewportStableHeight?: number;
  // Без этого вертикальный свайп по карте сворачивает мини-апп
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: unknown;
}

export function telegramWebApp(): TgWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

// initData из объекта Telegram. Плюс запасной путь: Telegram также кладёт
// сырые launch-параметры в URL (tgWebAppData) — это спасает, если скрипт
// telegram-web-app.js не успел загрузиться или был заблокирован.
export function getInitData(): string {
  if (typeof window === "undefined") return "";
  const fromApi = telegramWebApp()?.initData?.trim();
  if (fromApi) return fromApi;
  try {
    const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
    const search = window.location.search?.startsWith("?") ? window.location.search.slice(1) : "";
    for (const part of [hash, search]) {
      if (!part) continue;
      const tgData = new URLSearchParams(part).get("tgWebAppData");
      if (tgData?.trim()) return tgData.trim();
    }
  } catch {
    // ignore
  }
  return "";
}

export function isTelegramEnv(): boolean {
  if (typeof window === "undefined") return false;
  const tg = telegramWebApp();
  if (tg && ((tg.platform !== undefined && tg.platform !== "unknown") || tg.version)) return true;
  try {
    const combined = `${window.location.search} ${window.location.hash}`;
    return combined.includes("tgWebAppData") || combined.includes("tgWebAppVersion");
  } catch {
    return false;
  }
}

// Скрипт Telegram может загрузиться позже первого рендера.
// Ждём сам объект — для viewport-настроек этого достаточно.
export async function waitForTelegram(maxMs = 2500): Promise<TgWebApp | undefined> {
  if (typeof window === "undefined") return undefined;
  const existing = telegramWebApp();
  if (existing) return existing;

  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    const tg = telegramWebApp();
    if (tg) return tg;
  }
  return undefined;
}

// А перед запросами к API ждём именно непустой initData.
// Раньше мы возвращались сразу при появлении объекта WebApp, и запрос
// иногда уходил без подписи — сервер отвечал 401 «Telegram не передал данные».
export async function waitForInitData(maxMs = 5000): Promise<string> {
  if (typeof window === "undefined") return "";
  const started = Date.now();
  for (;;) {
    const data = getInitData();
    if (data) return data;
    if (Date.now() - started >= maxMs) return "";
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
}

export interface TelegramDiagnostics {
  hasTelegramObject: boolean;
  hasInitData: boolean;
  initDataLength: number;
  platform: string;
  version: string;
  urlHasTgData: boolean;
  userAgent: string;
}

export function getTelegramDiagnostics(): TelegramDiagnostics {
  if (typeof window === "undefined") {
    return {
      hasTelegramObject: false,
      hasInitData: false,
      initDataLength: 0,
      platform: "-",
      version: "-",
      urlHasTgData: false,
      userAgent: "-",
    };
  }
  const tg = telegramWebApp();
  const initData = getInitData();
  let urlHasTgData = false;
  try {
    const combined = `${window.location.search} ${window.location.hash}`;
    urlHasTgData = combined.includes("tgWebAppData");
  } catch {
    // ignore
  }
  return {
    hasTelegramObject: Boolean(tg),
    hasInitData: initData.length > 0,
    initDataLength: initData.length,
    platform: tg?.platform ?? "-",
    version: tg?.version ?? "-",
    urlHasTgData,
    userAgent: window.navigator.userAgent.slice(0, 120),
  };
}

function authHeaders(): Record<string, string> {
  const initData = getInitData();
  return initData ? { "X-Telegram-Init-Data": initData } : {};
}

async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `Ошибка ${res.status}`;
    const code =
      typeof data === "object" && data !== null && "code" in data
        ? String((data as { code: unknown }).code)
        : undefined;
    throw new ApiError(message, res.status, code);
  }
  return data as T;
}

export const api = <T>(url: string) => request<T>(url, "GET");
export const post = <T = unknown>(url: string, body: unknown) => request<T>(url, "POST", body);
export const patch = <T = unknown>(url: string, body: unknown) => request<T>(url, "PATCH", body);
export const del = <T = unknown>(url: string) => request<T>(url, "DELETE");
