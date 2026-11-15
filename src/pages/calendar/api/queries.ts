import { queryOptions } from "@tanstack/react-query";
import { worldGridQuery, type LatBand, type WorldMeta } from "@/entities/world-grid";
import { api, ApiError, listAllAois, qk, unwrap } from "@/shared/api";
import type { CalendarData, CellProps, MonthRow } from "../model/calendar";
import { Y0, Y1 } from "../model/calendar";

/**
 * 캘린더 화면이 읽는 계약 경로(/api/v1). 응답 모양은 실서버가 정본이다(E1) — 계약에 없는 v1.1 열(value_projected·as_of_date·flags…)도
 * 그대로 읽으려고 응답을 이 슬라이스의 좁은 타입으로 받는다. 값은 다시 계산하지 않는다.
 * 정적 파일(전 세계 1° 재생 public/data/snap/world-1deg)은 계약 API 가 아니라 정적 경로로 읽는다(목·실서버 같음).
 */
export interface AoiRec {
  aoi_id: string;
  name_ko: string | null;
  name_en: string | null;
  level: string;
  parent_id: string | null;
  bbox?: number[] | null;
  hidden?: boolean;
  synthetic?: boolean;
}

/** 지역 목록 전부(실서버는 쪽 나눔 — 커서를 끝까지 따른다, 최대 20쪽). WORLD 가 없으면(목) 앞에 하나 */
export const aoisQuery = (mv: string | null) =>
  queryOptions({
    queryKey: qk("aois", { all: 1 }, mv),
    queryFn: async ({ signal }) => {
      const out = await listAllAois<AoiRec>(signal);
      if (!out.some((a) => a.aoi_id === "WORLD")) out.unshift({ aoi_id: "WORLD", level: "world", name_ko: null, name_en: null, parent_id: null, synthetic: true });
      return out;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv,
  });

/** WORLD 캘린더 대체판: 셸 API 에 WORLD 가 없으면(목) world-1deg/meta.json world_aoi(v ×10 · vs · ds · st) 를 같은 모양으로 */
async function worldCalendar(signal?: AbortSignal): Promise<CalendarData> {
  const meta = (await fetch("/data/snap/world-1deg/meta.json", { signal }).then((r) => r.json())) as WorldMeta;
  const wa = meta.world_aoi;
  const C = meta.codes;
  const months: MonthRow[] = [];
  for (let y = Y0; y <= Y1; y++)
    for (let m = 1; m <= 12; m++) {
      const i = (y - 2000) * 12 + m - 11;
      const ok = i >= 0 && i < meta.months.n;
      const v = ok ? wa.v[i] : null;
      months.push(
        ok
          ? {
              year: y,
              month: m,
              value: v == null ? null : v / 10,
              value_lo: null,
              value_hi: null,
              raw_modis: null,
              raw_viirs: null,
              value_source: C.vs[wa.vs[i] ?? -1] ?? null,
              data_source: C.ds[wa.ds[i] ?? -1] ?? null,
              status: C.st[wa.st[i] ?? -1] ?? "out_of_range",
              value_projected: wa.vp?.[i] == null ? null : (wa.vp[i] as number) / 10,
              as_of_date: C.st[wa.st[i] ?? -1] === "partial" ? meta.as_of_date ?? null : null,
            }
          : { year: y, month: m, value: null, status: "out_of_range" },
      );
    }
  return { aoi_id: "WORLD", method_version: meta.method_version, months, local: true };
}

/** 연×월 캘린더 전 기간(2000–2026). WORLD 가 404·503 이면 정적 대체판 */
export const calendarAllQuery = (aoiId: string, mv: string | null) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/calendar`, { start_year: Y0, end_year: Y1 }, mv),
    queryFn: async ({ signal }): Promise<CalendarData> => {
      try {
        const d = (await api
          .GET("/aois/{aoiId}/calendar", { params: { path: { aoiId }, query: { start_year: Y0, end_year: Y1 } }, signal })
          .then(unwrap)) as unknown as CalendarData;
        return { aoi_id: d.aoi_id, method_version: d.method_version, months: d.months };
      } catch (e) {
        if (aoiId === "WORLD" && e instanceof ApiError && (e.status === 404 || e.status === 503)) return worldCalendar(signal);
        throw e;
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!mv,
  });

export interface ComparisonData {
  verdict?: string | null;
  low_sample?: boolean | null;
  n_baseline_years?: number | null;
  baseline_median?: number | null;
  baseline_p25?: number | null;
  baseline_p75?: number | null;
  baseline?: { year: number; value: number | null; status?: string; used?: boolean }[];
  /** v1.2 선택 필드(옛 응답엔 없음): 이 지역 비교 기준 기간 · 연속성 점검 비율 · 비율 출처(own | parent:<id>) */
  baseline_period?: string | null;
  continuity_ratio?: number | null;
  continuity_source?: string | null;
}
export const comparisonQuery = (aoiId: string, ym: string, mv: string | null, on: boolean) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/months/${ym}/comparison`, undefined, mv),
    queryFn: async ({ signal }) =>
      (await api.GET("/aois/{aoiId}/months/{yearMonth}/comparison", { params: { path: { aoiId, yearMonth: ym } }, signal }).then(unwrap)) as unknown as ComparisonData,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv && on,
    retry: false,
  });

