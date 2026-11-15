/**
 * 칸 지도 틀(비교 분석 S2 「칸 지도」) — 순수 계산. 화면은 ui/charts.tsx CellDots.
 *
 * 문제(2026-11-15 사용자 「비교 분석에서 지도 잘 안 나와」): 칸 원만 빈 바탕에 찍혀(나라·시도 모양 없음) 어디인지 안 보였고,
 * 원 크기가 화면 px 고정(2.5–13)이라 1° 칸 큰 나라(미국·브라질)는 원끼리 겹쳐 덩어리, 시야가 칸 범위뿐이라
 * 알래스카·하와이 칸이 본토를 구석으로 밀었다(날짜 변경선 너머 칸은 지도 폭 전체로 늘였다).
 *
 * 규칙:
 * - 바탕 = 바다(map-sea) + 땅(map-land) 면. 땅 = 지금 나라 1급 경계(public/geo/c/<ISO3>.json) 또는 세계 윤곽(WORLD·대륙).
 * - 경도는 중심 경도(c0) ±180 으로 접는다(알류샨·피지 같은 날짜 변경선 너머 칸·면).
 * - 시야 = 칸 범위 ∪ 칸이 들어 있는 땅 면 범위 ∪ 고른 1급 면 범위(고른 지역 테두리 강조). 칸 없는 먼 해외 영토는 시야를 넓히지 않는다.
 * - 높이 상한(maxH): 넘으면 축척을 줄이고 가로 가운데. 원 반지름 = 칸 간격(px) × 단계 비율(로그 단계 그대로, F9), 2.2–13px.
 */

export type LonLat = [number, number];
export type Ring = LonLat[];
export interface LandPart {
  /** 면 하나(외곽 고리들) */
  rings: Ring[];
  /** 고른 지역(1급) — 테두리 강조 */
  on?: boolean;
  title?: string;
}
export interface FrameIn {
  cells: { lat: number; lon: number }[];
  land: LandPart[];
  /** 접기 중심 경도. 없으면 칸 경도의 원형 평균 */
  c0?: number | null;
  cellDeg: number;
  width: number;
  maxH: number;
  pad?: number;
}
export interface Frame {
  W: number;
  H: number;
  X: (lon: number) => number;
  Y: (lat: number) => number;
  /** 칸 간격(px) */
  cs: number;
  wrap: (lon: number) => number;
  bbox: [number, number, number, number];
}

/** 경도를 c0 ±180 안으로 */
export const wrapLon = (c0: number) => (x: number) => {
  let v = x;
  while (v - c0 > 180) v -= 360;
  while (c0 - v > 180) v += 360;
  return v;
};

/** 경도 원형 평균(날짜 변경선 양쪽 칸이 섞여도 가운데가 맞게) */
export function circMeanLon(lons: number[]): number {
  if (!lons.length) return 0;
  let sx = 0;
  let sy = 0;
  for (const l of lons) {
    sx += Math.cos((l * Math.PI) / 180);
    sy += Math.sin((l * Math.PI) / 180);
  }
  return (Math.atan2(sy, sx) * 180) / Math.PI;
}

type BB = [number, number, number, number];
const grow = (b: BB, x: number, y: number) => {
  b[0] = Math.min(b[0], x);
  b[1] = Math.min(b[1], y);
  b[2] = Math.max(b[2], x);
  b[3] = Math.max(b[3], y);
};
const empty = (): BB => [Infinity, Infinity, -Infinity, -Infinity];
const ok = (b: BB) => b[2] >= b[0] && b[3] >= b[1];

export function cellFrame(o: FrameIn): Frame | null {
  if (!o.cells.length) return null;
  const c0 = o.c0 ?? circMeanLon(o.cells.map((c) => c.lon));
  const wrap = wrapLon(c0);
  const half = o.cellDeg / 2;
  const bb = empty();
  o.cells.forEach((c) => {
    const x = wrap(c.lon);
    grow(bb, x - half, c.lat - half);
    grow(bb, x + half, c.lat + half);
  });
  const inBB = (b: BB, x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  o.land.forEach((p) => {
    const pb = empty();
    p.rings.forEach((r) => r.forEach(([x, y]) => grow(pb, wrap(x), y)));
    if (!ok(pb)) return;
    /* 고른 면은 늘 · 다른 면은 칸 중심이 그 면 범위에 하나라도 들 때만(칸 없는 먼 해외 영토·섬은 시야를 넓히지 않는다) */
    if (p.on || o.cells.some((c) => inBB(pb, wrap(c.lon), c.lat))) {
      grow(bb, pb[0], pb[1]);
      grow(bb, pb[2], pb[3]);
    }
  });
  const [w, s, e, n] = bb;
  const pad = o.pad ?? 10;
  const k = Math.max(0.05, Math.cos((((s + n) / 2) * Math.PI) / 180));
  const dx = Math.max(1e-6, (e - w) * k);
  const dy = Math.max(1e-6, n - s);
  const sc = Math.min((o.width - pad * 2) / dx, (o.maxH - pad * 2) / dy);
  const H = Math.round(dy * sc + pad * 2);
  const ox = (o.width - dx * sc) / 2;
  return {
    W: o.width,
    H,
    X: (lon: number) => ox + (wrap(lon) - w) * k * sc,
    Y: (lat: number) => pad + (n - lat) * sc,
    cs: o.cellDeg * sc,
    wrap,
    bbox: [w, s, e, n],
  };
}

/** 원 반지름: 칸 간격 × 단계 비율(단계 0–4), 2.2–13px */
const FR = [0.2, 0.27, 0.34, 0.42, 0.5] as const;
export const cellRadius = (cs: number, step: number) => Math.max(2.2, Math.min(13, cs * (FR[Math.max(0, Math.min(4, step))] ?? 0.2)));

/** 고리들 → SVG path d(경도 접기는 frame.X 가 한다) */
export const ringsPath = (f: Pick<Frame, "X" | "Y">, rings: Ring[]) =>
  rings
    .filter((r) => r.length > 2)
    .map((r) => `M${r.map(([x, y]) => `${f.X(x).toFixed(1)} ${f.Y(y).toFixed(1)}`).join("L")}Z`)
    .join("");
