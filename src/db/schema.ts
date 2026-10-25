import {
  boolean,
  date,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
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
  (t) => [unique("measurements_client_date").on(t.clientId, t.takenOn)],
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
