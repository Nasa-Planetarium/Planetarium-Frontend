import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap } from "@/shared/api";

/**
 * 상황판 전용 실제 데이터 쿼리(계약 /aois/{id}/summary · /hotspots). 키 규칙 = qk(경로, 파라미터, method_version).
 * 캘린더·예년 비교는 entities/month-value 의 calendarQuery·comparisonQuery 를 그대로 쓴다.
 * MSW(스냅숏) 모드에서 이 두 경로는 계약대로 503 data_not_loaded — 화면은 그 code 로 「자료 준비 중」을 그린다(ERROR_HANDLING banner).
 */

/** 일별 합(계약 GET /aois/{id}/summary?freq=day) — 실서버 v1.1 은 200(basis cell_day, E1 실서버 정본) */
export const summaryDayQuery = (aoiId: string, start: string, end: string, methodVersion: string | null) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/summary`, { start, end, freq: "day" }, methodVersion),
    queryFn: ({ signal }) =>
      api.GET("/aois/{aoiId}/summary", { params: { path: { aoiId }, query: { start, end, freq: "day" } }, signal }).then(unwrap),
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: !!methodVersion,
  });

/** 점(계약 GET /hotspots) — 지도 기간·지도 범위. bbox 는 「서,남,동,북」 한 값(쉼표)으로 보낸다(실서버 모양) */
export const hotspotsQuery = (bbox: readonly [number, number, number, number], start: string, end: string, methodVersion: string | null) =>
  queryOptions({
    queryKey: qk("hotspots", { bbox, start, end, limit: 5000 }, methodVersion),
    queryFn: ({ signal }) =>
      api
        .GET("/hotspots", {
          params: { query: { bbox: [...bbox], start, end, limit: 5000 } },
          querySerializer: { array: { style: "form", explode: false } },
          signal,
        })
        .then(unwrap),
    staleTime: 10 * 60 * 1000,
    retry: false,
    enabled: !!methodVersion,
  });

/** 전망(결정 F8) — 정적 파일 public/data/snap/outlook.json(계약 API 아님, 예측 분석 화면과 같은 파일) */
export const outlookQuery = () =>
  queryOptions({
    queryKey: ["snap", "outlook"] as const,
    queryFn: async () => {
      const r = await fetch("/data/snap/outlook.json");
      if (!r.ok) throw new Error(`outlook.json ${r.status}`);
      return (await r.json()) as { method?: { targets?: string[] }; aoi?: { id: string; p?: (number | null)[] }[] };
    },
    staleTime: Infinity,
  });
