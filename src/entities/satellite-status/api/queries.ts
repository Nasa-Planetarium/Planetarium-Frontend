import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap, type components } from "@/shared/api";

type S = components["schemas"];
export type SatelliteStatus = S["SatelliteStatus"];
export type SatelliteDay = S["SatelliteDayStatus"];
export type SatelliteMonth = S["SatelliteMonthStatus"];

const DAY = 24 * 60 * 60 * 1000;

/**
 * 위성 × UTC 날 자료 상태(계약 GET /satellite-status?freq=day&start&end — release satellite_day_status, 기간 ≤ 366일).
 * 날짜 기준은 UTC(date_utc) — 감지량의 현지 날짜와 다르다.
 */
export const satDaysQuery = (start: string, end: string, mv: string | null, on = true) =>
  queryOptions({
    queryKey: qk("satellite-status", { start, end, freq: "day" }, mv),
    queryFn: async ({ signal }) =>
      (await api.GET("/satellite-status", { params: { query: { start, end, freq: "day" } }, signal }).then(unwrap)) as unknown as SatelliteStatus,
    staleTime: (q) => (q.state.data?.days.some((d) => d.status === "partial") ? 5 * 60 * 1000 : DAY),
    enabled: !!mv && on,
    retry: false,
  });

/** 위성 × 달 요약(계약 GET /satellite-status?freq=month — release satellite_month_status 934행 전부) */
export const satMonthsQuery = (mv: string | null, on = true) =>
  queryOptions({
    queryKey: qk("satellite-status", { freq: "month" }, mv),
    queryFn: async ({ signal }) =>
      (await api.GET("/satellite-status", { params: { query: { freq: "month" } }, signal }).then(unwrap)) as unknown as SatelliteStatus,
    staleTime: DAY,
    enabled: !!mv && on,
    retry: false,
  });
