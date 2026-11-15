import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { AppProviders, AppShell } from "@/app";
import { routing } from "@/shared/i18n/routing";
import { DEVICE_SCRIPT } from "@/shared/lib/device-script";
// 글꼴 = Pretendard 한 벌(프런트 UI/UX 2026-11-15) — 가변 · 쓰는 글자 조각만 받는 dynamic subset, npm 패키지로 자체 호스팅(theme.css 토큰)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@/app/styles/theme.css";

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
    <html lang={locale} suppressHydrationWarning>
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
