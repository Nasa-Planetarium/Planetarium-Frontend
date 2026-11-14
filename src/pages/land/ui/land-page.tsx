"use client";

import { Suspense } from "react";
import { useCountry } from "@/entities/country";
import { useSession } from "@/entities/session";
import { PAGES } from "@/shared/config";
import { PageFrame } from "@/widgets/page-frame";
import { LandDet } from "./land-det";
import { LandScreen } from "./land-screen";

/**
 * 피해 면적(land) — 원천: 목업 pages/land.js · land.css.
 * 데이터: AgencyPort(useAgency — listFires · listParcels)만. 목(필지 생성기)은 src/shared/mock/agency/land-parcels.ts.
 * 역할(토지 관리)로 로그인하지 않았으면 PageFrame 이 잠긴 화면을 그린다.
 * 화면 머리(이름 + 범위 + 개수 띠)는 목업 r8 콘솔 머리라 이 화면이 직접 그린다(PageFrame 머리는 제목뿐).
 * 한국 밖: 감지 묶음 화면(목업 EM.ui.detPage).
 */
export function LandPage() {
  return (
    <Suspense fallback={<div className="min-h-full" data-slot="page-pending" />}>
      <LandGate />
    </Suspense>
  );
}

function LandGate() {
  const { data: session, isPending } = useSession();
  const { iso3, info } = useCountry();
  const ok = !isPending && !!session && (PAGES.land.roles ?? []).includes(session.role);
  if (!ok) return <PageFrame page="land" />;
  return (
    <div className="h-full min-h-0 min-w-0" data-page="land">
      {iso3 === "KOR" ? <LandScreen /> : <LandDet iso3={iso3} info={info} />}
    </div>
  );
}
