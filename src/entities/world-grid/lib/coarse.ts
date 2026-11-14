import type { WorldMeta } from "../api/world-grid";

/**
 * 넓은 범위 칸 지도의 1° 묶음(목업 api.js hCells 의 나라 몫 · w1Month 이식).
 * 실서버 /cells 는 칸 1만 개를 넘는 범위(대륙·큰 나라·큰 1급)에 400 range_too_large 를 낸다 → 정적 world-1deg 의 그 달 1° 칸을
 * 그 범위 윤곽(없으면 bbox)으로 잘라 그린다. 값은 양자화된 1° 칸 값(지도용) — 합계·판정에는 쓰지 않는다.
 */
export type Ring = number[][];
export type Polys = Ring[][];

/** 그 달 1° 칸: g = (floor(lat)+90)*360 + (floor(lon)+180), v = 복원 값 */
export function decodeMonth(meta: WorldMeta, buf: ArrayBuffer, i: number): { g: number; v: number }[] {
  const n = meta.n_active;
  const NM = meta.months.n;
  if (i < 0 || i >= NM) return [];
  const bpm = meta.bitmap_bytes_per_month;
  const u8 = new Uint8Array(buf);
  const act = new Uint16Array(buf, 0, n);
  let p = n * 2 + NM * bpm;
  for (let k = 0; k < i; k++) p += meta.counts[k] ?? 0;
  const bm = n * 2 + i * bpm;
  const { lnmin, lnmax } = meta.quant;
  const out: { g: number; v: number }[] = [];
  for (let k = 0; k < n; k++) {
    if ((u8[bm + (k >> 3)] ?? 0) & (1 << (k & 7))) {
      const qv = u8[p++] ?? 1;
      out.push({ g: act[k] as number, v: Math.exp(lnmin + ((qv - 1) / 254) * (lnmax - lnmin)) });
    }
  }
  return out;
}

/** 달 번호(world-1deg months.start 기준 0…) */
export function monthIdx(meta: WorldMeta, y: number, m: number) {
  const [sy, sm] = meta.months.start.split("-").map(Number) as [number, number];
  return (y - sy) * 12 + (m - sm);
}

/** GeoJSON Polygon/MultiPolygon → 다각형 목록 */
export function polysOf(geom: { type: string; coordinates: unknown } | null | undefined): Polys {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates as Ring[]];
  if (geom.type === "MultiPolygon") return geom.coordinates as Ring[][];
  return [];
}

function inRing(r: Ring, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i] as number[];
    const b = r[j] as number[];
    const ax = a[0] as number;
    const ay = a[1] as number;
    const bx = b[0] as number;
    const by = b[1] as number;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) c = !c;
  }
  return c;
}
export function inPolys(ps: Polys, x: number, y: number) {
  return ps.some((p) => p.length > 0 && inRing(p[0] as Ring, x, y) && !p.slice(1).some((h) => inRing(h, x, y)));
}

/** 다각형이 칸(1°)과 겹치는지 — 칸 중심이 밖이어도 칸 안에 꼭짓점이 있으면 넣는다(작은 섬·좁은 나라가 0 칸이 되지 않게) */
function touches(ps: Polys, la0: number, lo0: number) {
  if (inPolys(ps, lo0 + 0.5, la0 + 0.5)) return true;
  return ps.some((p) => (p[0] ?? []).some((q) => (q[0] as number) >= lo0 && (q[0] as number) < lo0 + 1 && (q[1] as number) >= la0 && (q[1] as number) < la0 + 1));
}

export interface CoarseCell {
  cell_lat: number;
  cell_lon: number;
  value: number;
}
/**
 * 1° 칸 자르기: polys 가 null 이면 전 세계, 빈 배열이면 bbox 로만(bbox 도 없으면 빈 목록).
 * bbox 가 날짜 변경선을 넘으면(서 > 동) 경도를 이어 붙여 비교한다.
 */
export function coarseCells(month: { g: number; v: number }[], polys: Polys | null, bbox: number[] | null | undefined): CoarseCell[] {
  const out: CoarseCell[] = [];
  const bb = bbox && bbox.length === 4 ? (bbox as [number, number, number, number]) : null;
  if (polys && !polys.length && !bb) return out;
  const box = (() => {
    if (polys && polys.length) {
      let w = 999;
      let s = 999;
      let e = -999;
      let n = -999;
      polys.forEach((p) => (p[0] ?? []).forEach((q) => ((w = Math.min(w, q[0] as number)), (e = Math.max(e, q[0] as number)), (s = Math.min(s, q[1] as number)), (n = Math.max(n, q[1] as number)))));
      return [w, s, e, n] as const;
    }
    return bb;
  })();
  month.forEach(({ g, v }) => {
    const la0 = Math.floor(g / 360) - 90;
    const lo0 = (g % 360) - 180;
    if (box && polys !== null) {
      const [w, s, e, n] = box;
      if (la0 + 1 < s || la0 > n) return;
      if (w <= e ? lo0 + 1 < w || lo0 > e : lo0 > e && lo0 + 1 < w) return;
    }
    if (polys && polys.length && !touches(polys, la0, lo0)) return;
    out.push({ cell_lat: la0 + 0.5, cell_lon: lo0 + 0.5, value: Math.round(v * 10) / 10 });
  });
  return out;
}
