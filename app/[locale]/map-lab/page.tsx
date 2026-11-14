import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapLabPage } from "@/pages/map-lab";

// 공통 지도 시험대(메뉴에 없음 · 검색 제외). 화면들이 공통 지도로 옮겨 가면 지운다(작업 단위 W1 → W5–W11)
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t("maplab.title"), robots: { index: false, follow: false } };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MapLabPage />;
}
