import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomePage } from "@/pages/home";
import { PageGate } from "@/widgets/page-frame";

// 경로 파일은 얇게: 언어 설정 + 제목 + FSD 화면(src/pages/home)만. 상황판은 예시 로그인 뒤에만 열린다(결정 F12) — 문지기(PageGate)가 잠긴 화면을 대신 그린다
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t("shell.page.home") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PageGate page="home">
      <HomePage />
    </PageGate>
  );
}
