import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { qk } from "./query-keys";

/**
 * 시야로 받는 지도 자료(표시 규칙서 R2, 2026-11-15). 칸 · 점은 고른 지역 id 가 아니라 지금 시야로 받는다.
 *  - 0.1° 칸: 2.5° 고정 타일(display.tilesOf — 625칸, ±180 안). 캐시 키 = (타일, 달, method_version) — 끌어도 받은 타일은 다시 받지 않는다.
 *  - 감지 점: 0.1° 격자에 맞춘 상자(display.pointBoxes — 날짜 변경선은 둘로). limit 10,000 + 다음 쪽 최대 2번(최대 30,000점, R6).
 * 동시 요청은 6개로 묶는다(타일 25개를 한꺼번에 보내지 않게).
 */
type Box = readonly [number, number, number, number];

const MAX_INFLIGHT = 6;
let inflight = 0;
const waiters: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_INFLIGHT) await new Promise<void>((r) => waiters.push(r));
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
    waiters.shift()?.();
  }
}

export interface TileCellProps {
  cell_id?: string | null;
  cell_lat?: number | null;
  cell_lon?: number | null;
  value?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  raw_modis?: number | null;
  raw_viirs?: number | null;
  status?: string | null;
  value_source?: string | null;
  [k: string]: unknown;
}
export interface TileCells {
  method_version: string | null;
  month_status: string;
  cell_size_deg: number;
  cells: TileCellProps[];
}

/** 그 달 0.1° 칸 한 타일(/cells?bbox&month) */
export const cellsTileQuery = (tile: Box, ym: string, mv: string | null, on = true) =>
  queryOptions({
    queryKey: qk("cells", { bbox: tile.map((v) => v.toFixed(1)).join(","), month: ym }, mv),
    queryFn: ({ signal }) =>
      limited(async (): Promise<TileCells> => {
        const r = (await api.GET("/cells", { params: { query: { bbox: [...tile], month: ym } as never }, signal }).then(unwrap)) as unknown as {
          method_version?: string;
          properties?: { cell_size_deg?: number; month_status?: string; method_version?: string };
          features?: { properties: TileCellProps }[];
        };
        return {
          method_version: r.method_version ?? r.properties?.method_version ?? null,
          month_status: r.properties?.month_status ?? "ok",
          cell_size_deg: r.properties?.cell_size_deg ?? 0.1,
          cells: (r.features ?? []).map((f) => f.properties),
        };
      }),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv && on,
    retry: false,
  });

export interface BoxPoint {
  lat: number;
  lon: number;
  at: string;
  sat: string;
  frp: number | null;
  ref: boolean;
  /** 산업 열원(v1.2 is_static_source) — 칸 합계에서 빠지므로 점 개수에도 넣지 않는다(R6). 지금 운영 응답에는 없음(백엔드 B1) */
  stat: boolean;
}
export interface BoxPoints {
  points: BoxPoint[];
  truncated: boolean;
  total: number | null;
  note: string | null;
}
interface HotspotRow {
  latitude: number;
  longitude: number;
  acq_datetime_utc: string;
  satellite: string;
  frp: number | null;
  is_reference?: boolean;
  is_static_source?: boolean;
}
export const POINT_PAGES = 3;

/** 기간(≤ 92일) 감지 점 한 상자(/hotspots?bbox&start&end) */
export const pointsBoxQuery = (box: Box, start: string, end: string, mv: string | null, on = true) =>
  queryOptions({
    queryKey: qk("hotspots", { bbox: box.map((v) => v.toFixed(1)).join(","), start, end, layer: "all" }, mv),
    queryFn: ({ signal }) =>
      limited(async (): Promise<BoxPoints> => {
        const out: BoxPoints = { points: [], truncated: false, total: null, note: null };
        let cursor: string | undefined;
        for (let i = 0; i < POINT_PAGES; i++) {
          const r = (await api
            .GET("/hotspots", { params: { query: { bbox: [...box], start, end, layer: "all", limit: 10000, ...(cursor ? { cursor } : {}) } as never }, signal })
            .then(unwrap)) as unknown as { hotspots?: HotspotRow[]; next_cursor?: string | null; total?: number; reference_sum?: { note?: string } };
          (r.hotspots ?? []).forEach((p) =>
            out.points.push({ lat: p.latitude, lon: p.longitude, at: p.acq_datetime_utc, sat: p.satellite, frp: p.frp, ref: !!p.is_reference, stat: p.is_static_source === true }),
          );
          out.total = typeof r.total === "number" ? r.total : out.total;
          out.note = r.reference_sum?.note ?? out.note;
          if (!r.next_cursor) break;
          cursor = r.next_cursor;
          if (i === POINT_PAGES - 1) out.truncated = true;
        }
        return out;
      }),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv && on,
    retry: false,
  });
