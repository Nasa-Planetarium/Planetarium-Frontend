"use client";

import { PageFrame } from "@/widgets/page-frame";

/**
 * 피해 면적(land)
 * 원천: 목업 pages/land.js · land.css
 * 데이터: AgencyPort(목) 만 — 필지 생성기는 src/shared/mock/agency 로 옮긴다
 * 골격 단계: 제목(머리)만 있다. 본문은 화면 담당이 PageFrame children 으로 채운다 — 소유 폴더는 OWNERS.md.
 */
export function LandPage() {
  return <PageFrame page="land" />;
}
