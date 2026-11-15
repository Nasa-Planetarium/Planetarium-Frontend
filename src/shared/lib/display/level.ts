/**
 * 표현 단계(표시 규칙서 R1·R2·R13, 2026-11-15) — 순수 함수.
 * 단계는 나라가 아니라 「지금 보이는 시야 상자 넓이(제곱도)」 하나로 고른다. 모든 지도 화면이 같은 값을 쓴다.
 *   L1 넓게  A > 100        → 1° 칸 원
 *   L2 지역  4 < A ≤ 100    → 0.1° 칸 원(2.5° 고정 타일로 받는다)
 *   L3 가까이 A ≤ 4         → 감지 점
 *   L4 화소  줌 ≥ 10.6      → 화소 사각형(점 대신)
 * 깜빡임 여유는 경계 아래쪽에만 둔다(서버는 0.1° 칸 1만 개 = 100 제곱도를 넘으면 400): L1→L2 는 A ≤ 90, L2→L3 는 A ≤ 3.6.
 * 시간 창(R13): 최근 24시간 · 기간 화면은 점이 기본이고 A ≤ 100 까지 점, 넘으면 다른 자료로 바꿔 그리지 않는다("fixed").
 */
export const CELLS1_MIN_AREA = 100;
export const POINTS_MAX_AREA = 4;
export const PX_MIN_ZOOM = 10.6;
/** 경계 아래쪽 여유(비율) */
export const HYST_BELOW = 0.1;
/** 0.1° 칸 타일 한 변(도) — 625칸, 서버 한도(1만)에 걸리지 않는다 */
export const TILE_DEG = 2.5;

export type Level = "L1" | "L2" | "L3" | "L4";
export type TimeWindow = "month" | "recent" | "range";
/** [서, 남, 동, 북] — 서 > 동 이 아니라 서 < 동, 경도는 세계 사본 때문에 ±180 을 넘을 수 있다 */
export type Box = readonly [number, number, number, number];

/** 시야 넓이(제곱도) = 펼친 경도 폭(최대 360) × 위도 폭. 서버와 같은 방식 */
export function areaOf(b: Box): number {
  const w = Math.max(0, Math.min(360, b[2] - b[0]));
  const h = Math.max(0, Math.min(180, b[3] - b[1]));
  return w * h;
}

/**
 * 단계 고르기. prev = 앞 단계(없으면 처음 열 때 — 여유 없이 표의 경계).
 * 달 창이 아닌 화면에서 넓이 > 100 이면 "fixed"(점을 받을 수 없음 — 상태 줄로 알리고 바탕만).
 */
export function levelOf(area: number, zoom: number, prev: Level | "fixed" | null = null, win: TimeWindow = "month"): Level | "fixed" {
  if (win !== "month") {
    if (area > CELLS1_MIN_AREA) return "fixed";
    return zoom >= PX_MIN_ZOOM ? "L4" : "L3";
  }
  const lo1 = CELLS1_MIN_AREA * (1 - HYST_BELOW);
  const lo2 = POINTS_MAX_AREA * (1 - HYST_BELOW);
  if (area > CELLS1_MIN_AREA) return "L1";
  if (prev === "L1" && area > lo1) return "L1";
  if (area > POINTS_MAX_AREA) return "L2";
  if ((prev === "L2" || prev === "L1") && area > lo2) return "L2";
  return zoom >= PX_MIN_ZOOM ? "L4" : "L3";
}

/** 칸을 그리는 단계인가 */
export const isCellLevel = (lv: Level | "fixed" | null | undefined) => lv === "L1" || lv === "L2";
/** 점을 그리는 단계인가 */
export const isPointLevel = (lv: Level | "fixed" | null | undefined) => lv === "L3" || lv === "L4";

const clampLat = (v: number) => Math.max(-90, Math.min(90, v));

/** 경도 상자를 ±180 안 조각들로(세계 사본 · 날짜 변경선). 폭 ≥ 360 이면 전 세계 하나 */
export function splitLon(w: number, e: number): [number, number][] {
  if (e - w >= 360) return [[-180, 180]];
  const sh = Math.floor((w + 180) / 360) * 360;
  const a = w - sh;
  const b = e - sh;
  if (b <= 180) return [[a, b]];
  return [
    [a, 180],
    [-180, b - 360],
  ];
}

/** 시야와 겹치는 2.5° 고정 타일(서·남은 2.5 의 배수, ±180 안). 같은 타일은 같은 키 */
export function tilesOf(b: Box): Box[] {
  const s = Math.floor(clampLat(b[1]) / TILE_DEG) * TILE_DEG;
  const n = Math.ceil(clampLat(b[3]) / TILE_DEG) * TILE_DEG;
  const out: Box[] = [];
  const seen = new Set<string>();
  for (const [w, e] of splitLon(b[0], b[2])) {
    const w0 = Math.floor(w / TILE_DEG) * TILE_DEG;
    const e0 = Math.ceil(e / TILE_DEG) * TILE_DEG;
    for (let x = w0; x < e0 - 1e-9; x += TILE_DEG)
      for (let y = s; y < n - 1e-9; y += TILE_DEG) {
        const t: Box = [round(x), round(y), round(Math.min(180, x + TILE_DEG)), round(Math.min(90, y + TILE_DEG))];
        const k = tileKey(t);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(t);
        }
      }
  }
  return out;
}
const round = (v: number) => Math.round(v * 1000) / 1000;
export const tileKey = (t: Box) => t.map((v) => v.toFixed(1)).join(",");

/** 점 요청 상자: 0.1° 격자에 바깥쪽으로 맞추고 날짜 변경선을 넘으면 둘로 */
export function pointBoxes(b: Box): Box[] {
  const s = Math.floor(clampLat(b[1]) * 10) / 10;
  const n = Math.ceil(clampLat(b[3]) * 10) / 10;
  return splitLon(b[0], b[2]).map(([w, e]) => [Math.max(-180, Math.floor(w * 10) / 10), s, Math.min(180, Math.ceil(e * 10) / 10), n] as Box);
}

/** 두 상자가 겹치는가(경도는 ±180 안 조각끼리) */
export function boxHits(a: Box, b: Box): boolean {
  if (a[1] > b[3] || a[3] < b[1]) return false;
  return splitLon(a[0], a[2]).some(([w1, e1]) => splitLon(b[0], b[2]).some(([w2, e2]) => w1 <= e2 && w2 <= e1));
}
