import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap } from "@/shared/api";

/**
 * 연×월 캘린더(계약 GET /aois/{aoiId}/calendar) — 캘린더·분석 화면이 쓰는 쿼리 공장의 본보기.
 * 키 = [경로, 정규화 파라미터, method_version]. 응답 행의 경우 가르기는 shared/data-cases 의 judgeMonth 로(화면 재계산 금지).
 * 신선도: ok 판은 24시간, 진행 중 달(partial·nrt)이 들어 있으면 5분.
 */
export const calendarQuery = (aoiId: string, years: { start_year?: number; end_year?: number }, methodVersion: string | null) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/calendar`, years, methodVersion),
    queryFn: ({ signal }) =>
      api.GET("/aois/{aoiId}/calendar", { params: { path: { aoiId }, query: years }, signal }).then(unwrap),
    // 계약의 이 경로는 CSV(text/csv)도 내므로 응답 타입이 「문자열 | 객체」다 — JSON 만 본다
    staleTime: (q) => {
      const d = q.state.data;
      const live = typeof d === "object" && d.months.some((m) => m.status === "partial" || m.status === "nrt");
      return live ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;
    },
    enabled: !!methodVersion,
  });

/** 그 달 예년 대비(계약 GET /aois/{aoiId}/months/{yearMonth}/comparison) */
export const comparisonQuery = (aoiId: string, yearMonth: string, methodVersion: string | null) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/months/${yearMonth}/comparison`, undefined, methodVersion),
    queryFn: ({ signal }) =>
      api.GET("/aois/{aoiId}/months/{yearMonth}/comparison", { params: { path: { aoiId, yearMonth } }, signal }).then(unwrap),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!methodVersion,
  });
