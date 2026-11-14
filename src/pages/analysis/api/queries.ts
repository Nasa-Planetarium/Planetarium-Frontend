import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap } from "@/shared/api";
import type { CalendarData, CellProps } from "../model/core";
import { Y0, Y1 } from "../model/core";

/**
 * ② 비교 분석이 읽는 계약 경로(/api/v1). 응답 모양은 실서버가 정본이다(E1) — 계약에 없는 v1.1 열(value_projected·as_of_date·flags…)도
 * 그대로 읽으려고 이 슬라이스의 좁은 타입으로 받는다. 값은 다시 계산하지 않는다(A1).
 * 실서버 차이(2026-11-15 잼): group:gb-north(경북 북부 묶음)가 aoi 목록에 없다(404 unknown_aoi) → 화면은 묶음이 목록에 있을 때만 단추를 그린다.
 */
export interface AoiRec {
  aoi_id: string;
  name_ko: string | null;
  name_en: string | null;
  level: string;
  parent_id: string | null;
  has_data?: boolean;
  first_month?: string | null;
  last_month?: string | null;
  derived?: boolean;
  bbox?: number[] | null;
  synthetic?: boolean;
  hidden?: boolean;
}

/** 지역 목록 전부(실서버는 쪽 나눔 — 커서를 끝까지 따른다, 최대 20쪽) */
export const aoisQuery = (mv: string | null) =>
  queryOptions({
    queryKey: qk("aois", { all: 1 }, mv),
    queryFn: async ({ signal }) => {
      const out: AoiRec[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 20; i++) {
        const r = (await api.GET("/aois", { params: { query: { limit: 1000, ...(cursor ? { cursor } : {}) } }, signal }).then(unwrap)) as unknown as {
          aois: AoiRec[];
          next_cursor?: string | null;
        };
        out.push(...r.aois);
        if (!r.next_cursor) break;
        cursor = r.next_cursor;
      }
      return out;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv,
  });

/** 연×월 캘린더 전 기간(2000–2026) */
export const calendarAllQuery = (aoiId: string, mv: string | null) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/calendar`, { start_year: Y0, end_year: Y1 }, mv),
    queryFn: async ({ signal }): Promise<CalendarData> => {
      const d = (await api
        .GET("/aois/{aoiId}/calendar", { params: { path: { aoiId }, query: { start_year: Y0, end_year: Y1 } }, signal })
        .then(unwrap)) as unknown as CalendarData;
      return { aoi_id: d.aoi_id, method_version: d.method_version, months: d.months };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!mv,
  });

/** 그 달 예년 대비(/compare) — 값·판정·기준 분포 그대로 */
export interface Comparison {
  aoi_id?: string;
  year?: number;
  month?: number;
  value: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  value_source?: string | null;
  status: string;
  verdict?: string | null;
  percentile?: number | null;
  ratio_to_median?: number | null;
  n_baseline_years?: number | null;
  baseline_median?: number | null;
  baseline_p25?: number | null;
  baseline_p75?: number | null;
  method_version?: string;
  baseline?: { year: number; value: number | null; status?: string; used?: boolean }[];
  rule?: { above_if_percentile_ge?: number; below_if_percentile_le?: number; uncertain_if_years_lt?: number; id?: string } | null;
}
export const comparisonQuery = (aoiId: string, ym: string, mv: string | null, on: boolean) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/months/${ym}/comparison`, undefined, mv),
    queryFn: async ({ signal }) =>
      (await api.GET("/aois/{aoiId}/months/{yearMonth}/comparison", { params: { path: { aoiId, yearMonth: ym } }, signal }).then(unwrap)) as unknown as Comparison,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv && on,
    retry: false,
  });

export interface CellsData {
  properties?: { cell_size_deg?: number; month_status?: string };
  features: { geometry?: { type: string; coordinates: number[][][] }; properties: CellProps & { value_source?: string | null } }[];
}
/** 그 달 칸(/cells?aoi_id&month). 목은 503 data_not_loaded */
export const cellsQuery = (aoiId: string, ym: string, mv: string | null, on: boolean) =>
  queryOptions({
    queryKey: qk("cells", { aoi_id: aoiId, month: ym }, mv),
    queryFn: async ({ signal }) =>
      (await api.GET("/cells", { params: { query: { aoi_id: aoiId, month: ym } as never }, signal }).then(unwrap)) as unknown as CellsData,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv && on,
    retry: false,
  });

/** 칸 지도 점 층(목) — 그 달 release 기준 감지 점(GET /hotspots layer=reference, 합계에 드는 점). 목업 analysis.js drawCells pm==="month" */
export interface MonthPt {
  lon: number;
  lat: number;
  t: string;
  frp: number | null;
  sat: string;
}
export const monthPointsQuery = (aoiId: string, ym: string, mv: string | null, on: boolean) =>
  queryOptions({
    queryKey: qk("hotspots", { aoi_id: aoiId, month: ym, layer: "reference" }, mv),
    queryFn: async ({ signal }): Promise<MonthPt[]> => {
      const y = Number(ym.slice(0, 4));
      const m = Number(ym.slice(5, 7));
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const out: MonthPt[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 5; i++) {
        const r = (await api
          .GET("/hotspots", { params: { query: { aoi_id: aoiId, start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}`, layer: "reference", limit: 10000, ...(cursor ? { cursor } : {}) } as never }, signal })
          .then(unwrap)) as unknown as { hotspots?: { latitude: number; longitude: number; acq_datetime_utc: string; frp?: number | null; satellite?: string }[]; next_cursor?: string | null };
        (r.hotspots ?? []).forEach((p) => out.push({ lon: p.longitude, lat: p.latitude, t: p.acq_datetime_utc, frp: p.frp ?? null, sat: p.satellite ?? "" }));
        if (!r.next_cursor) break;
        cursor = r.next_cursor;
      }
      return out;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv && on,
    retry: false,
  });

/** 기간 합계(/aois/{id}/summary?start&end&freq=day) — 일별 칸 합. 목은 503(점·일 자료가 스냅숏에 없음) */
export interface SummaryData {
  aoi_id: string;
  start: string;
  end: string;
  freq: string;
  series: { date: string; value: number | null; status?: string }[];
  /** 기간 합(일별 칸 합 + 월 추정분 포함분) — 실서버 v1.1: residual_included · residual_prorated */
  total?: { value: number | null; residual_included?: number | null; residual_prorated?: boolean | null } | null;
  /** 달마다 월 추정분(MODIS 기간 점으로 안 보이는 몫 · 관측 빠진 날 채움분). 일별 value 에는 섞지 않는다 */
  month_residual?: { year: number; month: number; month_residual: number; residual_prorated?: boolean; included_days?: number; days_in_month?: number; residual_included?: number }[] | null;
}
export const summaryQuery = (aoiId: string, start: string, end: string, mv: string | null, on: boolean) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/summary`, { start, end, freq: "day" }, mv),
    queryFn: async ({ signal }) =>
      (await api
        .GET("/aois/{aoiId}/summary", { params: { path: { aoiId }, query: { start, end, freq: "day" } as never }, signal })
        .then(unwrap)) as unknown as SummaryData,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv && on,
    retry: false,
  });
