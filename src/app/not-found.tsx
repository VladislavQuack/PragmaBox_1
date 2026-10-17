import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="glass-card max-w-sm rounded-[30px] p-7 text-center">
        <p className="text-4xl">🏋️</p>
        <h1 className="mt-3 text-[19px] font-bold text-black">Страница не найдена</h1>
        <p className="mt-2 text-sm text-[var(--label-3)]">
          Похоже, такой страницы нет. Вернись на главный экран — там таймлайн дня.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: "var(--ios-blue)" }}
        >
          На дашборд
        </Link>
      </div>
    </main>
  );
}
