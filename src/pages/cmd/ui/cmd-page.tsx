"use client";

import { PageFrame } from "@/widgets/page-frame";

/**
 * 지휘 통계(commander)
 * 원천: 목업 pages/cmd.js · cmd.css
 * 데이터: AgencyPort(목) 만 — getCommandStats
 * 골격 단계: 제목(머리)만 있다. 본문은 화면 담당이 PageFrame children 으로 채운다 — 소유 폴더는 OWNERS.md.
 */
export function CmdPage() {
  return <PageFrame page="cmd" />;
}
