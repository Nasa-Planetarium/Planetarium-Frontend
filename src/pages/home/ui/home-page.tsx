"use client";

import { PageFrame } from "@/widgets/page-frame";

/**
 * 상황판(경북 실시간 시나리오 + 통합 값)
 * 원천: 목업 pages/home.js · home.css
 * 데이터: 통합 값 = 실제 데이터(API) · 시나리오(불·자원·경보) = AgencyPort(목)
 * 골격 단계: 제목(머리)만 있다. 본문은 화면 담당이 PageFrame children 으로 채운다 — 소유 폴더는 OWNERS.md.
 */
export function HomePage() {
  return <PageFrame page="home" />;
}
