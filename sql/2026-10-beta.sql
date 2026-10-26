-- PragmaBox: таблицы беты (отзывы, бонусы, приглашения) и починка уникальности замеров.
-- Выполнить один раз: Neon → SQL Editor → вставить всё целиком → Run.
-- Повторный запуск безопасен: скрипт ничего не удаляет из данных и не создаёт дублей.

-- Отзывы и ответы «сколько готов платить»
CREATE TABLE IF NOT EXISTS "feedback" (
  "id" serial PRIMARY KEY NOT NULL,
  "trainer_id" integer NOT NULL,
  "kind" text DEFAULT 'review' NOT NULL,
  "text" text NOT NULL,
  "source" text DEFAULT 'bot' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "feedback_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id")
    REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action
);

-- Бонусные месяцы Premium после беты
CREATE TABLE IF NOT EXISTS "rewards" (
  "id" serial PRIMARY KEY NOT NULL,
  "trainer_id" integer NOT NULL,
  "kind" text NOT NULL,
  "months" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rewards_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id")
    REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action
);

-- Кто кого пригласил
CREATE TABLE IF NOT EXISTS "referrals" (
  "invitee_id" integer PRIMARY KEY NOT NULL,
  "inviter_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  CONSTRAINT "referrals_invitee_id_trainers_id_fk" FOREIGN KEY ("invitee_id")
    REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "referrals_inviter_id_trainers_id_fk" FOREIGN KEY ("inviter_id")
    REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "feedback_trainer_idx" ON "feedback" USING btree ("trainer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "rewards_trainer_kind" ON "rewards" USING btree ("trainer_id", "kind");
CREATE INDEX IF NOT EXISTS "referrals_inviter_idx" ON "referrals" USING btree ("inviter_id");

-- Замеры: правило «одна запись на клиента в день» теперь держит уникальный индекс,
-- а не ограничение (с ним drizzle-kit при каждом push предлагал очистить таблицу).
-- Сами замеры не меняются.
ALTER TABLE "measurements" DROP CONSTRAINT IF EXISTS "measurements_client_date";
CREATE UNIQUE INDEX IF NOT EXISTS "measurements_client_date" ON "measurements" USING btree ("client_id", "taken_on");

-- Проверка: должно вывести три строки — feedback, referrals, rewards
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('feedback', 'referrals', 'rewards')
ORDER BY table_name;
