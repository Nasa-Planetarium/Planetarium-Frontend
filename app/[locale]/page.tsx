import { setRequestLocale } from "next-intl/server";
import { RedirectToDefault } from "./redirect-to-default";

/** /<언어>/ → /<언어>/calendar/ (로그인 전 기본 화면 = 캘린더, 결정 F3). 정적 내보내기라 브라우저에서 옮긴다 */
export default async function LocaleIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RedirectToDefault locale={locale} />;
}
