// Типы для импорта картинок (*.svg, *.png …) как статических ассетов Next.js.
// Обычно их подключает сгенерированный next-env.d.ts, но он в .gitignore —
// без этой строки `npm run typecheck` на свежем клоне не видит импорт SVG.
/// <reference types="next/image-types/global" />
