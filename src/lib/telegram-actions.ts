"use client";

// Действия, которые внутри Telegram работают иначе, чем в обычном браузере.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isTelegramEnv,
  telegramWebApp,
  telegramWebView,
  waitForTelegram,
  type HomeScreenStatus,
  type TgWebApp,
} from "@/lib/client-api";

const atLeast = (tg: TgWebApp | undefined, version: string) => {
  try {
    return Boolean(tg?.isVersionAtLeast?.(version));
  } catch {
    return false;
  }
};

export type DownloadResult = "telegram" | "cancelled" | "browser";

// Скачивание файла по ссылке сервера.
// Встроенный браузер Telegram сам файлы не качает, поэтому в Telegram 8.0+ просим
// родное окно «Скачать файл». В старом Telegram ссылка откроется во внешнем браузере,
// в обычном браузере файл скачается как обычно.
export function downloadFile(url: string, fileName: string, onResult?: (result: DownloadResult) => void) {
  const tg = telegramWebApp();
  if (tg?.downloadFile && atLeast(tg, "8.0")) {
    try {
      tg.downloadFile({ url, file_name: fileName }, (accepted) => onResult?.(accepted ? "telegram" : "cancelled"));
      return;
    } catch {
      // Например, http-адрес при разработке — пробуем следующий способ
    }
  }
  if (tg?.openLink && isTelegramEnv()) {
    tg.openLink(url);
    onResult?.("browser");
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  onResult?.("browser");
}

// Ссылки t.me (окно «Поделиться», чат с ботом) внутри Telegram открываем родным способом.
export function openTelegramLink(url: string) {
  const tg = telegramWebApp();
  if (tg?.openTelegramLink && isTelegramEnv()) {
    try {
      tg.openTelegramLink(url);
      return;
    } catch {
      // ниже — запасной путь
    }
  }
  window.open(url, "_blank", "noopener");
}

// ─── Иконка на главном экране телефона (Bot API 8.0+) ───
//
// Как это работает в клиентах Telegram (проверено по их исходникам):
// • Android: Telegram просит систему закрепить ярлык. Ответ homeScreenAdded приходит,
//   только когда ярлык действительно появился. Если система молча отказала (на Xiaomi,
//   Huawei и др. у Telegram по умолчанию выключено разрешение «Ярлыки на рабочем столе»)
//   или человек нажал «Отмена» — не приходит ничего.
// • iPhone: иконку Telegram сам не ставит, а открывает Safari со страницей бота —
//   дальше «Поделиться» → «На экран „Домой“». Статус всегда unknown, ответов нет.
// • Компьютер и веб-версии: не умеют.
// Иконка открывает главное мини-приложение бота (BotFather → Configure Mini App).

export type DeviceKind = "android" | "ios" | "desktop";
export type PhoneBrand = "xiaomi" | "huawei" | "samsung" | "other";

export type InstallPhase =
  | "checking" // ждём ответ Telegram
  | "unsupported" // здесь иконку не добавить
  | "ready" // можно добавлять
  | "waiting" // нажали «Добавить», ждём телефон (на iPhone — ждём Safari)
  | "help" // иконка не появилась: подсказываем, что включить
  | "added"; // иконка на главном экране

// desktop — компьютер, веб-версия или вообще не Telegram; old-telegram — нужен Telegram новее;
// device — Telegram свежий, но телефон не умеет (Android старше 8-й версии)
export type UnsupportedReason = "desktop" | "old-telegram" | "device";

// Если Telegram не ответил на проверку, не держим «Проверяем…» вечно
const CHECK_TIMEOUT_MS = 1500;
// Окно системы «Добавить на главный экран?» появляется сразу. Тишина дольше —
// значит, телефон не дал добавить иконку
const ADD_TIMEOUT_MS = 3000;

export function deviceKind(tg: TgWebApp | undefined): DeviceKind {
  const platform = tg?.platform ?? "";
  if (platform === "android" || platform === "android_x") return "android";
  if (platform === "ios") return "ios";
  return "desktop";
}

// Telegram для Android дописывает к User-Agent производителя и модель телефона:
// «… Telegram-Android/11.4.2 (Xiaomi 2201117TG; Android 13; SDK 33; AVERAGE)»
export function phoneBrand(userAgent?: string): PhoneBrand {
  const ua = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const device = /Telegram-Android\/\S+\s+\(([^;)]*)/i.exec(ua)?.[1] ?? ua;
  if (/xiaomi|redmi|poco/i.test(device)) return "xiaomi";
  if (/huawei|honor/i.test(device)) return "huawei";
  if (/samsung/i.test(device)) return "samsung";
  return "other";
}

type Attempt = "idle" | "waiting" | "failed";

interface InstallEnv {
  device: DeviceKind;
  brand: PhoneBrand;
  oldTelegram: boolean;
}

export function useHomeScreen() {
  const [status, setStatus] = useState<HomeScreenStatus | null>(null);
  const [env, setEnv] = useState<InstallEnv | null>(null);
  const [attempt, setAttemptState] = useState<Attempt>("idle");
  const [addedNow, setAddedNow] = useState(false);
  const addTimer = useRef<number | undefined>(undefined);
  // Копия attempt для обработчиков событий Telegram: им нужно текущее значение
  const attemptRef = useRef<Attempt>("idle");
  const setAttempt = useCallback((next: Attempt) => {
    attemptRef.current = next;
    setAttemptState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let tgRef: TgWebApp | undefined;
    let checkTimer: number | undefined;
    const onAdded = () => {
      if (cancelled) return;
      window.clearTimeout(addTimer.current);
      if (attemptRef.current !== "idle") setAddedNow(true);
      setAttempt("idle");
      setStatus("added");
    };
    // Android присылает это, если система сразу отказала в ярлыке
    const onFailed = () => {
      if (cancelled || attemptRef.current !== "waiting") return;
      window.clearTimeout(addTimer.current);
      setAttempt("failed");
    };
    (async () => {
      const tg = await waitForTelegram(2500);
      if (cancelled) return;
      // Вне Telegram (сайт в браузере) иконку тоже не добавить — как на компьютере
      const device = tg && isTelegramEnv() ? deviceKind(tg) : "desktop";
      const fresh = Boolean(tg?.checkHomeScreenStatus) && atLeast(tg, "8.0");
      setEnv({ device, brand: device === "android" ? phoneBrand() : "other", oldTelegram: device !== "desktop" && !fresh });
      if (!tg || !fresh || device === "desktop") {
        setStatus("unsupported");
        return;
      }
      tgRef = tg;
      tg.onEvent?.("homeScreenAdded", onAdded);
      telegramWebView()?.onEvent?.("home_screen_failed", onFailed);
      checkTimer = window.setTimeout(() => {
        if (!cancelled) setStatus((s) => s ?? "unknown");
      }, CHECK_TIMEOUT_MS);
      try {
        tg.checkHomeScreenStatus?.((s) => {
          if (!cancelled) setStatus((prev) => (prev === "added" ? prev : s));
        });
      } catch {
        setStatus("unsupported");
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(checkTimer);
      window.clearTimeout(addTimer.current);
      tgRef?.offEvent?.("homeScreenAdded", onAdded);
      telegramWebView()?.offEvent?.("home_screen_failed", onFailed);
    };
  }, [setAttempt]);

  const add = useCallback(() => {
    const tg = telegramWebApp();
    window.clearTimeout(addTimer.current);
    try {
      if (!tg?.addToHomeScreen) throw new Error("addToHomeScreen недоступен");
      tg.addToHomeScreen();
    } catch {
      setAttempt("failed");
      return;
    }
    setAttempt("waiting");
    // На iPhone дальше Safari, ответа не будет — подсказка уже на экране
    if (deviceKind(tg) === "ios") return;
    addTimer.current = window.setTimeout(() => {
      if (attemptRef.current === "waiting") setAttempt("failed");
    }, ADD_TIMEOUT_MS);
  }, [setAttempt]);

  const device = env?.device ?? "desktop";
  let phase: InstallPhase;
  if (status === "added") phase = "added";
  else if (!env || status === null) phase = "checking";
  else if (status === "unsupported") phase = "unsupported";
  else if (attempt === "failed") phase = "help";
  else if (attempt === "waiting") phase = "waiting";
  else phase = "ready";

  const reason: UnsupportedReason | null =
    phase !== "unsupported" ? null : device === "desktop" ? "desktop" : env?.oldTelegram ? "old-telegram" : "device";

  return {
    status,
    phase,
    device,
    brand: env?.brand ?? "other",
    reason,
    // Иконка добавлена только что, а не была на экране раньше
    addedNow,
    add,
    canAdd: phase === "ready" || phase === "waiting" || phase === "help",
  };
}
