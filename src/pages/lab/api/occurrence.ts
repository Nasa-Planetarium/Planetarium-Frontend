import { queryOptions } from "@tanstack/react-query";
import { api, unwrap, type components } from "@/shared/api";

/**
 * 다음 달 발생 확률(F15) — 계약 /api/v1 (contract/openapi.yaml tags: outlook). 값은 서버(모델 release) 그대로.
 * 판(data_release)이 바뀌면 서버 ETag 가 바뀐다 — 화면 안에서는 한 번 받으면 다시 받지 않는다.
 */
type S = components["schemas"];
export type GridOccurrence = S["GridOccurrence"];
export type GridCell = S["GridOccurrenceCell"];
export type AoiOccurrence = S["AoiOccurrence"];
export type AoiOccurrenceList = S["AoiOccurrenceList"];
export type GridSummary = S["GridSummary"];

const HOUR = 60 * 60 * 1000;

/** 전 세계 0.5° 격자 — 지도 그리기 7필드만(fields=map, 계약 잰 값 gzip 0.47 MB) */
export const gridOccurrenceQuery = () =>
  queryOptions({
    queryKey: ["occurrence", "grid", "map"] as const,
    queryFn: ({ signal }) => api.GET("/occurrence/grid", { params: { query: { fields: "map" } }, signal }).then(unwrap) as Promise<GridOccurrence>,
    staleTime: HOUR,
    gcTime: HOUR,
  });

/** 한국 시군구 목록(parent_id = KR · SIDO_*) */
export const aoiOccurrenceListQuery = (parentId: string) =>
  queryOptions({
    queryKey: ["occurrence", "aois", parentId] as const,
    queryFn: ({ signal }) => api.GET("/occurrence/aois", { params: { query: { parent_id: parentId } }, signal }).then(unwrap) as Promise<AoiOccurrenceList>,
    staleTime: HOUR,
  });

/** 한 지역 — 시군구 = 모델 값, 그 밖 = 격자 요약(지역 확률 아님) */
export const aoiOccurrenceQuery = (aoiId: string) =>
  queryOptions({
    queryKey: ["occurrence", "aoi", aoiId] as const,
    queryFn: ({ signal }) => api.GET("/aois/{aoiId}/occurrence", { params: { path: { aoiId } }, signal }).then(unwrap) as Promise<AoiOccurrence>,
    staleTime: HOUR,
  });
