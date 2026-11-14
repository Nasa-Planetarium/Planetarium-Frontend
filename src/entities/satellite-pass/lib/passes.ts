/**
 * 위성 통과 — 목업 core.js EM.passes·EM.nextPass 의 궤도 부분 이식(같은 TLE · 같은 식).
 * 원장 = CelesTrak GP TLE 스냅숏(2026-11-12 받음, 기원 2026-11-11). 외부 호출 없이 화면 안에서 계산한다.
 * - 궤도: SGP4 초기화(Kozai→Brouwer 평균 운동) + J2·J4 영년 항 + n-dot 항. 이심률은 원궤도로 둔다.
 * - 통과 = 기준점이 센서 관측폭 절반 안에 드는 구간, 시각은 그 구간에서 지상점이 가장 가까운 때(20초 간격).
 * - TLE 기원 ±45일(ORBIT_FROM ~ ORBIT_TO, KST)만 계산한다. 그 밖의 날은 목업의 근사(궤적 반복 일수 빌림)를 옮기지 않았다 → 빈 배열.
 * 기준점은 부르는 쪽이 준다(나라 표시 중심 · 고른 지역 중심) — 경북 고정 아님.
 */
export interface Sat {
  sat: string;
  short: string;
  sensor: "MODIS" | "VIIRS";
  swath_km: number;
  start: string;
}
export const SATS: readonly Sat[] = [
  { sat: "Terra", short: "T", sensor: "MODIS", swath_km: 2330, start: "2000-02-24" },
  { sat: "Aqua", short: "A", sensor: "MODIS", swath_km: 2330, start: "2002-07-04" },
  { sat: "S-NPP", short: "S", sensor: "VIIRS", swath_km: 3060, start: "2012-01-19" },
  { sat: "NOAA-20", short: "N20", sensor: "VIIRS", swath_km: 3060, start: "2018-01-05" },
  { sat: "NOAA-21", short: "N21", sensor: "VIIRS", swath_km: 3060, start: "2023-02-10" },
];
const TLE: Record<string, [string, string]> = {
  Terra: ["1 25994U 99068A   26315.88758803  .00000385  00000+0  87222-4 0  9995", "2 25994  97.9268 359.4376 0003504 112.9522  60.4417 14.61195197431175"],
  Aqua: ["1 27424U 02022A   26315.92574859  .00000868  00000+0  18188-3 0  9991", "2 27424  98.4488 288.3228 0001091 107.4270 275.7877 14.62275561304860"],
  "S-NPP": ["1 37849U 11061A   26315.93700476  .00000092  00000+0  64543-4 0  9999", "2 37849  98.8113 255.8879 0000682 257.9137 102.1962 14.19542526779404"],
  "NOAA-20": ["1 43013U 17073A   26315.88050405  .00000081  00000+0  59234-4 0  9991", "2 43013  98.7922 254.1077 0001096 132.4067 227.7202 14.19536463465420"],
  "NOAA-21": ["1 54234U 22150A   26315.84049351  .00000069  00000+0  53450-4 0  9994", "2 54234  98.7202 252.2158 0002600 115.1626 244.9820 14.19558324207496"],
};
export const TLE_DATE = "2026-11-12";
export const ORBIT_FROM_MS = Date.parse("2026-09-27T00:00:00+09:00");
export const ORBIT_TO_MS = Date.parse("2026-12-27T00:00:00+09:00");

