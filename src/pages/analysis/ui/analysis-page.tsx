"use client";

import { PageFrame } from "@/widgets/page-frame";

/**
 * ② 비교 분석 3단계(S1 범위 → S2 캘린더·비교 → S3 근거·보고)
 * 원천: 목업 pages/analysis.js · analysis.css
 * 데이터: 실제 데이터: calendarQuery · comparisonQuery · judgeMonth
 * 골격 단계: 제목(머리)만 있다. 본문은 화면 담당이 PageFrame children 으로 채운다 — 소유 폴더는 OWNERS.md.
 */
export function AnalysisPage() {
  return <PageFrame page="analysis" />;
}
