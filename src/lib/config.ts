// Глобальные настройки дашборда и справочники. Меняй здесь, а не в компонентах.

export const WORK_START_HOUR = 7;
export const WORK_END_HOUR = 23;
export const PX_PER_HOUR = 100;
// Минимальная высота таймлайна. Обычно он растягивается на всё свободное место экрана,
// а мастер создания открывается в тех же границах, не меняя размер виджета.
export const TIMELINE_HEIGHT = 300;
export const DAILY_GOAL = 3200;
export const SNAP_MINUTES = 15;
export const MIN_GAP_MINUTES = 15;

// Цвет полоски слева на блоке = группа мышц
export const MUSCLE_GROUPS = {
  full: { label: "Фулбади", color: "#8B7CF6" },
  legs: { label: "Ноги", color: "#3B82F6" },
  back: { label: "Спина", color: "#14B8A6" },
  chest: { label: "Грудь", color: "#EC4899" },
  arms: { label: "Руки", color: "#A855F7" },
  shoulders: { label: "Плечи", color: "#F59E0B" },
  core: { label: "Пресс", color: "#F97316" },
  cardio: { label: "Кардио", color: "#06B6D4" },
} as const;

export const KINDS = {
  individual: "Индив",
  group: "Группа",
  trial: "Пробное",
} as const;

export const STATUSES = {
  planned: "Запланирована",
  done: "Проведена",
  cancelled_client: "Отменил клиент",
  cancelled_trainer: "Отменил тренер",
  no_show: "Неявка",
} as const;

export type MuscleKey = keyof typeof MUSCLE_GROUPS;
export type KindKey = keyof typeof KINDS;
export type StatusKey = keyof typeof STATUSES;

const hasKey = (obj: object, key: unknown): boolean =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);

export const isMuscleKey = (v: unknown): v is MuscleKey => hasKey(MUSCLE_GROUPS, v);
export const isKindKey = (v: unknown): v is KindKey => hasKey(KINDS, v);
export const isStatusKey = (v: unknown): v is StatusKey => hasKey(STATUSES, v);
