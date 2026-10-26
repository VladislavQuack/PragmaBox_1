// Выгрузка замеров в CSV.
// Встроенный браузер Telegram не скачивает файлы, собранные прямо на странице,
// поэтому файл отдаёт сервер по короткоживущей подписанной ссылке:
// Telegram (метод downloadFile) скачивает её сам, без данных входа приложения.
import crypto from "node:crypto";
import { METRICS } from "@/lib/metrics";
import type { MeasurementDTO } from "@/lib/types";

const TTL_SEC = 10 * 60;

function exportKey(): Buffer {
  const secret = process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.DATABASE_URL || "pragmabox";
  return crypto.createHmac("sha256", "pragmabox-export-v1").update(secret).digest();
}

const sign = (payload: string) => crypto.createHmac("sha256", exportKey()).update(payload).digest("base64url").slice(0, 32);

export function createExportToken(trainerId: number, clientId: number, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + TTL_SEC;
  const payload = `m.${trainerId}.${clientId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readExportToken(token: string, nowMs = Date.now()): { trainerId: number; clientId: number } | null {
  const m = /^m\.(\d{1,10})\.(\d{1,10})\.(\d{10})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  const expected = Buffer.from(sign(`m.${m[1]}.${m[2]}.${m[3]}`));
  const got = Buffer.from(m[4]);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  if (Number(m[3]) * 1000 < nowMs) return null;
  return { trainerId: Number(m[1]), clientId: Number(m[2]) };
}

// Русский Excel ждёт запятую в дробях: «18.5» он превращает в дату «18 мая».
const fmtNumber = (v: number | null) =>
  v === null ? "" : String(Math.round(v * 10) / 10).replace(".", ",");

const fmtDate = (key: string) => {
  const [y, m, d] = key.split("-");
  return d && m && y ? `${d}.${m}.${y}` : key;
};

// Текстовая ячейка: без переносов строк, в кавычках, если внутри «;» или кавычки.
// Ведущие = + - @ экранируем апострофом — иначе Excel примет заметку за формулу.
function textCell(value: string): string {
  let v = value.replace(/\r\n|\r|\n/g, " ").trim();
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return /[;"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function measurementsCsv(rows: MeasurementDTO[]): string {
  const head = ["Дата", ...METRICS.map((m) => `${m.label}, ${m.unit}`), "Заметка"].map(textCell);
  const lines = [...rows]
    .sort((a, b) => a.takenOn.localeCompare(b.takenOn))
    .map((m) => [fmtDate(m.takenOn), ...METRICS.map((d) => fmtNumber(m[d.key])), textCell(m.note ?? "")]);
  // BOM — чтобы Excel сразу открыл файл в UTF-8, а не кракозябрами
  return `\uFEFF${[head, ...lines].map((r) => r.join(";")).join("\r\n")}\r\n`;
}

export function exportFileName(clientName: string): string {
  const safe =
    clientName
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Клиент";
  return `${safe}-замеры.csv`;
}
