"use client";

import { useEffect } from "react";
import { telegramWebApp, type TgWebApp } from "@/lib/client-api";

// Цвет шапки Telegram по умолчанию — как синяя шапка приложения.
export const TG_HEADER_COLOR = "#4A5BF0";
const TG_BACKGROUND_COLOR = "#F1F3F9";

// Полноэкранный режим включаем только на телефонах:
// на компьютере он развернул бы на весь экран всё окно Telegram.
const FULLSCREEN_PLATFORMS = new Set(["android", "ios"]);

// Настраивает окно мини-аппа при запуске. Возвращает функцию отписки от событий.
export function setupTelegramShell(tg: TgWebApp): () => void {
  const atLeast = (version: string) => {
    try {
      return tg.isVersionAtLeast?.(version) ?? false;
    } catch {
      return false;
    }
  };
  const root = document.documentElement;

  tg.expand?.();

  // В полноэкранном режиме нет верхней полосы Telegram с крестиком и названием:
  // остаются только две маленькие плавающие кнопки, а экран целиком наш.
  // Отступы под строку состояния и эти кнопки Telegram отдаёт CSS-переменными (см. globals.css).
  if (atLeast("8.0") && FULLSCREEN_PLATFORMS.has(tg.platform ?? "") && !tg.isFullscreen) {
    try {
      tg.requestFullscreen?.();
    } catch {
      // Клиент не умеет — остаёмся в обычном развёрнутом режиме
    }
  }

  tg.ready?.();

  // Свайп вниз больше не сворачивает приложение: раньше, закрывая так шторку,
  // тренер сворачивал весь мини-апп. Свернуть и закрыть можно кнопками Telegram.
  if (atLeast("7.7")) tg.disableVerticalSwipes?.();

  // В полноэкранном режиме шапка прозрачная, но по её цвету Telegram выбирает
  // цвет значков строки состояния, поэтому задаём его всегда.
  tg.setHeaderColor?.(TG_HEADER_COLOR);
  tg.setBackgroundColor?.(TG_BACKGROUND_COLOR);

  const applyViewport = () => {
    const h = tg.viewportStableHeight;
    if (h) root.style.setProperty("--app-h", `${h}px`);
  };
  // Отметка для CSS: в полноэкранном режиме у шторок на весь экран скругляются углы
  const applyFullscreen = () => root.toggleAttribute("data-tg-fullscreen", Boolean(tg.isFullscreen));

  applyViewport();
  applyFullscreen();
  tg.onEvent?.("viewportChanged", applyViewport);
  tg.onEvent?.("fullscreenChanged", applyFullscreen);

  return () => {
    tg.offEvent?.("viewportChanged", applyViewport);
    tg.offEvent?.("fullscreenChanged", applyFullscreen);
  };
}

// Цвет шапки Telegram, пока экран открыт. Нужен экранам со светлым верхом
// (онбординг): иначе в полноэкранном режиме белые значки строки состояния
// сливаются с белым фоном.
export function useTelegramHeaderColor(color: string) {
  useEffect(() => {
    telegramWebApp()?.setHeaderColor?.(color);
    return () => telegramWebApp()?.setHeaderColor?.(TG_HEADER_COLOR);
  }, [color]);
}
