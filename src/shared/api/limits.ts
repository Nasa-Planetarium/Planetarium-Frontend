/**
 * 서버가 400 range_too_large 로 거절할 범위를 요청 전에 가린다 — 브라우저 콘솔에 「Failed to load resource: 400」을 남기지 않으려고(2026-11-15 운영 66화면 측정).
 * 판정 재료는 /aois 목록 행(n_cells · bbox · level). 행이 없거나 값이 비면 「모름」 = 거절 아님으로 두고 요청한다 —
 * 그때 400 이 오면 화면은 전처럼 오류 코드를 보고 다른 길(1° 묶음 · 점 끔)로 간다(안전망은 그대로).
 *
 *  - /cells: 계약(openapi.yaml listCells) 「칸 수 > 10,000 이거나 level world·continent 면 400 range_too_large(40103)」.
 *    실서버 detail(2026-11-15): "aoi ADM0_USA has more than 10000 cells; choose a smaller area".
 *  - /hotspots(aoi_id): 실서버 detail(2026-11-15, 40101): "점은 … 영역 100 제곱도 이하만 냅니다(요청 661.42 제곱도)" —
 *    ADM0_JPN 의 /aois bbox 넓이 (153.986−122.939)×(45.516−24.212) = 661.43 과 같다(서버도 aoi bbox 로 잰다).
 */
export const CELLS_MAX = 10_000;
export const HOTSPOT_MAX_AREA = 100;

export interface RangeAoi {
  level?: string | null;
  n_cells?: number | null;
  bbox?: readonly number[] | null;
}

/** 상자 넓이(제곱도). 상자가 없으면 null(모름) */
export const bboxSqDeg = (b: readonly number[] | null | undefined): number | null =>
  b && b.length === 4 ? ((b[2] as number) - (b[0] as number)) * ((b[3] as number) - (b[1] as number)) : null;

/** /cells?aoi_id 가 range_too_large 일 지역인가(모르면 false) */
export function cellsTooMany(a: RangeAoi | null | undefined): boolean {
  if (!a) return false;
  if (a.level === "world" || a.level === "continent") return true;
  return typeof a.n_cells === "number" && a.n_cells > CELLS_MAX;
}

/** /hotspots?aoi_id 가 range_too_large 일 지역인가(모르면 false) */
export function hotspotsTooWide(a: RangeAoi | null | undefined): boolean {
  const s = bboxSqDeg(a?.bbox);
  return s != null && s > HOTSPOT_MAX_AREA;
}
