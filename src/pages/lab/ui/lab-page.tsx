"use client";

import { PageFrame } from "@/widgets/page-frame";

/**
 * 예측 분석(scientist) — 평년 기반 전망(결정 F8)
 * 원천: 목업 pages/lab.js · lab.css
 * 데이터: 실제 데이터: 전망(outlook) API — 계약 추가 전에는 public/data/snap/outlook.json(있을 때)
 * 골격 단계: 제목(머리)만 있다. 본문은 화면 담당이 PageFrame children 으로 채운다 — 소유 폴더는 OWNERS.md.
 */
export function LabPage() {
  return <PageFrame page="lab" />;
}