const RAD = Math.PI / 180;
const TAU = 2 * Math.PI;
interface Orbit {
  ep: number;
  inc: number;
  node: number;
  w: number;
  M: number;
  ndot2: number;
  mdot: number;
  wdot: number;
  odot: number;
}
function orbitOf(l1: string, l2: string): Orbit {
  const yy = +l1.slice(18, 20);
  const doy = +l1.slice(20, 32);
  const ep = Date.UTC(2000 + yy, 0, 1) + (doy - 1) * 86400e3;
  const ndot2 = +l1.slice(33, 43);
  const inc = +l2.slice(8, 16) * RAD;
  const node = +l2.slice(17, 25) * RAD;
  const e = +("0." + l2.slice(26, 33).trim());
  const w = +l2.slice(34, 42) * RAD;
  const M = +l2.slice(43, 51) * RAD;
  const nRev = +l2.slice(52, 63);
  const ke = 0.0743669161;
  const k2 = 5.41308e-4;
  const J4 = -1.65597e-6;
  const n0 = (nRev * TAU) / 1440;
  const th = Math.cos(inc);
  const th2 = th * th;
  const b2 = 1 - e * e;
  const b0 = Math.sqrt(b2);
  const a1 = Math.pow(ke / n0, 2 / 3);
  const d1 = (1.5 * k2 * (3 * th2 - 1)) / (a1 * a1 * b0 * b2);
  const a0 = a1 * (1 - d1 / 3 - d1 * d1 - (134 / 81) * d1 * d1 * d1);
  const d0 = (1.5 * k2 * (3 * th2 - 1)) / (a0 * a0 * b0 * b2);
  const nn = n0 / (1 + d0);
  const aa = a0 / (1 - d0);
  const pinv = 1 / (aa * aa * b2 * b2);
  const t1 = 3 * k2 * pinv * nn;
  const t2 = t1 * k2 * pinv;
  const t3 = -0.46875 * J4 * pinv * pinv * nn;
  return {
    ep,
    inc,
    node,
    w,
    M,
    ndot2,
    mdot: nn + 0.5 * t1 * b0 * (3 * th2 - 1) + 0.0625 * t2 * b0 * (13 - 78 * th2 + 137 * th2 * th2),
    wdot: -0.5 * t1 * (1 - 5 * th2) + 0.0625 * t2 * (7 - 114 * th2 + 395 * th2 * th2) + t3 * (3 - 36 * th2 + 49 * th2 * th2),
    odot: -t1 * th + (0.5 * t2 * (4 - 19 * th2) + 2 * t3 * (3 - 7 * th2)) * th,
  };
}
const ORB: Record<string, Orbit> = Object.fromEntries(Object.entries(TLE).map(([k, [a, b]]) => [k, orbitOf(a, b)]));

function subPoint(o: Orbit, ms: number): [number, number] {
  const tm = (ms - o.ep) / 60000;
  const td = tm / 1440;
  const u = o.w + o.wdot * tm + o.M + o.mdot * tm + o.ndot2 * TAU * td * td;
  const om = o.node + o.odot * tm;
  const gmst = (280.46061837 + 360.98564736629 * (ms / 86400e3 + 2440587.5 - 2451545)) * RAD;
  return [Math.asin(Math.sin(o.inc) * Math.sin(u)), om + Math.atan2(Math.cos(o.inc) * Math.sin(u), Math.cos(u)) - gmst];
}
const gcKm = (a: [number, number], b: [number, number]) =>
  6371 * Math.acos(Math.min(1, Math.sin(a[0]) * Math.sin(b[0]) + Math.cos(a[0]) * Math.cos(b[0]) * Math.cos(a[1] - b[1])));

export interface Pass {
  sat: string;
  sensor: "MODIS" | "VIIRS";
  ms: number;
  off_km: number;
}

/** [from, to) 안의 통과(시각 순). at = [위도, 경도](도). 궤도 창 밖 구간은 잘라 낸다 */
export function passes(from: number, to: number, at: readonly [number, number]): Pass[] {
  const lo = Math.max(from, ORBIT_FROM_MS);
  const hi = Math.min(to, ORBIT_TO_MS);
  if (!(hi > lo)) return [];
  const p: [number, number] = [at[0] * RAD, at[1] * RAD];
  const out: Pass[] = [];
  const day = new Date(lo).toISOString().slice(0, 10);
  for (const s of SATS) {
    if (day < s.start) continue;
    const o = ORB[s.sat];
    if (!o) continue;
    const half = s.swath_km / 2;
    let best: { d: number; t: number } | null = null;
    for (let t = lo - 1800e3; t <= hi + 1800e3; t += 20e3) {
      const d = gcKm(subPoint(o, t), p);
      const inn = d <= half;
      if (inn && (!best || d < best.d)) best = { d, t };
      if (!inn && best) {
        if (best.t >= lo && best.t < hi) out.push({ sat: s.sat, sensor: s.sensor, ms: best.t, off_km: Math.round(best.d) });
        best = null;
      }
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** 지금 뒤 첫 통과(2일 안). 궤도 창 밖이면 null */
export function nextPass(now: number, at: readonly [number, number]): Pass | null {
  return passes(now + 1, now + 2 * 86400e3, at)[0] ?? null;
}

/** 그 시각 앞 마지막 통과(2일 안). 궤도 창 밖이면 null */
export function lastPass(at_ms: number, at: readonly [number, number]): Pass | null {
  const ps = passes(at_ms - 2 * 86400e3, at_ms + 1, at);
  return ps[ps.length - 1] ?? null;
}
