"use client";

// Действия, которые внутри Telegram работают иначе, чем в обычном браузере.
import { useCallback, useEffect, useState } from "react";
import {
  isTelegramEnv,
  telegramWebApp,
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

// Иконка мини-аппа на главном экране телефона (Bot API 8.0+).
// status: null — ещё проверяем; unsupported — этот Telegram не умеет;
// unknown или missed — можно добавить; added — уже на главном экране.
export function useHomeScreen() {
  const [status, setStatus] = useState<HomeScreenStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let tgRef: TgWebApp | undefined;
    const onAdded = () => {
      if (!cancelled) setStatus("added");
    };
    (async () => {
      const tg = await waitForTelegram(2500);
      if (cancelled) return;
      if (!tg?.checkHomeScreenStatus || !atLeast(tg, "8.0")) {
        setStatus("unsupported");
        return;
      }
      tgRef = tg;
      tg.onEvent?.("homeScreenAdded", onAdded);
      try {
        tg.checkHomeScreenStatus((s) => {
          if (!cancelled) setStatus(s);
        });
      } catch {
        setStatus("unsupported");
      }
    })();
    return () => {
      cancelled = true;
      tgRef?.offEvent?.("homeScreenAdded", onAdded);
    };
  }, []);

  const add = useCallback(() => {
    try {
      telegramWebApp()?.addToHomeScreen?.();
    } catch {
      setStatus("unsupported");
    }
  }, []);

  return { status, add, canAdd: status === "unknown" || status === "missed" };
}
