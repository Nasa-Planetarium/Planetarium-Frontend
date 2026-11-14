/**
 * 경보·출동(ops) 목 생성기 — 목업 mock/agency.js · core.js 의 ops 몫을 그대로 옮겼다(결정 F5 격리: 이 폴더 안에만).
 *
 * 어댑터(listAlerts · listFires)가 원장 행에 ops 필드를 덧붙여 낸다(포트 모양은 그대로 — Alert·Fire 의 자유 필드):
 *   경보 ops: { log: 첫 이력(위성 감지) · unread: 처음 미읽음 역할 · passes: 감지 근거 센서별 마지막 통과 }
 *   불   ops: { villages: 반경 2 km 마을(결정적) · points: 이 불 관측 점의 신뢰도 등급 · fixed: 지난 3일 고정·해상 열원 }
 *
 * - 마을: 목업 EM.villagesOf(rng "vil:" + 불 id) 그대로.
 * - 관측 점 신뢰도: 목업 EM.hotspots 의 「현재 불」 점 생성(rng "hsf:" + 불 id) 순서 그대로 — 감지 근거 신뢰도 거르기가 센다.
 * - 고정·해상 열원: 목업 FIXED_HEAT(rng "hsx:" + 자리 + 날짜) 그대로 — 감지 근거 「제외」 칸.
 * - 통과 시각: 목업 궤도 계산(EM.passes — TLE·궤적 반복)은 프런트에 아직 없다. 목업이 원장 시나리오(2026-11-11 14:20)에서 낸 값을
 *   원장 값으로 옮겨 둔다(2026-11-14 aibox 목업 탐침으로 읽음). 시나리오가 바뀌면 다시 읽는다.
 */
import type { Alert, Fire } from "../../agency/port";

