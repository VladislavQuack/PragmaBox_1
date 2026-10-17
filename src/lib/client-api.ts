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
  ready?: () => void;
  expand?: () => void;
  viewportStableHeight?: number;
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

// Скрипт Telegram подключён с async, поэтому он может загрузиться позже первого запроса.
// Ждём его, иначе initData ещё пуст и сервер не узнает, кто открыл приложение.
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

function authHeaders(): Record<string, string> {
  const initData = telegramWebApp()?.initData;
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
