// Цвет блока тренировки = смысл, а не группа мышц.
// синий — запланирована · зелёный — проведена · жёлтый — ждёт оплаты · красный — долг · серый — отмена
import type { SessionDTO } from "@/lib/types";

export interface BlockStyle {
  bg: string;
  fg: string;
  solid: string;
}

const BLUE: BlockStyle = {
  bg: "radial-gradient(141% 141% at 0% 100%, #4A5BF0 0%, #5262F7 43%, #9BA5FF 100%)",
  fg: "#ffffff",
  solid: "#4A5BF0",
};
const GREEN: BlockStyle = {
  bg: "linear-gradient(135deg, #4ddc98 0%, #14a45f 100%)",
  fg: "#ffffff",
  solid: "#1DB871",
};
const AMBER: BlockStyle = {
  bg: "linear-gradient(135deg, #ffc864 0%, #ff8f00 100%)",
  fg: "#ffffff",
  solid: "#FF9F0A",
};
const RED: BlockStyle = {
  bg: "linear-gradient(135deg, #ff7f8a 0%, #e6323f 100%)",
  fg: "#ffffff",
  solid: "#F04452",
};
const GRAY: BlockStyle = {
  bg: "linear-gradient(135deg, #f4f6fb 0%, #e1e6f1 100%)",
  fg: "#8c99b4",
  solid: "#C4CCDD",
};

export function blockStyle(s: SessionDTO): BlockStyle {
  if (s.status.startsWith("cancelled")) return GRAY;
  if (s.status === "no_show") return RED;
  // Бесплатное занятие (цена 0) считаем «закрытым»: денег с него не ждём
  const settled = s.paid || s.price <= 0;
  if (s.status === "done") return settled ? GREEN : RED;
  return settled ? BLUE : AMBER;
}

export const LEGEND: { label: string; color: string }[] = [
  { label: "План", color: BLUE.solid },
  { label: "Проведено", color: GREEN.solid },
  { label: "Ждёт оплаты", color: AMBER.solid },
  { label: "Долг", color: RED.solid },
];
