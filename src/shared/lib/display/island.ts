/**
 * 섬 표지(빈 원, 표시 규칙서 R10, 2026-11-15) — 순수 함수.
 * 지금 줌에서 화면 상자가 4px 미만인 고리에만 표지를 두고, 그 지역에 4px 이상인 고리가 하나라도 있으면(본토가 보이는 나라) 표지를 두지 않는다.
 * 그러면 USA·CAN·한국은 0개, 몰디브·키리바시 같은 군도 나라는 섬마다(8px 안은 하나로 합쳐) 나온다.
 * 옛 판정(맞춘 범위 폭의 1/60 보다 작은 고리)은 USA 245개 · CAN 371개 · 한국 0개를 만들어 나라마다 달랐다.
 */
export const ISLAND_MIN_PX = 4;
export const ISLAND_MERGE_PX = 8;

type Ring = readonly (readonly number[])[];

/** project(lon, lat) → [x, y] 화면 px. lonAdj = 고른 쪽 경도로 옮기기(fit.lonInFit) */
export function islandMarkers(rings: readonly Ring[], project: (lon: number, lat: number) => readonly [number, number], lonAdj: (lon: number) => number = (x) => x): [number, number][] {
  const small: { lon: number; lat: number; x: number; y: number }[] = [];
  for (const r of rings) {
    if (!r.length) continue;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let lo = 0;
    let la = 0;
    for (const q of r) {
      const lon = lonAdj(q[0] as number);
      const [x, y] = project(lon, q[1] as number);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      lo += lon;
      la += q[1] as number;
    }
    if (Math.max(x1 - x0, y1 - y0) >= ISLAND_MIN_PX) return [];
    small.push({ lon: lo / r.length, lat: la / r.length, x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  }
  const out: { lon: number; lat: number; x: number; y: number }[] = [];
  for (const s of small) if (!out.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < ISLAND_MERGE_PX)) out.push(s);
  return out.map((o) => [o.lon, o.lat]);
}
