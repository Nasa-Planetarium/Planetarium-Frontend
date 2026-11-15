import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap, type components } from "@/shared/api";

export type SpreadNowcast = components["schemas"]["SpreadNowcast"];
export type SpreadCell = components["schemas"]["SpreadCell"];

/**
 * 내일 확산 가능성 nowcast(계약 GET /spread-nowcast, release spread_nowcast_latest — 0.025° 후보 칸, 한국 상자·아르헨티나).
 * aoi_id 로 부른다(칸 중심이 그 AOI 경계 안). 범위 밖 AOI 는 200 + cells [] + coverage.available=false(「이 지역 자료 없음」),
 * 범위 안인데 칸이 없으면 cells [] + available=true(「오늘 감지 없음」) — 둘을 섞지 않는다.
 * 신선도: 모델이 하루 한 번 돌므로 1시간.
 */
export const spreadNowcastQuery = (aoiId: string | null, methodVersion: string | null) =>
  queryOptions({
    queryKey: qk("spread-nowcast", { aoi_id: aoiId }, methodVersion),
    queryFn: ({ signal }) => api.GET("/spread-nowcast", { params: { query: { aoi_id: aoiId! } }, signal }).then(unwrap) as Promise<SpreadNowcast | string>,
    select: (d): SpreadNowcast | null => (typeof d === "object" ? d : null),
    staleTime: 60 * 60 * 1000,
    enabled: !!aoiId && !!methodVersion,
  });
