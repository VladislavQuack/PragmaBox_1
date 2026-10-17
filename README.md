# РИТМ — дашборд тренера (Telegram Mini App)

Таймлайн дня, клиенты, абонементы, оплаты и напоминания для персональных тренеров.
Next.js (App Router) + PostgreSQL через Drizzle ORM.

## Два режима

- **Витринный (по умолчанию).** Технических страниц нет, в настройках только тема, виджеты и демо-данные.
  Так приложение показывают потенциальным клиентам.
- **Режим владельца.** Переменная `SHOW_GUIDES=1` открывает страницы `/setup` (подключение Telegram)
  и `/deploy` (публикация на Vercel) и ссылки на них в настройках.

Переменная читается на сервере при каждом запросе, так что переключение не требует пересборки —
достаточно перезапустить приложение.

## Переменные окружения

| Переменная | Обязательна | Зачем |
| --- | --- | --- |
| `DATABASE_URL` | да | Строка подключения к PostgreSQL. У облачных баз нужен `?sslmode=require` |
| `TELEGRAM_BOT_TOKEN` | на проде да | Токен бота из [@BotFather](https://t.me/BotFather). Пока пуст — приложение работает в демо-режиме |
| `ALLOW_BROWSER_DEMO` | нет | `1`, чтобы открывать приложение в браузере даже при заданном токене (для отладки) |
| `SHOW_GUIDES` | нет | `1` — показать технические инструкции `/setup` и `/deploy`. Пусто — витринный режим для показа клиентам |

Пример — в файле `.env.example`.

## Локальный запуск

```bash
npm install
npx drizzle-kit push   # создаёт таблицы в локальной базе
npm run dev
```

## Публикация на Vercel

### 1. База данных

Создай проект на [neon.tech](https://neon.tech) (бесплатный тариф) и скопируй
**Pooled connection string** — она рассчитана на serverless.

### 2. Код на GitHub

Создай на GitHub **пустой** приватный репозиторий (без README и .gitignore),
затем из папки проекта:

```bash
git init
git add .
git commit -m "РИТМ: первая версия"
git branch -M main
git remote add origin https://github.com/ЛОГИН/ritm-trainer.git
git push -u origin main
```

Вместо пароля GitHub требует Personal Access Token:
`Settings` → `Developer settings` → `Personal access tokens` → `Tokens (classic)`,
права `repo`.

Папки `node_modules`, `.next` и файл `.env` с паролями исключены через `.gitignore`.
Проверить перед отправкой: `git ls-files | grep env` — в выводе должен быть только `.env.example`.

Последующие обновления:

```bash
git add .
git commit -m "что изменил"
git push
```

### 3. Проект на Vercel

На [vercel.com](https://vercel.com): `Add New…` → `Project` → выбрать репозиторий.
Next.js определяется автоматически, настройки сборки менять не нужно.

В разделе `Environment Variables` добавь `DATABASE_URL` и `TELEGRAM_BOT_TOKEN`,
затем нажми `Deploy`.

Если переменные добавлены после первой сборки, запусти пересборку:
`Deployments` → `Redeploy`.

### 4. Таблицы в боевой базе

Один раз локально. Файл `.env` содержит секреты и не хранится в GitHub — поэтому в скачанном проекте будет только `.env.example`. В Windows PowerShell из корня проекта создай локальную копию:

```powershell
Copy-Item .env.example .env
notepad .env
```

В `.env` замени значение `DATABASE_URL` на строку подключения Neon, сохрани файл, затем выполни:

```powershell
npm install
npx drizzle-kit push --config=drizzle.config.prod.ts
```

Конфиг сам прочитает `DATABASE_URL` из `.env`. Не загружай `.env` в GitHub. Локальный `drizzle.config.json` используется только песочницей.

### 5. Адрес в BotFather

`/mybots` → бот → `Bot Settings` → `Menu Button` → `Edit menu button URL` → адрес с Vercel.
Если мини-апп создавался через `/newapp`, поправь URL и там (`/myapps`).

## Как устроена авторизация

Telegram передаёт мини-аппу строку `initData`, подписанную токеном бота.
Клиент шлёт её в заголовке `X-Telegram-Init-Data`, сервер проверяет HMAC-подпись
(`src/lib/server/auth.ts`) и находит или создаёт тренера.

Все таблицы содержат `trainer_id`, и каждый запрос ограничен текущим тренером,
поэтому чужие данные недоступны.

Без `TELEGRAM_BOT_TOKEN` приложение пускает всех под общим «Демо-тренером» —
это удобно для разработки, но на проде токен обязателен.

## Структура

```
src/app/            страницы и API-роуты
src/components/     дашборд, виджеты, таймлайн, мастер создания
src/lib/            бизнес-логика, работа с датами, клиент API
src/lib/server/     авторизация и выборки из базы
src/db/             схема Drizzle и подключение
```
