"use client";

import Link from "next/link";
import { useState } from "react";
import { Code, Step } from "@/components/ui/Guide";

function CopyBox({ text, hint }: { text: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // буфер обмена может быть недоступен
    }
  };
  return (
    <div className="rounded-2xl bg-[#4A5BF0] p-3">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[#7DE3A8]">
        {text}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="mt-2 rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white active:scale-95"
      >
        {copied ? "Скопировано ✓" : "Скопировать"}
      </button>
      {hint && <p className="mt-2 text-[11px] text-[#9AA6BE]">{hint}</p>}
    </div>
  );
}

export default function DeployGuide() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-[max(var(--safe-top),16px)]">
      <header className="mb-4">
        <Link href="/setup" className="on-bg-dim text-sm font-semibold">
          ← К настройке Telegram
        </Link>
        <h1 className="on-bg mt-2 text-2xl font-bold">Публикация на Vercel</h1>
        <p className="on-bg-dim mt-1 text-sm">
          Нужен постоянный адрес, чтобы приложение работало всегда, а не только пока открыта
          песочница. Всё бесплатно на старте.
        </p>
      </header>

      <section className="mb-4 rounded-3xl bg-white/85 p-4 shadow-sm">
        <h2 className="text-[15px] font-bold text-[#0F1C33]">Что получится</h2>
        <ul className="mt-2 space-y-1 text-sm text-[#5C6B86]">
          <li>• адрес вида ritm-trainer.vercel.app с HTTPS;</li>
          <li>• отдельная база, данные не пропадают;</li>
          <li>• обновление сайта само после изменения кода.</li>
        </ul>
        <p className="mt-3 text-xs text-[#5C6B86]">
          Понадобится почта и аккаунт GitHub. Времени примерно 20–30 минут в первый раз.
        </p>
      </section>

      <ol className="space-y-3">
        <Step n={1} title="Заведи базу данных">
          <p>
            База песочницы наружу не смотрит, поэтому нужна облачная. Самый простой вариант —{" "}
            <b>Neon</b>: бесплатный тариф, обычный PostgreSQL.
          </p>
          <p>
            Зайди на neon.tech, зарегистрируйся через Google или GitHub, нажми{" "}
            <Code>Create project</Code>. Регион выбирай поближе, например Frankfurt.
          </p>
          <p>
            После создания Neon покажет <b>Connection string</b>. Скопируй её, выбрав вариант{" "}
            <Code>Pooled connection</Code> — он рассчитан на такие приложения, как наше.
          </p>
          <CopyBox
            text="postgresql://user:пароль@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require"
            hint="Так выглядит строка. У тебя будет своя — не потеряй её."
          />
        </Step>

        <Step n={2} title="Создай пустой репозиторий">
          <p>
            Vercel забирает код из GitHub. Скачай проект из песочницы и распакуй его на компьютере.
          </p>
          <p>
            На github.com нажми <Code>New repository</Code>, имя — например{" "}
            <Code>ritm-trainer</Code>, тип <b>Private</b>.
          </p>
          <p className="rounded-xl bg-amber-50 p-2.5 text-[13px] text-[#8A5A00]">
            Галочки <Code>Add a README</Code>, <Code>.gitignore</Code> и <Code>license</Code>{" "}
            <b>не ставь</b>. Репозиторий должен быть пустым, иначе при отправке будет конфликт.
          </p>
          <p>
            После создания GitHub покажет адрес вида{" "}
            <Code>https://github.com/логин/ritm-trainer.git</Code> — он нужен в шаге 3.
          </p>
        </Step>

        <Step n={3} title="Отправь код через терминал">
          <p>
            Открой терминал и перейди в папку проекта: команда <Code>cd</Code>, пробел, и путь к
            папке. Можно перетащить папку в окно терминала, путь подставится сам.
          </p>
          <p>Проверь, что ты в нужном месте — в списке должен быть package.json:</p>
          <CopyBox text="ls" hint="На Windows в PowerShell — та же команда, работает." />

          <p className="pt-1 font-semibold text-[#0F1C33]">Представься гиту (один раз на компьютере)</p>
          <CopyBox
            text={'git config --global user.name "Твоё Имя"\ngit config --global user.email "почта@example.com"'}
            hint="Почту указывай ту же, что и в аккаунте GitHub."
          />

          <p className="pt-1 font-semibold text-[#0F1C33]">Отправь проект</p>
          <CopyBox
            text={
              "git init\n" +
              "git add .\n" +
              'git commit -m "PragmaBox: первая версия"\n' +
              "git branch -M main\n" +
              "git remote add origin https://github.com/логин/ritm-trainer.git\n" +
              "git push -u origin main"
            }
            hint="В пятой строке замени адрес на свой из шага 2. Команды выполняй по очереди."
          />
          <p>
            Что они делают: <Code>init</Code> заводит репозиторий в папке, <Code>add</Code> собирает
            файлы, <Code>commit</Code> сохраняет их, <Code>remote</Code> привязывает твой GitHub,{" "}
            <Code>push</Code> отправляет.
          </p>

          <p className="pt-1 font-semibold text-[#0F1C33]">Пароль не подойдёт — нужен токен</p>
          <p>
            При <Code>push</Code> терминал спросит логин и пароль. Обычный пароль GitHub больше не
            принимает, вместо него нужен токен.
          </p>
          <p>
            Получить: github.com → аватар → <Code>Settings</Code> →{" "}
            <Code>Developer settings</Code> → <Code>Personal access tokens</Code> →{" "}
            <Code>Tokens (classic)</Code> → <Code>Generate new token (classic)</Code>. Поставь
            галочку <Code>repo</Code>, срок любой, создай и сразу скопируй — второй раз он не
            покажется.
          </p>
          <p>
            В терминале на вопрос <Code>Username</Code> введи свой логин, на{" "}
            <Code>Password</Code> вставь токен. Символы при вставке не отображаются, это нормально —
            просто нажми Enter.
          </p>
        </Step>

        <Step n={4} title="Проверь, что секреты не уехали">
          <p>
            В проекте есть файл <Code>.env</Code> с паролем от базы. Он защищён файлом{" "}
            <Code>.gitignore</Code>, но лучше убедиться. Выполни:
          </p>
          <CopyBox text="git ls-files | grep env" />
          <p>
            Ответ должен быть только <Code>.env.example</Code>. Если видишь просто{" "}
            <Code>.env</Code> — останови отправку и напиши мне, перевыпустим пароль базы.
          </p>
          <p>
            Обнови страницу репозитория на GitHub: файлы должны появиться, а папок{" "}
            <Code>node_modules</Code> и <Code>.next</Code> быть не должно.
          </p>
        </Step>

        <Step n={5} title="Создай проект в Vercel">
          <p>
            Зайди на vercel.com и зарегистрируйся через GitHub. Нажми <Code>Add New…</Code> →{" "}
            <Code>Project</Code> и выбери свой репозиторий.
          </p>
          <p>
            Vercel сам поймёт, что это Next.js, и подставит нужные настройки сборки. Менять их не
            надо.
          </p>
          <p>
            <b>Не нажимай Deploy сразу</b> — сначала добавь переменные, это следующий шаг.
          </p>
        </Step>

        <Step n={6} title="Добавь переменные окружения">
          <p>
            На экране создания проекта раскрой <Code>Environment Variables</Code> и добавь две
            штуки.
          </p>
          <p>
            Первая: имя <Code>DATABASE_URL</Code>, значение — строка из Neon (шаг 1).
          </p>
          <p>
            Вторая: имя <Code>TELEGRAM_BOT_TOKEN</Code>, значение — токен от{" "}
            <Code>@BotFather</Code>.
          </p>
          <p className="rounded-xl bg-amber-50 p-2.5 text-[13px] text-[#8A5A00]">
            Переменные можно добавить и позже: <Code>Settings</Code> →{" "}
            <Code>Environment Variables</Code>. Но тогда нужно будет заново запустить сборку —{" "}
            <Code>Deployments</Code> → <Code>Redeploy</Code>.
          </p>
        </Step>

        <Step n={7} title="Нажми Deploy">
          <p>
            Сборка идёт пару минут. В конце Vercel покажет адрес вида{" "}
            <Code>ritm-trainer.vercel.app</Code>.
          </p>
          <p>
            Если откроешь его в браузере, увидишь экран «Открой приложение через Telegram». Это
            правильно: токен уже задан, а значит вход только через бота.
          </p>
          <p>
            Если сборка упала, открой вкладку <Code>Building</Code> и посмотри последние красные
            строки — почти всегда это опечатка в переменной.
          </p>
        </Step>

        <Step n={8} title="Создай таблицы в новой базе">
          <p>
            База из шага 1 пока пустая. Таблицы создаются одной командой, но сначала скопируй
            локальный шаблон переменных. В терминале PowerShell, находясь в папке проекта, выполни:
          </p>
          <CopyBox
            text="Copy-Item .env.example .env"
            hint="Так появится локальный .env. В GitHub его намеренно нет: внутри будут секреты."
          />
          <p>
            Открой созданный файл и вставь строку Neon вместо тестовой строки <Code>DATABASE_URL</Code>:
          </p>
          <CopyBox
            text='notepad .env'
            hint="Сохрани файл и закрой Блокнот. В строке подключения подставь свои значения Neon."
          />
          <CopyBox
            text={"DATABASE_URL=postgresql://user:пароль@ep-xxx-pooler...neon.tech/neondb?sslmode=require"}
            hint="Одна строка, без кавычек и пробелов вокруг знака равно. Остальные переменные из шаблона можно оставить пустыми."
          />
          <p>
            Проверь, что имя именно <Code>.env</Code>, а не <Code>.env.txt</Code>. Затем в том же
            окне терминала выполни две команды:
          </p>
          <CopyBox text="npm install" hint="Первая: ставит зависимости. Идёт пару минут." />
          <div className="mt-2">
            <CopyBox
              text="npx drizzle-kit push --config=drizzle.config.prod.ts"
              hint="Вторая: создаёт таблицы. Конфиг сам читает DATABASE_URL из .env."
            />
          </div>
          <p>
            Когда увидишь <Code>Changes applied</Code> или <Code>No changes detected</Code> —
            готово. Повторять только если мы поменяем структуру данных.
          </p>
          <p className="rounded-xl bg-amber-50 p-2.5 text-[13px] text-[#8A5A00]">
            <b>Важно:</b> не загружай <Code>.env</Code> в GitHub. Для Vercel секреты добавляются
            отдельно в <Code>Settings → Environment Variables</Code>.
          </p>
        </Step>

        <Step n={9} title="Укажи новый адрес боту">
          <p>
            Открой <Code>@BotFather</Code> → <Code>/mybots</Code> → твой бот →{" "}
            <Code>Bot Settings</Code> → <Code>Menu Button</Code> →{" "}
            <Code>Edit menu button URL</Code> и вставь адрес с Vercel.
          </p>
          <p>
            Если раньше создавал мини-апп через <Code>/newapp</Code>, поправь адрес и там:{" "}
            <Code>/myapps</Code> → выбрать приложение → <Code>Edit Web App URL</Code>.
          </p>
          <p>
            Главное мини-приложение тоже должно смотреть на адрес с Vercel: <Code>Bot Settings</Code> →{" "}
            <Code>Configure Mini App</Code> (если выключено — <Code>Enable Mini App</Code>). Без него иконка на
            главном экране телефона не откроет приложение.
          </p>
          <p>Закрой приложение в Telegram и открой заново: оно кеширует старую версию.</p>
        </Step>
      </ol>

      <section className="mt-5 rounded-3xl bg-white/85 p-4 text-sm shadow-sm">
        <h2 className="font-bold text-[#0F1C33]">Как обновлять потом</h2>
        <p className="mt-2 text-[#5C6B86]">
          Поменял что-то в коде — те же три команды из папки проекта. Vercel пересоберёт сайт сам за
          пару минут.
        </p>
        <div className="mt-2">
          <CopyBox
            text={'git add .\ngit commit -m "что изменил"\ngit push'}
            hint="git init и git remote во второй раз не нужны."
          />
        </div>
      </section>

      <section className="mt-3 rounded-3xl bg-white/85 p-4 text-sm shadow-sm">
        <h2 className="font-bold text-[#0F1C33]">Что дальше</h2>
        <ul className="mt-2 space-y-1.5 text-[#5C6B86]">
          <li>
            <b>Свой домен.</b> <Code>Settings</Code> → <Code>Domains</Code>, если захочешь красивый
            адрес вместо vercel.app.
          </li>
          <li>
            <b>Бесплатных лимитов</b> Vercel и Neon хватит на десятки тренеров. Платить придётся
            только при серьёзном росте.
          </li>
        </ul>
      </section>

      <section className="mt-3 rounded-3xl bg-white/85 p-4 text-sm shadow-sm">
        <h2 className="font-bold text-[#0F1C33]">Если что-то сломалось</h2>
        <ul className="mt-2 space-y-1.5 text-[#5C6B86]">
          <li>
            <b>Ошибка про DATABASE_URL</b> — переменная не добавлена или добавлена после сборки.
            Добавь и сделай <Code>Redeploy</Code>.
          </li>
          <li>
            <b>relation does not exist</b> — не выполнен шаг 6, таблиц в базе нет.
          </li>
          <li>
            <b>Долгий первый запуск</b> — это нормально: бесплатный тариф «засыпает» и просыпается
            за пару секунд.
          </li>
          <li>
            <b>Белый экран в Telegram</b> — проверь, что адрес начинается с <Code>https</Code> и без
            лишнего слеша в конце.
          </li>
        </ul>
      </section>

      <section className="mt-3 rounded-3xl bg-white/85 p-4 text-sm shadow-sm">
        <h2 className="font-bold text-[#0F1C33]">Ошибки в терминале</h2>
        <ul className="mt-2 space-y-2 text-[#5C6B86]">
          <li>
            <b>Authentication failed</b> — вместо пароля нужен токен из шага 3.
          </li>
          <li>
            <b>remote origin already exists</b> — адрес уже привязан. Замени его:
            <div className="mt-1">
              <CopyBox text="git remote set-url origin https://github.com/логин/ritm-trainer.git" />
            </div>
          </li>
          <li>
            <b>failed to push some refs</b> — репозиторий создан с README. Забери его и отправь
            снова:
            <div className="mt-1">
              <CopyBox text="git pull --rebase origin main\ngit push -u origin main" />
            </div>
          </li>
          <li>
            <b>src refspec main does not match any</b> — нет коммита. Повтори{" "}
            <Code>git add .</Code> и <Code>git commit -m &quot;первая версия&quot;</Code>.
          </li>
          <li>
            <b>command not found: git</b> — git не установлен. Скачай с git-scm.com, на macOS можно{" "}
            <Code>xcode-select --install</Code>.
          </li>
        </ul>
      </section>
    </main>
  );
}
