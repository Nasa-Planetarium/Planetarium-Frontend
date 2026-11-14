/**
 * 위성 통과 — 목업 core.js EM.passes·EM.nextPass 의 궤도 부분 이식(같은 TLE · 같은 식).
 * 원장 = CelesTrak GP TLE 스냅숏(2026-11-12 받음, 기원 2026-11-11). 외부 호출 없이 화면 안에서 계산한다.
 * - 궤도: SGP4 초기화(Kozai→Brouwer 평균 운동) + J2·J4 영년 항 + n-dot 항. 이심률은 원궤도로 둔다.
 * - 통과 = 기준점이 센서 관측폭 절반 안에 드는 구간, 시각은 그 구간에서 지상점이 가장 가까운 때(20초 간격).
 * - TLE 기원 ±45일(ORBIT_FROM ~ ORBIT_TO, KST)은 그날 궤도로 계산한다.
 * - 그 밖의 날은 근사(approx: true) — 목업 approxPasses 그대로: 위성마다 지상 궤적이 거의 되풀이되는 정수 일수(궤도에서 센다)만큼
 *   창 안의 날로 옮겨 궤도로 계산한 뒤 날짜만 되돌린다. Terra·Aqua 는 지방시 표류(등가속 가정 Δ(t)=Δ·((t−t0)/T)²)만큼 더 민다.
 *   근사 시각은 실제와 수십 분 어긋날 수 있다 → 화면은 approx 행을 시 단위(passHM 「13시경」)로 쓴다.
 * - 하루 칸은 KST 날짜(목업 passesOfDay 와 같은 자르기) — 같은 (날, 기준점)은 한 번만 센다.
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
const ORBIT_FROM = "2026-09-27";
const ORBIT_TO = "2026-12-26";
/** 공칭 적도 통과 지방시(분). VIIRS 셋은 궤도 유지 중이라 표류를 두지 않는다 */
const NOMINAL_LT: Record<string, { min: number; desc: boolean }> = { Terra: { min: 630, desc: true }, Aqua: { min: 810, desc: false } };

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
  swath_km: number;
  /** 낮/밤 — 지방 태양시(경도/15) 6–18시 = 낮 */
  node: "day" | "night";
  /** 궤도 창 밖의 근사 행(시 단위로만 쓴다) */
  approx?: true;
}

/* ── 지방시 표류(분): 그날의 표류량 − TLE 기원의 표류량 (목업 DRIFT) ── */
const DRIFT: Record<string, { D: number; T: number; ep: number }> = {};
for (const [k, nm] of Object.entries(NOMINAL_LT)) {
  const o = ORB[k];
  if (!o) continue;
  const d = o.ep / 86400e3 + 2440587.5 - 2451545;
  const sun = 280.46 + 0.9856474 * d;
  const ltan = (((12 * 60 + (o.node / RAD - sun) * 4) % 1440) + 1440) % 1440;
  let D = (nm.desc ? ltan - 720 : ltan) - nm.min;
  D = ((((D + 720) % 1440) + 1440) % 1440) - 720;
  const rate = ((o.odot * 1440) / RAD - 0.9856474) * 4;
  const T = Math.abs(rate) > 1e-4 && D * rate > 0 ? (2 * D) / rate : 0;
  DRIFT[k] = { D, T, ep: o.ep };
}
/* ── 궤적 반복 일수: 하루 궤도 수 × D 가 정수에 가장 가까운 D(1..45) (목업 REPEAT) ── */
const REPEAT: Record<string, number> = {};
for (const [k, o] of Object.entries(ORB)) {
  const perDay = ((o.mdot + o.wdot) * 1440) / TAU;
  let best = 1;
  let bf = 1;
  for (let D = 1; D <= 45; D++) {
    const x = D * perDay;
    const fr = Math.abs(x - Math.round(x));
    if (fr < bf - 1e-9) {
      bf = fr;
      best = D;
    }
  }
  REPEAT[k] = best * 86400e3;
}
function driftMin(sat: string, ms: number) {
  const g = DRIFT[sat];
  if (!g || !g.T) return 0;
  const u = Math.max(0, 1 - (g.ep - ms) / 86400e3 / g.T);
  return g.D * u * u - g.D;
}

