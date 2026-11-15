import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap, type components } from "@/shared/api";

export type FwiResponse = components["schemas"]["FwiResponse"];
export type FwiDay = components["schemas"]["FwiDay"];

/**
 * 산불 기상 위험도 FWI(계약 GET /aois/{aoiId}/fwi, release fwi_aoi_day). 한국(KR·시도·시군구)·아르헨티나(ADM0_ARG·1급)만 자료가 있다.
 * date 를 주지 않으면 그 AOI 의 마지막 날(as_of_date — 오늘보다 약 4일 늦음). 범위 밖 AOI 는 200 + coverage.available=false.
 * 신선도: 자료가 하루 한 번 바뀌므로 1시간.
 */
export const fwiQuery = (aoiId: string | null, methodVersion: string | null) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId ?? "-"}/fwi`, undefined, methodVersion),
    queryFn: ({ signal }) => api.GET("/aois/{aoiId}/fwi", { params: { path: { aoiId: aoiId! } }, signal }).then(unwrap) as Promise<FwiResponse | string>,
    select: (d): FwiResponse | null => (typeof d === "object" ? d : null),
    staleTime: 60 * 60 * 1000,
    enabled: !!aoiId && !!methodVersion,
  });
