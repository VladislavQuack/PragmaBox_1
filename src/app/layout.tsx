import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Trainer Timeline",
  description: "Дашборд тренера: таймлайн дня, доход, абонементы и напоминания.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fff1e8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Тема Коралл фиксирована
    <html lang="ru" data-theme="coral" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {/* Telegram Mini App SDK: без него приложение работает и в браузере */}
        <script src="https://telegram.org/js/telegram-web-app.js" async />
        {children}
      </body>
    </html>
  );
}
