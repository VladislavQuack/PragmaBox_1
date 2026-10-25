"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";

// Lottie-плеер. И сам плеер (лёгкая SVG-сборка lottie-web), и JSON анимации
// грузятся отдельными чанками только когда компонент показан на экране,
// поэтому в основной бандл приложения они не попадают.
export default function LottiePlayer({
  load,
  loop = true,
  className,
}: {
  // Динамический импорт JSON: () => import("…/animation.json").
  // Объявляй функцию вне компонента, иначе анимация будет перезапускаться на каждом рендере.
  load: () => Promise<{ default: unknown }>;
  loop?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let anim: AnimationItem | null = null;

    (async () => {
      const [{ default: lottie }, { default: data }] = await Promise.all([
        import("lottie-web/build/player/lottie_light"),
        load(),
      ]);
      const container = ref.current;
      if (cancelled || !container) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      anim = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop,
        autoplay: !reduceMotion,
        // lottie-web дописывает служебные поля прямо в объект — отдаём ему копию,
        // чтобы повторный показ экрана получил чистые данные
        animationData: JSON.parse(JSON.stringify(data)),
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });

      // Анимации отключены в системе — показываем статичный кадр из середины
      if (reduceMotion) {
        const item = anim;
        item.addEventListener("DOMLoaded", () => item.goToAndStop(Math.floor(item.totalFrames / 2), true));
      }
    })().catch(() => {
      // Анимация — украшение: если не загрузилась, просто остаётся пустой слот
    });

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [load, loop]);

  return <div ref={ref} className={className} aria-hidden />;
}
