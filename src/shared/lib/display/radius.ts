/**
 * 칸 원 크기(표시 규칙서 R5, 2026-11-15) — 화면 px 기준.
 *   r(k, z) = clamp(cellPx(z) × 0.5 × F[k], RMIN[k], RMAX[k]),  cellPx(z) = 칸 크기° × 512/360 × 2^z
 * 단계마다 최소·최대가 있어 어느 줌에서나 보이고 단계 순서가 지켜진다(0.1–93px 로 벌어지던 것).
 * MapLibre 는 줌 interpolate 를 식 맨 위에 하나만 둘 수 있어, 다섯 단계가 rmin·rmax 에 닿는 줌 10개를 합친 정지점 목록을 쓰고
 * 정지점마다 출력을 match(단계)로 둔다. 이웃 정지점 사이에서 각 단계 함수는 상수이거나 c·2^z 라 exponential 2 보간이 식과 같다.
 */
export const F = [0.4, 0.55, 0.7, 0.85, 1] as const;
export const RMIN = [1.5, 2, 2.5, 3, 3.5] as const;
export const RMAX = [4, 6, 8, 10, 12] as const;
const PX_DEG = 512 / 360;

export const cellPx = (cellDeg: number, zoom: number) => cellDeg * PX_DEG * 2 ** zoom;

export function radiusPx(k: number, cellDeg: number, zoom: number): number {
  const i = Math.max(0, Math.min(4, Math.round(k)));
  const r = cellPx(cellDeg, zoom) * 0.5 * (F[i] as number);
  return Math.max(RMIN[i] as number, Math.min(RMAX[i] as number, r));
}

/** 단계 k 가 r 에 닿는 줌 */
const zoomAt = (k: number, cellDeg: number, r: number) => Math.log2(r / (0.5 * (F[k] as number) * cellDeg * PX_DEG));

/** 정지 줌(오름차순, 0–24 안) */
export function radiusStops(cellDeg: number): number[] {
  const zs = new Set<number>([0, 24]);
  for (let k = 0; k < 5; k++) {
    zs.add(zoomAt(k, cellDeg, RMIN[k] as number));
    zs.add(zoomAt(k, cellDeg, RMAX[k] as number));
  }
  return [...zs].filter((z) => z >= 0 && z <= 24).sort((a, b) => a - b);
}

/** MapLibre circle-radius 식(속성 k = 단계 0–4) */
export function radiusExpr(cellDeg: number, prop = "k"): unknown[] {
  const out: unknown[] = ["interpolate", ["exponential", 2], ["zoom"]];
  radiusStops(cellDeg).forEach((z) => {
    out.push(z, ["match", ["get", prop], 0, radiusPx(0, cellDeg, z), 1, radiusPx(1, cellDeg, z), 2, radiusPx(2, cellDeg, z), 3, radiusPx(3, cellDeg, z), radiusPx(4, cellDeg, z)]);
  });
  return out;
}

/** 감지 점 반지름(R6): 줌 4/7/10 에서 1.6/2.2/3.2px, FRP 가중 ×1–1.6 */
export function dotRadiusExpr(frpProp = "frp"): unknown[] {
  const w = ["interpolate", ["linear"], ["coalesce", ["get", frpProp], 0], 0, 1, 20, 1.2, 100, 1.4, 500, 1.6];
  return ["interpolate", ["linear"], ["zoom"], 4, ["*", 1.6, w], 7, ["*", 2.2, w], 10, ["*", 3.2, w], 14, ["*", 4.4, w]];
}
/** 같은 값(캔버스 · 범례 견본) */
export function dotRadiusPx(zoom: number, frp = 0): number {
  const w = frp >= 500 ? 1.6 : frp >= 100 ? 1.4 + ((frp - 100) / 400) * 0.2 : frp >= 20 ? 1.2 + ((frp - 20) / 80) * 0.2 : 1 + (Math.max(0, frp) / 20) * 0.2;
  const z = Math.max(4, Math.min(14, zoom));
  const base = z <= 7 ? 1.6 + ((z - 4) / 3) * 0.6 : z <= 10 ? 2.2 + ((z - 7) / 3) * 1 : 3.2 + ((z - 10) / 4) * 1.2;
  return base * w;
}
