import { queryOptions } from "@tanstack/react-query";
import { api, heavyRetry, heavyRetryDelay, qk, unwrap } from "@/shared/api";

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
    retry: heavyRetry,
    retryDelay: heavyRetryDelay,
    enabled: !!methodVersion,
  });

/** 기간이 걸친 달 [연, 월] 목록(오래된 것부터, 최근 24달까지) — 넓은 범위 지도의 1° 칸 합 */
export function monthsOf(start: string, end: string): [number, number][] {
  const out: [number, number][] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  if (![y, m, ey, em].every(Number.isFinite)) return out;
  while (y < ey || (y === ey && m <= em)) {
    out.push([y, m]);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.slice(-24);
}

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
