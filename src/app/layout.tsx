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
  title: "PragmaBox — рабочий день тренера",
  description: "PragmaBox: расписание, клиенты, финансы и прогресс тренера в одном приложении.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4A5BF0",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" data-theme="fintech" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        <script src="https://telegram.org/js/telegram-web-app.js" async />
        {children}
      </body>
    </html>
  );
}
