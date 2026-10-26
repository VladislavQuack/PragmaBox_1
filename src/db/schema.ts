import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Тренер = пользователь Telegram. Все данные принадлежат конкретному тренеру.
export const trainers = pgTable("trainers", {
  id: serial("id").primaryKey(),
  tgId: text("tg_id").notNull().unique(),
  name: text("name").notNull(),
  username: text("username"),
  photoUrl: text("photo_url"),
  // Настраивается в первом запуске. Позже станет основой для Premium / Stars.
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  monthlyGoal: integer("monthly_goal").notNull().default(30000),
  avgSessionPrice: integer("avg_session_price").notNull().default(1500),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  totalSessions: integer("total_sessions").notNull().default(1),
  remainingSessions: integer("remaining_sessions").notNull().default(1),
  price: integer("price").notNull().default(0),
  paid: boolean("paid").notNull().default(false),
  expiresAt: date("expires_at", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

// Замеры клиента. На одну дату — одна запись (повторное сохранение обновляет её).
// Уникальность — индексом, а не UNIQUE-ограничением: составное ограничение drizzle-kit
// читает из базы со столбцами в случайном порядке и пересоздаёт при каждом push,
// да ещё предлагает очистить таблицу. С индексом такого нет.
export const measurements = pgTable(
  "measurements",
  {
    id: serial("id").primaryKey(),
    trainerId: integer("trainer_id")
      .notNull()
      .references(() => trainers.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    takenOn: date("taken_on", { mode: "string" }).notNull(),
    weight: real("weight"),
    bodyFat: real("body_fat"),
    chest: real("chest"),
    waist: real("waist"),
    hips: real("hips"),
    biceps: real("biceps"),
    thigh: real("thigh"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("measurements_client_date").on(t.clientId, t.takenOn)],
);

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  packageId: integer("package_id").references(() => packages.id, { onDelete: "set null" }),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
  durationMin: integer("duration_min").notNull().default(60),
  muscleGroup: text("muscle_group").notNull().default("full"),
  kind: text("kind").notNull().default("individual"),
  status: text("status").notNull().default("planned"),
  price: integer("price").notNull().default(0),
  paid: boolean("paid").notNull().default(false),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

// ───────── Бета-тест: отзывы, бонусы и приглашения ─────────
// Это отдельные таблицы, а не новые поля в trainers. Если код выедет на Vercel
// раньше, чем таблицы созданы в базе, основное приложение продолжит работать —
// недоступны будут только бонусы.

// Всё, что тренер написал: отзывы (боту или в приложении) и ответ «сколько готов платить».
export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    trainerId: integer("trainer_id")
      .notNull()
      .references(() => trainers.id, { onDelete: "cascade" }),
    // review — отзыв, price — ответ про цену
    kind: text("kind").notNull().default("review"),
    text: text("text").notNull(),
    // bot — написал боту, app — в приложении
    source: text("source").notNull().default("bot"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("feedback_trainer_idx").on(t.trainerId)],
);

// Бонусные месяцы Premium после беты. Каждый вид бонуса — один раз на тренера.
export const rewards = pgTable(
  "rewards",
  {
    id: serial("id").primaryKey(),
    trainerId: integer("trainer_id")
      .notNull()
      .references(() => trainers.id, { onDelete: "cascade" }),
    // review — за отзыв, referral — за приглашённого друга
    kind: text("kind").notNull(),
    months: integer("months").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("rewards_trainer_kind").on(t.trainerId, t.kind)],
);

// Кто кого пригласил. Друг засчитывается, когда проходит первую настройку (activated_at).
export const referrals = pgTable(
  "referrals",
  {
    inviteeId: integer("invitee_id")
      .primaryKey()
      .references(() => trainers.id, { onDelete: "cascade" }),
    inviterId: integer("inviter_id")
      .notNull()
      .references(() => trainers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("referrals_inviter_idx").on(t.inviterId)],
);
