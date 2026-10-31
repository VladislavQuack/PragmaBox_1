-- PragmaBox: Premium — пробный период и оплата звёздами Telegram.
-- Выполнить один раз: Neon → SQL Editor → вставить всё целиком → Run.
-- Повторный запуск безопасен: скрипт ничего не удаляет и не создаёт дублей.
-- Лучше выполнить до того, как поставишь BETA = false: без этих таблиц лимит клиентов
-- не включается, пробный период не выдаётся, а оплата недоступна.

-- Срок Premium тренера: пробный период, оплаты и бонусы беты сдвигают active_until
CREATE TABLE IF NOT EXISTS "premium" (
  "trainer_id" integer PRIMARY KEY NOT NULL,
  "active_until" timestamp with time zone,
  "trial_started_at" timestamp with time zone,
  "bonus_months" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "premium_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id")
    REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action
);

-- Счета и оплаты звёздами
CREATE TABLE IF NOT EXISTS "payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "trainer_id" integer,
  "tg_id" text NOT NULL,
  "plan" text NOT NULL,
  "stars" integer NOT NULL,
  "months" integer DEFAULT 0 NOT NULL,
  "days" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "charge_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "paid_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  CONSTRAINT "payments_charge_id_unique" UNIQUE ("charge_id"),
  CONSTRAINT "payments_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id")
    REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "payments_trainer_idx" ON "payments" USING btree ("trainer_id");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" USING btree ("status");

-- Проверка: должно вывести две строки — payments, premium
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('payments', 'premium')
ORDER BY table_name;
