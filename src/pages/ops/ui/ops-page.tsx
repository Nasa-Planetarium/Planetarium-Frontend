"use client";

import { Suspense } from "react";
import { useCountry } from "@/entities/country";
import { useSession } from "@/entities/session";
import { PAGES } from "@/shared/config";
import { PageFrame } from "@/widgets/page-frame";
import { OpsDet } from "./ops-det";
import { OpsScreen } from "./ops-screen";

/**
 * 경보·출동(ops) — 원천: 목업 pages/ops.js · ops.css.
 * 데이터: AgencyPort(useAgency — listAlerts · listFires · listUnits · dispatchUnit · recallUnit)만. 목(마을·관측 점·통과)은 src/shared/mock/agency/ops-scenario.ts.
 * 역할(조기경보·긴급대응 · 소방 현장지휘)로 로그인하지 않았으면 PageFrame 이 잠긴 화면을 그린다. 역할마다 상세의 주 동작이 다르다.
 * 화면 머리(이름 + 범위 + 개수 띠)는 목업 r8 콘솔 머리라 이 화면이 직접 그린다(PageFrame 머리는 제목뿐).
 * 한국 밖: 감지 묶음 화면(목업 EM.ui.detPage).
 */
export function OpsPage() {
  return (
    <Suspense fallback={<div className="min-h-full" data-slot="page-pending" />}>
      <OpsGate />
    </Suspense>
  );
}

function OpsGate() {
  const { data: session, isPending } = useSession();
  const { iso3, info } = useCountry();
  const ok = !isPending && !!session && (PAGES.ops.roles ?? []).includes(session.role);
  if (!ok) return <PageFrame page="ops" />;
  return (
    <div className="h-full min-h-0 min-w-0" data-page="ops">
      {iso3 === "KOR" ? <OpsScreen role={session.role === "firefighter" ? "firefighter" : "responder"} /> : <OpsDet iso3={iso3} info={info} />}
    </div>
  );
}
