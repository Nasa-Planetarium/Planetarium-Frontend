import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap } from "@/shared/api";
import { monthWindow, type EventsParams, type FireEventDetail, type FireEventList } from "../lib/event";

/**
 * 화재 사건(계약 GET /fire-events · /fire-events/{eventId}, F15 — release fire_events.parquet, 한국·아르헨티나).
 * 키 = qk(경로, 정규화 파라미터, method_version). 범위 밖은 오류가 아니라 200 + coverage.available=false(화면은 「이 지역 자료 없음」).
 * bbox 는 「서,남,동,북」 한 값(쉼표)으로 보낸다(계약 style form · explode false).
 */
const STALE = 60 * 60 * 1000; // 계약 캐시: s-maxage=3600 + ETag(판이 바뀌면 키가 바뀜)

export const fireEventsQuery = (p: EventsParams, methodVersion: string | null) =>
  queryOptions({
    queryKey: qk("fire-events", { ...p, bbox: p.bbox ? [...p.bbox] : undefined }, methodVersion),
    queryFn: ({ signal }) =>
      api
        .GET("/fire-events", {
          params: { query: { ...p, bbox: p.bbox ? [...p.bbox] : undefined } },
          querySerializer: { array: { style: "form", explode: false } },
          signal,
        })
        .then(unwrap) as Promise<FireEventList>,
    staleTime: STALE,
    retry: false,
    enabled: !!methodVersion && (!!p.aoi_id || !!p.bbox),
  });

export const fireEventQuery = (eventId: string | null, methodVersion: string | null) =>
  queryOptions({
    queryKey: qk(`fire-events/${eventId ?? ""}`, undefined, methodVersion),
    queryFn: ({ signal }) => api.GET("/fire-events/{eventId}", { params: { path: { eventId: eventId ?? "" } }, signal }).then(unwrap) as Promise<FireEventDetail>,
    staleTime: STALE,
    retry: false,
    enabled: !!methodVersion && !!eventId,
  });

/**
 * 고른 달의 사건(그 달과 기간이 겹치는 사건 — 모델팀 겹침 규칙). 수는 응답 total(서버가 못 세면 null).
 * minDet 3 = 모델팀 권장 목록 필터(한국 사건의 79.6% 가 감지 1개).
 */
export const monthEventsQuery = (aoiId: string | null, year: number, month: number, minDet: number, methodVersion: string | null, limit = 3) =>
  fireEventsQuery({ aoi_id: aoiId ?? undefined, ...monthWindow(year, month), min_det: minDet, sort: "sum_weight", limit }, methodVersion);
