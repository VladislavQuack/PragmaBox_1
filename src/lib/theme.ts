"use client";

// Темы меняют только фон приложения и текст поверх него.
// Карточки везде остаются светлыми — так ничего не теряет читаемость.
import { useCallback, useEffect, useState } from "react";

export type ThemeId = "coral";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  hint: string;
  swatch: string;
  tgColor: string;
  dark: boolean;
}

export const CORAL_THEME: ThemeDef = {
  id: "coral",
  label: "Коралл",
  hint: "Тёплый мягкий фон",
  swatch: "linear-gradient(145deg, #ffd9c2 0%, #fff1e8 50%, #ffe0ea 100%)",
  tgColor: "#fff1e8",
  dark: false,
};

export const DEFAULT_THEME: ThemeId = "coral";

export const themeDef = (_id?: string): ThemeDef => CORAL_THEME;

export function useTheme(): [ThemeId, (t: ThemeId) => void] {
  const [theme] = useState<ThemeId>("coral");

  useEffect(() => {
    document.documentElement.dataset.theme = "coral";
  }, []);

  const setTheme = useCallback(() => {}, []);
  return [theme, setTheme];
}
