"use client";

// Системная кнопка «Назад» Telegram (стрелка в шапке и аппаратная «Назад» на Android).
// Без неё «Назад» на Android закрывал весь мини-апп, даже когда была открыта шторка.
//
// Каждый открытый слой — шторка, форма, шаг мастера — кладёт свой обработчик в стек.
// Кнопка видна, пока стек не пуст, и нажатие закрывает только верхний слой.
import { useEffect, useRef } from "react";
import { telegramWebApp } from "@/lib/client-api";

interface Entry {
  run: () => void;
  // Слой: 0 — переключение вкладок, 1 — шторки и формы поверх экрана
  layer: number;
  seq: number;
}

const stack: Entry[] = [];
let seq = 0;
let boundTo: object | null = null;

// Верхний слой; при равенстве — открытый последним
const top = () =>
  stack.reduce<Entry | undefined>(
    (best, e) => (!best || e.layer > best.layer || (e.layer === best.layer && e.seq > best.seq) ? e : best),
    undefined,
  );

function backButton() {
  const tg = telegramWebApp();
  try {
    if (!tg?.BackButton || !tg.isVersionAtLeast?.("6.1")) return null;
  } catch {
    return null;
  }
  return tg.BackButton;
}

function onBackClick() {
  top()?.run();
}

function sync() {
  const bb = backButton();
  if (!bb) return;
  if (boundTo !== bb) {
    bb.onClick?.(onBackClick);
    boundTo = bb;
  }
  if (stack.length > 0) bb.show?.();
  else bb.hide?.();
}

// Пока active = true, «Назад» вызывает handler (если поверх не открыто что-то ещё)
export function useBackButton(active: boolean, handler: () => void, layer = 1) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { run: () => ref.current(), layer, seq: ++seq };
    stack.push(entry);
    sync();
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      sync();
    };
  }, [active, layer]);
}

// Скрипт Telegram мог загрузиться позже первых слоёв — показываем кнопку, когда он готов
export function syncBackButton() {
  sync();
}