/* ── 결정적 난수(목업 core.js hash · rng · gauss 그대로) ── */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed: string | number): () => number {
  let a = typeof seed === "string" ? hash(seed) : seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(r: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ── 마을(목업 EM.villagesOf) ── */
const VILLAGE_POOL = ["묵계리", "용계리", "길송리", "대사리", "구수리", "천지리", "고란리", "금곡리", "현하리", "송사리"];
export interface Village {
  /** 원장 원문(한국어) — 화면이 사전 data.village.<원문> 으로 옮긴다 */
  name: string;
  homes: number;
  /** 지도 자리(목업 ops.js vilPos: 첫 마을은 확산 쪽, 나머지는 고르게 · 불에서 0.9–1.8 km) */
  lat: number;
  lon: number;
}
const DIRS: Record<string, number> = { 북: 0, 북동: 45, 동: 90, 남동: 135, 남: 180, 남서: 225, 서: 270, 북서: 315 };
export function villagesOf(f: Pick<Fire, "id" | "name" | "lat" | "lon"> & { spread?: unknown }): Village[] {
  const R = rng(`vil:${f.id}`);
  const n = f.id === "F-261111-03" ? 2 : 1 + Math.floor(R() * 3);
  const pool = VILLAGE_POOL.slice();
  const out: string[] = [];
  if (String(f.name).includes("묵계리")) {
    out.push("묵계리");
    pool.splice(0, 1);
  }
  while (out.length < n) out.push(pool.splice(Math.floor(R() * pool.length), 1)[0] ?? "");
  const vs = out.map((name) => ({ name, homes: 24 + Math.floor(R() * 70) }));
  const P = rng(`vilpos:${f.id}`);
  const sp = typeof f.spread === "string" ? DIRS[f.spread] : undefined;
  const kx = Math.cos((f.lat * Math.PI) / 180);
  return vs.map((v, i) => {
    const deg = ((sp != null && i === 0 ? sp + 18 : sp != null ? sp + 75 + (i - 1) * 50 + P() * 25 : P() * 360) * Math.PI) / 180;
    const km = 0.9 + P() * 0.9;
    return { ...v, lat: f.lat + (Math.cos(deg) * km) / 111, lon: f.lon + (Math.sin(deg) * km) / (111 * kx) };
  });
}

/* ── 관측 점 신뢰도 등급(목업 EM.hotspots 현재 불 점) ── */
export type ConfClass = "low" | "nominal" | "high";
const modisClass = (n: number): ConfClass => (n < 30 ? "low" : n < 80 ? "nominal" : "high");
export function firePoints(f: Pick<Fire, "id" | "viirs" | "modis">): { viirs: ConfClass[]; modis: ConfClass[] } {
  const Rf = rng(`hsf:${f.id}`);
  const viirs: ConfClass[] = [];
  const modis: ConfClass[] = [];
  for (let i = 0; i < f.viirs; i++) {
    Rf(); // 방위
    gauss(Rf); // 거리
    Rf(); // FRP
    viirs.push(Rf() < 0.8 ? "nominal" : "high");
  }
  for (let i = 0; i < f.modis; i++) {
    Rf();
    gauss(Rf);
    Rf();
    modis.push(modisClass(60 + Math.floor(Rf() * 40)));
  }
  return { viirs, modis };
}

/* ── 고정·해상 열원(목업 FIXED_HEAT, type 2·3) ── */
const FIXED_HEAT = [
  { id: "andong-ind", region: "andong", p: 0.1, type: 2 },
  { id: "yeongju-ind", region: "yeongju", p: 0.08, type: 2 },
  { id: "sangju-ind", region: "sangju", p: 0.08, type: 2 },
  { id: "uiseong-ind", region: "uiseong", p: 0.06, type: 2 },
  { id: "yeongdeok-sea", region: "yeongdeok", p: 0.004, type: 3 },
  { id: "uljin-sea", region: "uljin", p: 0.004, type: 3 },
] as const;
export interface FixedPoint {
  type: 2 | 3;
  conf: ConfClass;
  date: string;
}
const addDay = (d: string, k: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + k);
  return t.toISOString().slice(0, 10);
};
/** 지난 3일(오늘 − 3 … 오늘) 그 불 시군 안의 고정·해상 열원 점(VIIRS 시대 — 목업 2026 시나리오) */
export function fixedPoints(regions: string[], today: string): FixedPoint[] {
  const out: FixedPoint[] = [];
  for (let k = -3; k <= 0; k++) {
    const date = addDay(today, k);
    FIXED_HEAT.forEach((s) => {
      if (!regions.includes(s.region)) return;
      const Rx = rng(`hsx:${s.id}:${date}`);
      if (Rx() >= s.p) return;
      gauss(Rx); // 위도
      gauss(Rx); // 경도
      Rx(); // FRP
      out.push({ type: s.type, conf: Rx() < 0.75 ? "nominal" : "low", date });
    });
  }
  return out;
}

/* ── 통과(목업 EM.passes 결과, 위 머리 주석) — 경보 시각까지의 센서별 마지막 통과 ── */
export interface PassRow {
  sat: string;
  sensor: "VIIRS" | "MODIS";
  /** UTC ISO */
  at: string;
}
const PASSES: Record<string, PassRow[]> = {
  "A-0413": [
    { sat: "NOAA-21", sensor: "VIIRS", at: "2026-11-11T05:06:00Z" },
    { sat: "Terra", sensor: "MODIS", at: "2026-11-10T23:48:00Z" },
  ],
  "A-0412": [
    { sat: "NOAA-20", sensor: "VIIRS", at: "2026-11-11T04:23:00Z" },
    { sat: "Terra", sensor: "MODIS", at: "2026-11-10T23:48:00Z" },
  ],
  "A-0409": [
    { sat: "S-NPP", sensor: "VIIRS", at: "2026-11-10T18:23:00Z" },
    { sat: "Terra", sensor: "MODIS", at: "2026-11-10T23:48:00Z" },
  ],
  "A-0405": [
    { sat: "S-NPP", sensor: "VIIRS", at: "2026-11-10T18:23:00Z" },
    { sat: "Terra", sensor: "MODIS", at: "2026-11-10T23:48:00Z" },
  ],
  "A-0398": [
    { sat: "S-NPP", sensor: "VIIRS", at: "2026-11-09T18:41:00Z" },
    { sat: "Terra", sensor: "MODIS", at: "2026-11-10T00:47:00Z" },
  ],
};

/** 처음 미읽음(목업 mock/agency.js): 길안면 불의 두 경보 — 긴급대응·소방 둘 다 */
const UNREAD0 = ["A-0413", "A-0412"];
/** 피해 면적 담당 처음 미읽음(목업 EM.state.unread.land.add("A-0405")) */
const UNREAD0_LAND = ["A-0405"];
/** 출동 귀소 자리(목업 OPS.home): 원장 좌표, 인접 지역대 D 는 청사(지금은 현장에 나가 있다) */
const HOME_OVERRIDE: Record<string, { lat: number; lon: number }> = { "U-04": { lat: 36.404, lon: 128.792 } };

export interface OpsAlertMeta {
  log: { at: string; by: "satellite"; text: "title" }[];
  unread: string[];
  passes: PassRow[];
}
export interface OpsFireMeta {
  villages: Village[];
  points: { viirs: ConfClass[]; modis: ConfClass[] };
  fixed: FixedPoint[];
}

/** 경보 행 + ops 필드 */
export function opsAlerts(alerts: Alert[]): Alert[] {
  return alerts.map((a) => ({
    ...a,
    ops: {
      log: [{ at: a.at, by: "satellite", text: "title" }],
      unread: [...(UNREAD0.includes(a.id) ? a.targets.filter((r) => r === "responder" || r === "firefighter") : []), ...(UNREAD0_LAND.includes(a.id) && a.targets.includes("land") ? ["land"] : [])],
      passes: PASSES[a.id] ?? [],
    } satisfies OpsAlertMeta,
  }));
}

/** 불 행 + ops 필드(과거 재구성 불은 덧붙이지 않는다 — ops 지도·수신함 밖) */
export function opsFires(fires: Fire[], today: string): Fire[] {
  return fires.map((f) => {
    if (f.historical) return f;
    const regions = f.by_region && typeof f.by_region === "object" ? Object.keys(f.by_region) : [f.region];
    return {
      ...f,
      ops: { villages: villagesOf(f), points: firePoints(f), fixed: fixedPoints(regions, today) } satisfies OpsFireMeta,
    };
  });
}

/** 자원 귀소 자리 */
export const opsHome = (id: string, lat: number, lon: number) => HOME_OVERRIDE[id] ?? { lat, lon };
