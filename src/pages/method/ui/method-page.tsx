"use client";

import { PageFrame } from "@/widgets/page-frame";

/**
 * ③ 방법·검증(통합 방식·검증 수치·자료 상태 카드)
 * 원천: 목업 #method (CALENDAR-PIVOT §7)
 * 데이터: 실제 데이터: entities/release methodQuery · data-cases CASE_CODE·caseCardKeys
 * 골격 단계: 제목(머리)만 있다. 본문은 화면 담당이 PageFrame children 으로 채운다 — 소유 폴더는 OWNERS.md.
 */
export function MethodPage() {
  return <PageFrame page="method" />;
}
