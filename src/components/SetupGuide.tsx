"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Code, Step } from "@/components/ui/Guide";

export default function SetupGuide({ hasToken }: { hasToken: boolean }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Адрес читаем после первого рендера: на сервере его нет
    const id = window.setTimeout(() => setOrigin(window.location.origin), 0);
    return () => window.clearTimeout(id);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // буфер обмена может быть недоступен
    }
  };

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-[max(var(--safe-top),16px)]">
      <header className="mb-4">
        <Link href="/" className="on-bg-dim text-sm font-semibold">
          ← На дашборд
        </Link>
        <h1 className="on-bg mt-2 text-2xl font-bold">Запуск в Telegram</h1>
        <p className="on-bg-dim mt-1 text-sm">
          Пять шагов. Ничего программировать не нужно, всё делается перепиской с ботом.
        </p>
      </header>

      <div
        className={`mb-4 rounded-2xl p-3 text-sm font-medium ${
          hasToken ? "bg-[#E5F7EC] text-[#0E7A47]" : "bg-[#FFF3DF] text-[#8A5A00]"
        }`}
      >
        {hasToken
          ? "✅ Токен бота найден. Вход через Telegram включён."
          : "⏳ Токена бота пока нет. Приложение работает в демо-режиме и открывается в браузере."}
      </div>

      <section className="mb-4 rounded-3xl bg-white/85 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#5C6B86]">Адрес приложения</p>
        <p className="mt-1 break-all font-mono text-[13px] text-[#0F1C33]">{origin || "…"}</p>
        <button
          type="button"
          onClick={copy}
          className="mt-3 w-full rounded-xl bg-[#4A5BF0] py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
        >
          {copied ? "Скопировано ✓" : "Скопировать адрес"}
        </button>
        <p className="mt-2 text-xs text-[#5C6B86]">
          Этот адрес понадобится в шаге 4. Он живёт, пока работает песочница: для постоянного бота
          нужен свой хостинг (шаг 5).
        </p>
      </section>

      <ol className="space-y-3">
        <Step n={1} title="Создай бота">
          <p>
            Открой в Telegram <Code>@BotFather</Code> и отправь команду <Code>/newbot</Code>.
          </p>
          <p>
            Он спросит название (любое, например «PragmaBox Тренер») и username — он должен заканчиваться
            на <Code>bot</Code>, например <Code>ritm_trainer_bot</Code>.
          </p>
          <p>
            В ответ придёт <b>токен</b> — длинная строка вида{" "}
            <Code>12345678:AAH...</Code>. Это пароль от бота, никому его не показывай.
          </p>
        </Step>

        <Step n={2} title="Добавь токен в приложение">
          <p>
            В настройках этой песочницы найди переменные окружения (Secrets / Environment) и добавь
            переменную с именем <Code>TELEGRAM_BOT_TOKEN</Code>, а значением — токен из шага 1.
          </p>
          <p>
            После этого приложение начнёт узнавать, кто его открыл, и у каждого тренера будут свои
            клиенты.
          </p>
        </Step>

        <Step n={3} title="Проверь, что открывается">
          <p>
            Пока токена нет, приложение пускает всех в демо-режиме. Как только токен добавлен, вход
            будет только из Telegram.
          </p>
          <p>
            Если хочешь и дальше открывать его в браузере для отладки, добавь ещё одну переменную{" "}
            <Code>ALLOW_BROWSER_DEMO</Code> со значением <Code>1</Code>.
          </p>
        </Step>

        <Step n={4} title="Привяжи приложение к боту">
          <p>
            Снова открой <Code>@BotFather</Code> и отправь <Code>/newapp</Code>. Выбери своего бота и
            ответь на вопросы: название, описание, картинка 640×360.
          </p>
          <p>
            Когда он попросит <b>Web App URL</b>, вставь адрес, который скопировал выше.
          </p>
          <p>
            Чтобы приложение открывалось кнопкой в чате: <Code>/mybots</Code> → твой бот →{" "}
            <Code>Bot Settings</Code> → <Code>Menu Button</Code> → <Code>Edit menu button URL</Code>{" "}
            → тот же адрес.
          </p>
        </Step>

        <Step n={5} title="Выложи на постоянный адрес">
          <p>
            Адрес песочницы временный: закроется — бот перестанет открываться. Для настоящего
            запуска нужен хостинг с HTTPS, подойдёт бесплатный тариф Vercel.
          </p>
          <p>
            Понадобится база PostgreSQL (например Neon) и две переменные на хостинге:{" "}
            <Code>DATABASE_URL</Code> и <Code>TELEGRAM_BOT_TOKEN</Code>.
          </p>
          <Link
            href="/deploy"
            className="mt-1 inline-block rounded-xl bg-[#4A5BF0] px-4 py-2 text-[13px] font-semibold text-white"
          >
            Открыть инструкцию по Vercel →
          </Link>
        </Step>
      </ol>

      <section className="mt-5 rounded-3xl bg-white/85 p-4 text-sm shadow-sm">
        <h2 className="font-bold text-[#0F1C33]">Если что-то не работает</h2>
        <ul className="mt-2 space-y-1.5 text-[#5C6B86]">
          <li>
            <b>«Открой приложение через Telegram»</b> — значит токен добавлен, а страницу открыли в
            браузере. Это правильно: заходи через бота или включи{" "}
            <Code>ALLOW_BROWSER_DEMO</Code>.
          </li>
          <li>
            <b>Белый экран в Telegram</b> — чаще всего URL без <Code>https</Code> или с опечаткой.
          </li>
          <li>
            <b>Старая версия</b> — Telegram кеширует мини-аппы. Закрой приложение и открой заново.
          </li>
        </ul>
      </section>
    </main>
  );
}
