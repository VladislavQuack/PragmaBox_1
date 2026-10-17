// Технические страницы (/setup, /deploy) нужны только владельцу приложения.
// По умолчанию они скрыты — это «витринный» режим для показа клиентам.
// Чтобы включить, задай переменную окружения SHOW_GUIDES=1.
export function guidesEnabled(): boolean {
  return process.env.SHOW_GUIDES === "1";
}
