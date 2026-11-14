"use client";

import { PageFrame } from "@/widgets/page-frame";

/**
 * 경보·출동(responder·firefighter)
 * 원천: 목업 pages/ops.js · ops.css
 * 데이터: AgencyPort(목) 만 — useAgency()
 * 골격 단계: 제목(머리)만 있다. 본문은 화면 담당이 PageFrame children 으로 채운다 — 소유 폴더는 OWNERS.md.
 */
export function OpsPage() {
  return <PageFrame page="ops" />;
}
