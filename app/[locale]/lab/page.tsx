import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LabPage } from "@/pages/lab";

// 경로 파일은 얇게: 언어 설정 + 제목 + FSD 화면(src/pages/lab)만
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t("shell.page.lab") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LabPage />;
}
