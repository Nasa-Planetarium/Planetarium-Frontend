import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_KR } from "next/font/google";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { AppProviders, AppShell } from "@/app";
import { routing } from "@/shared/i18n/routing";
import { DEVICE_SCRIPT } from "@/shared/lib/device-script";
import "@/app/styles/theme.css";

// 글꼴은 빌드 때 자체 호스팅(next/font). 토큰 --font-body · --font-data 가 이 변수를 앞에 둔다(theme.css)
const plexKr = IBM_Plex_Sans_KR({ weight: ["400", "500", "600", "700"], variable: "--font-plex-kr", display: "swap", preload: false });
const plex = IBM_Plex_Sans({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-plex", display: "swap" });
const plexMono = IBM_Plex_Mono({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const dynamicParams = false;
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: "#0d0b09", colorScheme: "dark", width: "device-width", initialScale: 1, viewportFit: "cover" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: { default: t("shell.app.title"), template: `%s · ${t("shell.app.title")}` } };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning className={`${plexKr.variable} ${plex.variable} ${plexMono.variable}`}>
      <head>
        {/* 기기군 판정 — 첫 그림 전에 html[data-device|data-touch|data-cover] (목업 index.html 첫 스크립트) */}
        <script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT }} />
      </head>
      <body>
        <AppProviders locale={locale} messages={messages}>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