/** [lo, hi) 안에서 지상점이 기준점에 가장 가까운 때(관측폭 안) */
function scanSat(s: Sat, lo: number, hi: number, p: [number, number]): { t: number; d: number }[] {
  const o = ORB[s.sat];
  const out: { t: number; d: number }[] = [];
  if (!o) return out;
  const half = s.swath_km / 2;
  let best: { d: number; t: number } | null = null;
  for (let t = lo - 1800e3; t <= hi + 1800e3; t += 20e3) {
    const d = gcKm(subPoint(o, t), p);
    const inn = d <= half;
    if (inn && (!best || d < best.d)) best = { d, t };
    if (!inn && best) {
      if (best.t >= lo && best.t < hi) out.push(best);
      best = null;
    }
  }
  return out;
}

const KST = 9 * 3600e3;
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);
const dayMemo = new Map<string, Pass[]>();
/** 하루(KST 날짜) 통과 — 창 안은 궤도, 밖은 근사. 임무 시작 전 위성은 뺀다 */
function passesOfDay(ds: string, at: readonly [number, number]): Pass[] {
  const key = `${ds}@${at[0].toFixed(3)},${at[1].toFixed(3)}`;
  const hit = dayMemo.get(key);
  if (hit) return hit;
  const p: [number, number] = [at[0] * RAD, at[1] * RAD];
  const day0 = Date.parse(`${ds}T00:00:00+09:00`);
  const row = (s: Sat, ms: number, d: number, approx: boolean): Pass => {
    const h = (((ms / 3600e3 + at[1] / 15) % 24) + 24) % 24;
    const r: Pass = { sat: s.sat, sensor: s.sensor, ms, off_km: Math.round(d), swath_km: s.swath_km, node: h >= 6 && h < 18 ? "day" : "night" };
    if (approx) r.approx = true;
    return r;
  };
  const out: Pass[] = [];
  const inWin = ds >= ORBIT_FROM && ds <= ORBIT_TO;
  for (const s of SATS) {
    if (ds < s.start) continue;
    if (inWin) {
      scanSat(s, day0, day0 + 86400e3, p).forEach((b) => out.push(row(s, b.t, b.d, false)));
      continue;
    }
    const P = REPEAT[s.sat];
    if (!P) continue;
    const k = day0 < ORBIT_FROM_MS ? Math.ceil((ORBIT_FROM_MS - day0) / P) : -Math.ceil((day0 - (ORBIT_TO_MS - 86400e3)) / P);
    const sh = k * P;
    const dl = Math.round(driftMin(s.sat, day0 + 43200e3) - driftMin(s.sat, day0 + sh + 43200e3)) * 60000;
    scanSat(s, day0 + sh - dl, day0 + sh - dl + 86400e3, p).forEach((b) => out.push(row(s, b.t - sh + dl, b.d, true)));
  }
  out.sort((a, b) => a.ms - b.ms);
  if (dayMemo.size > 400) dayMemo.clear();
  dayMemo.set(key, out);
  return out;
}

/** [from, to) 안의 통과(시각 순). at = [위도, 경도](도). 궤도 창 밖의 날은 근사 행(approx) */
export function passes(from: number, to: number, at: readonly [number, number]): Pass[] {
  if (!(to > from)) return [];
  const out: Pass[] = [];
  for (let d = Date.parse(`${kstDate(from)}T00:00:00+09:00`); d < to; d += 86400e3) {
    passesOfDay(kstDate(d), at).forEach((p) => {
      if (p.ms >= from && p.ms < to) out.push({ ...p });
    });
  }
  return out;
}

/** 지금 뒤 첫 통과(2일 안) */
export function nextPass(now: number, at: readonly [number, number]): Pass | null {
  return passes(now + 1, now + 2 * 86400e3, at)[0] ?? null;
}

/** 그 시각 앞 마지막 통과(2일 안) */
export function lastPass(at_ms: number, at: readonly [number, number]): Pass | null {
  const ps = passes(at_ms - 2 * 86400e3, at_ms + 1, at);
  return ps[ps.length - 1] ?? null;
}

/** 통과 시각 글자 재료: 근사 행이면 시(「13시경」 — 사전 shell.pass.approx {h}), 아니면 null(부르는 쪽이 HH:MM) */
export function approxHour(p: Pick<Pass, "ms" | "approx">, hm: (ms: number) => string): number | null {
  return p.approx ? +hm(p.ms).slice(0, 2) : null;
}
