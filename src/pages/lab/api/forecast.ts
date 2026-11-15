import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import { queryOf, regionKeyOf, type FcRegion, type Forecast } from "../model/forecast";

/**
 * FireOutlook Planner 30일 전망(F17) — 계약 POST /api/v1/forecast (contract/openapi.yaml postForecast).
 * 읽기 전용 계산(멱등)이라 Query 로 받는다. 값은 응답 그대로. 오류(400·404·413·503)는 다시 묻지 않는다.
 */
export const forecastQuery = (r: FcRegion | null) =>
  queryOptions({
    queryKey: ["forecast", "30d", r ? regionKeyOf(r) : ""] as const,
    queryFn: ({ signal }) => api.POST("/forecast", { body: queryOf(r!), signal }).then(unwrap) as Promise<Forecast>,
    enabled: !!r,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
