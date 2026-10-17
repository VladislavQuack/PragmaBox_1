"use client";

// Темы меняют только фон приложения и текст поверх него.
// Карточки везде остаются светлыми — так ничего не теряет читаемость.
import { useCallback, useEffect, useState } from "react";

export type ThemeId = "ios" | "bitrix" | "graphite" | "coral";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  hint: string;
  // Превью-градиент для кнопки выбора
  swatch: string;
  // Цвет шапки и фона окна в Telegram
  tgColor: string;
  dark: boolean;
}

export const THEMES: ThemeDef[] = [
  {
    id: "ios",
    label: "Светлый",
    hint: "Как в iOS, по умолчанию",
    swatch: "linear-gradient(145deg, #ffffff 0%, #f2f2f7 55%, #e5e5ea 100%)",
    tgColor: "#f2f2f7",
    dark: false,
  },
  {
    id: "bitrix",
    label: "Синий",
    hint: "Как в Битриксе",
    swatch: "linear-gradient(145deg, #2a8fe8 0%, #0b4ea2 55%, #0a3c7d 100%)",
    tgColor: "#1272d4",
    dark: true,
  },
  {
    id: "graphite",
    label: "Графит",
    hint: "Тёмный, не бьёт по глазам вечером",
    swatch: "linear-gradient(145deg, #3a4356 0%, #1c222e 60%, #11151d 100%)",
    tgColor: "#232a38",
    dark: true,
  },
  {
    id: "coral",
    label: "Коралл",
    hint: "Тёплый светлый",
    swatch: "linear-gradient(145deg, #ffd9c2 0%, #fff1e8 50%, #ffe0ea 100%)",
    tgColor: "#fff1e8",
    dark: false,
  },
];

export const DEFAULT_THEME: ThemeId = "ios";
const STORAGE_KEY = "trainer-theme-v1";

export const themeDef = (id: ThemeId): ThemeDef =>
  THEMES.find((t) => t.id === id) ?? THEMES[0];

const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === "string" && THEMES.some((t) => t.id === v);

export function useTheme(): [ThemeId, (t: ThemeId) => void] {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // приватный режим
    }
    if (!saved || !isThemeId(saved) || saved === DEFAULT_THEME) return;
    // Читаем после первого рендера, чтобы не было рассинхрона с сервером
    const id = window.setTimeout(() => setThemeState(saved as ThemeId), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // не критично
    }
  }, []);

  return [theme, setTheme];
}