export interface CellsData {
  properties?: { cell_size_deg?: number; month_status?: string };
  features: { properties: CellProps }[];
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

/** 지역 경계(/aois/{id}/boundary) → 윤곽 고리. 목은 503 */
export const boundaryApiQuery = (aoiId: string, mv: string | null, on: boolean) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/boundary`, undefined, mv),
    queryFn: async ({ signal }) => {
      const f = (await api.GET("/aois/{aoiId}/boundary", { params: { path: { aoiId } }, signal }).then(unwrap)) as unknown as {
        geometry?: { type: string; coordinates: number[][][] | number[][][][] };
      };
      const g = f.geometry;
      if (!g) return [] as number[][][];
      const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as number[][][][];
      return polys.map((p) => p[0] ?? []);
    },
    staleTime: Infinity,
    enabled: !!mv && on,
    retry: false,
  });

/** 점 한 달 → 재생용 열. t = 그 달 1일 00:00 KST 부터의 분. 실서버 limit 상한 10,000 → 커서로 이어 받는다(최대 12쪽) */
export interface MonthPoints {
  id: string;
  ym: string;
  d0: string;
  d1: string;
  t0: number;
  n: number;
  la: number[];
  lo: number[];
  t: number[];
  frp: number[];
  ref: number[];
  sat: string[];
  note: string | null;
  truncated: boolean;
}
interface HotspotRow {
  latitude: number;
  longitude: number;
  acq_datetime_utc: string;
  satellite: string;
  frp: number | null;
  is_reference: boolean;
}
export const hotspotsMonthQuery = (aoiId: string, ym: string, caseId: string | null, mv: string | null, on: boolean) =>
  queryOptions({
    queryKey: qk("hotspots", { aoi_id: aoiId, month: ym, layer: "all" }, mv),
    queryFn: async ({ signal }): Promise<MonthPoints> => {
      const y = Number(ym.slice(0, 4));
      const m = Number(ym.slice(5, 7));
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const d0 = `${ym}-01`;
      const d1 = `${ym}-${String(last).padStart(2, "0")}`;
      const t0 = Date.parse(`${d0}T00:00:00Z`) - 9 * 3600e3;
      const k: MonthPoints = { id: caseId ?? `kr-${ym}`, ym, d0, d1, t0, n: 0, la: [], lo: [], t: [], frp: [], ref: [], sat: [], note: null, truncated: false };
      let cursor: string | undefined;
      for (let i = 0; i < 12; i++) {
        const r = (await api
          .GET("/hotspots", { params: { query: { aoi_id: aoiId, start: d0, end: d1, layer: "all", limit: 10000, ...(cursor ? { cursor } : {}) } }, signal })
          .then(unwrap)) as unknown as { hotspots?: HotspotRow[]; next_cursor?: string | null; truncated?: boolean; reference_sum?: { note?: string } };
        (r.hotspots ?? []).forEach((p) => {
          k.la.push(p.latitude);
          k.lo.push(p.longitude);
          k.t.push(Math.round((Date.parse(p.acq_datetime_utc) - t0) / 60000));
          k.frp.push(p.frp == null ? -1 : p.frp);
          k.ref.push(p.is_reference ? 1 : 0);
          k.sat.push(p.satellite);
        });
        k.note = r.reference_sum?.note ?? k.note;
        if (!r.next_cursor) break;
        cursor = r.next_cursor;
        if (i === 11) k.truncated = true;
      }
      k.n = k.la.length;
      return k;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv && on,
    retry: false,
  });

/** 전 세계 1° 재생 자료(정적 world-1deg) — entities/world-grid 가 정본(칸 지도 1° 묶음과 같은 캐시) */
export { worldGridQuery };
export type { LatBand, WorldMeta };

/** 나라 단위 값(재생 지도에서 나라를 눌렀을 때) = 그 나라 AOI 캘린더 행 */
export type { MonthRow };
