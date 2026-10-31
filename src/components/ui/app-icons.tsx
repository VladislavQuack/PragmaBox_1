import Image, { type StaticImageData } from "next/image";

import clientsGray from "./Icons/Clients_Gray.svg";
import clientsPurple from "./Icons/Clients_Purple.svg";
import daySummary from "./Icons/Day_Summary.svg";
import financesGray from "./Icons/Finances_Gray.svg";
import financesPurple from "./Icons/Finances_Purple.svg";
import financesWidget from "./Icons/Finances_Widget.svg";
import mainGray from "./Icons/Main_Gray.svg";
import mainPurple from "./Icons/Main_Purple.svg";
import nextWindow from "./Icons/Next_Window.svg";
import notes from "./Icons/Notes_new.svg";
import settingsGray from "./Icons/Setting_Gray.svg";
import settingsPurple from "./Icons/Settings_Purple.svg";
import week from "./Icons/Week.svg";

// Иконки приложения из SVG-файлов в ./Icons. Чтобы поменять иконку,
// достаточно заменить файл с тем же именем.

export type IconPair = { gray: StaticImageData; purple: StaticImageData };

// Нижняя панель: серая версия — раздел не открыт, фиолетовая — открыт.
export const NAV_ICONS: Record<"finance" | "day" | "clients" | "profile", IconPair> = {
  finance: { gray: financesGray, purple: financesPurple },
  day: { gray: mainGray, purple: mainPurple },
  clients: { gray: clientsGray, purple: clientsPurple },
  profile: { gray: settingsGray, purple: settingsPurple },
};

// Белые глифы для цветных плашек виджетов на дашборде.
export const WIDGET_ICONS: Record<"finance" | "nextWindow" | "reminders" | "daySummary" | "week", StaticImageData> = {
  finance: financesWidget,
  nextWindow,
  reminders: notes,
  daySummary,
  week,
};

// Иконка-картинка. alt пустой: рядом с иконками всегда есть подпись.
// pointer-events-none — тап уходит в кнопку, а долгое нажатие в Telegram
// не открывает системное меню «Сохранить изображение».
export function SvgIcon({ src, className = "" }: { src: StaticImageData; className?: string }) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      unoptimized
      loading="eager"
      draggable={false}
      className={`pointer-events-none select-none object-contain ${className}`}
    />
  );
}

// Обе версии лежат друг на друге, при переключении меняется только прозрачность:
// без мигания на загрузку второй картинки и с мягким переходом.
export function ToggleIcon({
  icons,
  active,
  className = "",
}: {
  icons: IconPair;
  active: boolean;
  className?: string;
}) {
  return (
    <span className={`relative block shrink-0 ${className}`} aria-hidden>
      <SvgIcon
        src={icons.gray}
        className={`absolute inset-0 h-full w-full transition-opacity duration-200 ${active ? "opacity-0" : "opacity-100"}`}
      />
      <SvgIcon
        src={icons.purple}
        className={`absolute inset-0 h-full w-full transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}
      />
    </span>
  );
}
