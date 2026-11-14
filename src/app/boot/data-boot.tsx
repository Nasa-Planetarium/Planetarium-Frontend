"use client";

import { useEffect } from "react";
import { API_BASE, DATA_MODE } from "@/shared/config";
import { openDataGate } from "@/shared/api";

/** 데이터 모드별 시작 처리 표(교체 = NEXT_PUBLIC_DATA_MODE 한 줄) */
const BOOT: Record<typeof DATA_MODE, () => Promise<void>> = {
  // 브라우저 MSW 가 release 스냅숏으로 계약 API 를 응답(정적 내보내기에서도 같은 출처 워커로 동작)
  msw: async () => {
    const { startMsw } = await import("@/shared/msw");
    await startMsw(API_BASE);
  },
  // 실제 백엔드: 할 일 없음
  http: async () => {},
};

/** 실제 데이터 요청 문을 연다(ready.ts). 화면은 막지 않는다 — 요청만 워커가 뜰 때까지 기다린다 */
export function DataBoot() {
  useEffect(() => {
    BOOT[DATA_MODE]()
      .catch((e: unknown) => console.error("[data-boot]", e))
      .finally(openDataGate);
  }, []);
  return null;
}
