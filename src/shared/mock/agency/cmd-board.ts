/**
 * 지휘 통계(cmd) 목 생성기 — 목업 data.js calendar_model(데모 생성기) · core.js 칸 생성(truth/gen · 1급 gGen)·일별 배분(EM.daily)·
 * 시간대 배분(EM.hourlyDays) · 보정 기울기·연도 제외 검증 요약(EM.validationReport 의 권역 월 합계 판) ·
 * mock/agency.js 첫 도착(EM.firstArrival · EM.etaMin) · 사건 기록 해마다 소실 면적(EM.fireRecords)을 옮겼다.
 * 결정적(같은 지역·연·월 → 같은 값). 값은 보여주기용 예시이고 실제 통계와 대조하지 않았다(결정 F4).
 *
 * ⚠ 격리 규칙(F5): 이 파일은 목 폴더 안에서만 쓰인다(어댑터 getCommandStats 가 부른다). 화면은 AgencyPort.getCommandStats 만 안다.
 * 포트 모양(CommandStats 자유 필드)을 바꾸지 않으려고 화면 묶음은 `board` 하나로 싣는다 — 읽는 쪽은 pages/cmd/model.
 */
import type { Alert, CommandQuery, Fire, Unit } from "../../agency/port";

/* ── 결정적 난수(목업 core.js hash·rng·gauss 그대로) ── */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ── 캘린더 모델(목업 data.js calendar_model — 데모 생성기 계수) ── */
export const CM: {
  first_year: number;
  last_year: number;
  last_month: number;
  last_day: number;
  days_in_last_month: number;
  viirs_start_year: number;
  baseline_from: number;
  baseline_to: number;
  min_limited: number;
  min_unavailable: number;
  base_per_region_month: number;
  season: number[];
  gen_ratio: number;
} = {
  first_year: 2001,
  last_year: 2026,
  last_month: 11,
  last_day: 11,
  days_in_last_month: 30,
  viirs_start_year: 2012,
  baseline_from: 2001,
  baseline_to: 2025,
  min_limited: 8,
  min_unavailable: 3,
  base_per_region_month: 1.5, // 목업 data.js 는 7.5 — 목업 화면은 지난 달을 release 값으로 덮어 그보다 작다. 화면 크기를 목업 화면에 맞춘 보여주기 계수
  season: [0.55, 0.85, 1.95, 1.6, 0.7, 0.25, 0.1, 0.1, 0.15, 0.45, 0.75, 0.55],
  gen_ratio: 3.01,
};
const MISSING = [
  { year: 2003, month: 11, sensors: ["MODIS"], reason: "아카이브 공백" },
  { year: 2008, month: 3, sensors: ["MODIS"], reason: "수신 장애로 표준 처리 자료 없음" },
  { year: 2016, month: 7, sensors: ["VIIRS"], reason: "재처리 대기" },
] as const;
const SHOCKS: { year: number; month: number; factor: number; regions: string[]; days: [number, number] | null; note: string }[] = [
  { year: 2025, month: 3, factor: 110, regions: ["uiseong", "andong", "cheongsong", "yeongyang", "yeongdeok"], days: [22, 30], note: "의성·안동 대형산불" },
  { year: 2020, month: 4, factor: 3.4, regions: ["andong"], days: [24, 26], note: "안동 풍천면 산불" },
  { year: 2022, month: 3, factor: 40, regions: ["uljin", "bonghwa", "yeongdeok"], days: null, note: "동해안 산불 영향" },
  { year: 2017, month: 5, factor: 2.2, regions: ["sangju", "uiseong"], days: null, note: "봄 가뭄" },
  { year: 2009, month: 3, factor: 2.0, regions: ["andong", "yecheon"], days: null, note: "안동·예천 봄 산불" },
];
/** 판 정보(목업 provenance 몫 — 보여주기용) */
const PROV = { method_version: "v0.3", data_version: "v1.1" };

const N_MONTHS = (CM.last_year - CM.first_year) * 12 + CM.last_month;
const idx = (y: number, m: number) => (y - CM.first_year) * 12 + (m - 1);
const pad2 = (n: number) => String(n).padStart(2, "0");
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

interface Ledger {
  today: string;
  now: string;
  regions: { id: string; name: string; lat: number; lon: number; w: number }[];
  fire_records_meta?: { coverage?: { start: string; end: string } };
}

/* ── 지역 ── */
interface Reg {
  id: string;
  lat: number;
  lon: number;
  area_km2: number;
  w: number;
  ledger: boolean;
  band: Band;
  iso3: string;
}
type Band = "equatorial" | "tropical" | "subtropical" | "temperate" | "boreal" | "arid";
const BANDS: Record<Band, { rho: number; N?: [number, number, number][]; S?: [number, number, number][]; ratio: number }> = {
  equatorial: { rho: 35, N: [[2, 1.3, 1]], S: [[9, 1.3, 1]], ratio: 4.5 },
  tropical: { rho: 60, N: [[3, 1.2, 1]], S: [[9, 1.2, 1]], ratio: 4.0 },
  subtropical: { rho: 12, N: [[4, 1.0, 0.6], [8, 1.2, 0.4]], S: [[1, 1.5, 1]], ratio: 3.2 },
  temperate: { rho: 6, N: [[4, 0.9, 0.5], [8, 1.0, 0.5]], S: [[2, 1.3, 1]], ratio: 2.8 },
  boreal: { rho: 4, N: [[7, 1.0, 1]], S: [[1, 1.0, 1]], ratio: 2.2 },
  arid: { rho: 0.3, ratio: 3.0 },
};
const ARID: Record<string, true | ((lat: number) => boolean)> = {
  EGY: true, LBY: true, SAU: true, ARE: true, OMN: true, QAT: true, KWT: true, BHR: true, ESH: true, GRL: true, ATF: true, SJM: true, TKM: true,
  DZA: (l) => l < 33, MRT: (l) => l > 17, NER: (l) => l > 15.5, TCD: (l) => l > 16, MLI: (l) => l > 17, SDN: (l) => l > 16, YEM: (l) => l > 15.5,
  JOR: (l) => l < 31.5, IRQ: (l) => l < 32, MNG: (l) => l < 45,
};
function bandOf(lat: number, iso3: string): Band {
  const a = Math.abs(lat);
  const AR = ARID[iso3];
  if (AR === true || (typeof AR === "function" && AR(lat))) return "arid";
  return a < 10 ? "equatorial" : a < 25 ? "tropical" : a < 40 ? "subtropical" : a < 55 ? "temperate" : "boreal";
}
const seasonMemo = new Map<string, number[]>();
function seasonOf(band: Band, lat: number): number[] {
  const latBand = band === "arid" ? bandOf(lat, "") : band;
  const key = band + (lat < 0 ? "S" : "N") + (band === "arid" ? latBand : "");
  const hit = seasonMemo.get(key);
  if (hit) return hit;
  const B = BANDS[latBand];
  const pk = (lat < 0 ? B.S : B.N) ?? [];
  const v: number[] = [];
  for (let m = 1; m <= 12; m++) {
    let x = 0.08;
    pk.forEach(([p, sg, amp]) => {
      let d = Math.abs(m - p);
      d = Math.min(d, 12 - d);
      x += amp * Math.exp(-(d * d) / (2 * sg * sg));
    });
    v.push(x);
  }
  const mean = v.reduce((a, b) => a + b, 0) / 12;
  const out = v.map((x) => x / mean);
  seasonMemo.set(key, out);
  return out;
}

/* ── 경북 원장 시군(목업 truth/gen 그대로) ── */
function truth(r: Reg, y: number, m: number): number {
  const R = rng(r.id + ":" + y + ":" + m);
  let v = CM.base_per_region_month * r.w * (CM.season[m - 1] ?? 1) * (0.82 + 0.013 * (y - 2001));
  v *= Math.exp(gauss(R) * 0.33);
  SHOCKS.forEach((s) => {
    if (s.year === y && s.month === m && (s.regions as readonly string[]).includes(r.id)) v *= s.factor;
  });
  if (y === CM.last_year && m === CM.last_month) v *= CM.last_day / CM.days_in_last_month;
  return v;
}
function genKor(r: Reg, y: number, m: number) {
  const T = truth(r, y, m);
  const R2 = rng("s:" + r.id + ":" + y + ":" + m);
  const modis = Math.max(0, Math.round((T / CM.gen_ratio) * Math.exp(gauss(R2) * 0.14)));
  const viirs = y >= CM.viirs_start_year ? Math.max(0, Math.round(T * Math.exp(gauss(R2) * 0.07))) : null;
  return { modis, viirs };
}

/* ── 한국 밖 1급(목업 gGen 그대로: 띠·계절·추세·충격·비율) ── */
const shockMemo = new Map<string, { year: number; month: number; factor: number }[]>();
function shocksOf(r: Reg) {
  const hit = shockMemo.get(r.id);
  if (hit) return hit;
  const R = rng("shock:" + r.id);
  const n = Math.floor(R() * 3);
  const S = seasonOf(r.band, r.lat);
  let pm = 0;
  S.forEach((x, i) => {
    if (x > (S[pm] ?? 0)) pm = i;
  });
  const out: { year: number; month: number; factor: number }[] = [];
  for (let i = 0; i < n; i++)
    out.push({
      year: CM.first_year + Math.floor(R() * (CM.baseline_to - CM.first_year + 1)),
      month: ((pm + Math.round((R() - 0.5) * 2) + 12) % 12) + 1,
      factor: 2 + R() * 4,
    });
  shockMemo.set(r.id, out);
  return out;
}
function trendAt(iso3: string, y: number): number {
  const R = rng("trend:" + iso3);
  const t = { a: 0.002 + R() * 0.018, b: (R() - 0.4) * 0.22, c: (R() - 0.45) * 0.3, sd: 0.1 + R() * 0.16 };
  return Math.max(0.35, 0.85 + t.a * (y - 2001) + (y >= 2018 ? t.b : 0) + (y >= 2023 ? t.c : 0)) * Math.exp(t.sd * gauss(rng("yr:" + iso3 + ":" + y)));
}
function genRatio(r: Reg, y: number): number {
  return BANDS[r.band].ratio * Math.exp(0.1 * gauss(rng("ratio:" + r.iso3)) + 0.06 * gauss(rng("rr:" + r.id)) + 0.05 * gauss(rng("ry:" + r.iso3 + ":" + y)));
}
function genAdm1(r: Reg, y: number, m: number) {
  const B = BANDS[r.band];
  const f = Math.exp(0.6 * gauss(rng("rho:" + r.id)));
  let T = (r.area_km2 / 1000) * (B.rho / 12) * f * (seasonOf(r.band, r.lat)[m - 1] ?? 1) * trendAt(r.iso3, y) * Math.exp(0.35 * gauss(rng("t:" + r.id + ":" + y + ":" + m)));
  shocksOf(r).forEach((s) => {
    if (s.year === y && s.month === m) T *= s.factor;
  });
  if (y === CM.last_year && m === CM.last_month) T *= CM.last_day / CM.days_in_last_month;
  const R2 = rng("s:" + r.id + ":" + y + ":" + m);
  const ratio = genRatio(r, y);
  const modis = Math.max(0, Math.round((T / ratio) * Math.exp(gauss(R2) * 0.14)));
  const viirs = y >= CM.viirs_start_year ? Math.max(0, Math.round(T * Math.exp(gauss(R2) * 0.07))) : null;
  return { modis, viirs };
}

/* ── 칸 ── */
export interface CmdCells {
  modis: (number | null)[];
  viirs: (number | null)[];
  harm: (number | null)[];
  /** 결측 표지: 결측 원장 키(예 "2003-11") — 이유 문구는 board.missing */
  miss: (string | null)[];
  /** 결측 센서(MODIS · VIIRS) */
  miss_s: (string[] | null)[];
}

function cellsOf(regs: Reg[], fires: Fire[], kor: boolean): { cells: Record<string, CmdCells>; slope: number } {
  const raw: Record<string, { modis: number[]; viirs: (number | null)[] }> = {};
  regs.forEach((r) => {
    const modis: number[] = [];
    const viirs: (number | null)[] = [];
    for (let i = 0; i < N_MONTHS; i++) {
      const y = CM.first_year + Math.floor(i / 12);
      const m = (i % 12) + 1;
      const g = kor ? genKor(r, y, m) : genAdm1(r, y, m);
      if (kor && y === CM.last_year && m === CM.last_month) {
        /* 진행 중인 달: 원장의 현재 불이 본 핫스팟을 더한다(목업 liveFires) */
        liveFires(fires, r.id).forEach((f) => {
          g.modis += f.modis || 0;
          if (g.viirs != null) g.viirs += f.viirs || 0;
        });
      }
      modis.push(g.modis);
      viirs.push(g.viirs);
    }
    raw[r.id] = { modis, viirs };
  });
  const missOf = (y: number, m: number) => (kor ? MISSING.filter((x) => x.year === y && x.month === m) : []);
  /* 보정 기울기: 중첩기(2012–2025) ΣVIIRS / ΣMODIS(결측 쌍 제외) */
  let sm = 0;
  let sv = 0;
  for (let y = CM.viirs_start_year; y <= CM.baseline_to; y++)
    for (let m = 1; m <= 12; m++) {
      if (missOf(y, m).length) continue;
      regs.forEach((r) => {
        const c = raw[r.id];
        if (!c) return;
        sm += c.modis[idx(y, m)] ?? 0;
        sv += c.viirs[idx(y, m)] ?? 0;
      });
    }
  const slope = sm ? Math.round((sv / sm) * 1000) / 1000 : 3;
  const cells: Record<string, CmdCells> = {};
  regs.forEach((r) => {
    const c = raw[r.id];
    if (!c) return;
    const out: CmdCells = { modis: [], viirs: [], harm: [], miss: [], miss_s: [] };
    for (let i = 0; i < N_MONTHS; i++) {
      const y = CM.first_year + Math.floor(i / 12);
      const m = (i % 12) + 1;
      const ms = missOf(y, m);
      const sens = ms.flatMap((x) => x.sensors as readonly string[]);
      const pre = y < CM.viirs_start_year;
      const modis = sens.includes("MODIS") ? null : (c.modis[i] ?? 0);
      const viirs = pre || sens.includes("VIIRS") ? null : (c.viirs[i] ?? null);
      out.modis.push(modis);
      out.viirs.push(viirs);
      out.harm.push(pre ? (modis == null ? null : Math.round(modis * slope)) : viirs);
      out.miss.push(ms[0] ? `${ms[0].year}-${ms[0].month}` : null);
      out.miss_s.push(sens.length ? sens : null);
    }
    cells[r.id] = out;
  });
  return { cells, slope };
}

function liveFires(fires: Fire[], rid: string) {
  const key = `${CM.last_year}-${pad2(CM.last_month)}`;
  return fires.filter((f) => !f.historical && f.region === rid && f.detected_at.slice(0, 7) === key && +f.detected_at.slice(8, 10) <= CM.last_day);
}

/* ── 검증 요약(권역 월 합계 · 연도 하나씩 빼고 기울기 재추정) ── */
function validationOf(regs: Reg[], cells: Record<string, CmdCells>) {
  const SM: Record<number, number> = {};
  const SV: Record<number, number> = {};
  const months: { y: number; modis: number; viirs: number }[] = [];
  let tm = 0;
  let tv = 0;
  for (let y = CM.viirs_start_year; y <= CM.baseline_to; y++) {
    SM[y] = 0;
    SV[y] = 0;
    for (let m = 1; m <= 12; m++) {
      let am = 0;
      let av = 0;
      let full = true;
      regs.forEach((r) => {
        const c = cells[r.id];
        const mo = c?.modis[idx(y, m)];
        const vi = c?.viirs[idx(y, m)];
        if (mo == null || vi == null) {
          full = false;
          return;
        }
        am += mo;
        av += vi;
        SM[y] = (SM[y] ?? 0) + mo;
        SV[y] = (SV[y] ?? 0) + vi;
      });
      if (full) months.push({ y, modis: am, viirs: av });
    }
    tm += SM[y] ?? 0;
    tv += SV[y] ?? 0;
  }
  let ae = 0;
  let pe = 0;
  let act = 0;
  months.forEach((p) => {
    const k = (tv - (SV[p.y] ?? 0)) / (tm - (SM[p.y] ?? 0) || 1);
    const pr = k * p.modis;
    ae += Math.abs(pr - p.viirs);
    pe += pr - p.viirs;
    act += p.viirs;
  });
  return {
    n_loo: CM.baseline_to - CM.viirs_start_year + 1,
    mae_month: months.length ? Math.round((ae / months.length) * 10) / 10 : null,
    bias_pct: act ? Math.round(((100 * pe) / act) * 10) / 10 : null,
  };
}

/* ── 일별 배분(목업 EM.daily) → 시간대 배분(EM.hourlyDays) ── */
const PASS: Record<"VIIRS" | "MODIS", [number, number][]> = {
  VIIRS: [
    [1, 0.27],
    [13, 0.73],
  ],
  MODIS: [
    [1, 0.17],
    [10, 0.29],
    [13, 0.41],
    [22, 0.13],
  ],
};
function largestRemainder(total: number, w: number[]): number[] {
  const ws = w.reduce((a, b) => a + b, 0);
  const v = new Array<number>(w.length).fill(0);
  if (!total || !ws) return v;
  const raw = w.map((x) => (x / ws) * total);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  raw
    .map((x, i) => [x - (base[i] ?? 0), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => {
      if (left > 0) {
        base[i] = (base[i] ?? 0) + 1;
        left--;
      }
    });
  return base;
}
function occurWeights(date: string): number[] {
  const R = rng("hd:occur:" + date);
  const peak = Math.max(11.5, Math.min(15.5, 13.6 + gauss(R) * 0.75));
  const wid = 2.5 + R() * 0.9;
  const amp = 0.85 + R() * 0.3;
  const w: number[] = [];
  for (let h = 0; h < 24; h++) {
    const z = (h + 0.5 - peak) / wid;
    w.push((0.035 + amp * Math.exp(-0.5 * z * z) + (h >= 16 && h <= 19 ? 0.05 : 0)) * Math.exp(gauss(R) * 0.2));
  }
  return w;
}
function satWeights(date: string, sk: "VIIRS" | "MODIS"): number[] {
  const R = rng("hd:sat:" + sk + ":" + date);
  const w = new Array<number>(24).fill(0);
  PASS[sk].forEach(([h, p]) => {
    w[h] = p * Math.exp(gauss(R) * 0.18);
  });
  return w;
}

export interface CmdDay {
  date: string;
  dow: number;
  we: boolean;
  /** 그날 보정 지표 합계(null = 결측) */
  total: number | null;
  /** 시각 칸 24개(정수, Σ = total) */
  v: number[] | null;
  /** 결측 원장 키 */
  miss: string | null;
}

function dailyTotals(regs: Reg[], cells: Record<string, CmdCells>, fires: Fire[], sel: string[], kor: boolean) {
  const ids = sel.length ? regs.filter((r) => sel.includes(r.id)) : regs;
  const out: { date: string; value: number | null; miss: string | null }[] = [];
  for (let y = CM.first_year; y <= CM.last_year; y++)
    for (let m = 1; m <= 12; m++) {
      if (y === CM.last_year && m > CM.last_month) break;
      const nd = y === CM.last_year && m === CM.last_month ? CM.last_day : dim(y, m);
      const days = new Array<number>(nd).fill(0);
      const st = { miss: null as string | null };
      ids.forEach((r) => {
        const c = cells[r.id];
        const total = c?.harm[idx(y, m)];
        if (total == null) {
          st.miss = c?.miss[idx(y, m)] ?? "none";
          return;
        }
        const R = rng("d:" + r.id + ":" + y + ":" + m);
        const w: number[] = [];
        for (let d = 1; d <= nd; d++) w.push(0.4 + R() * R() * 2.2);
        if (kor)
          SHOCKS.forEach((s) => {
            if (s.year !== y || s.month !== m || !(s.regions as readonly string[]).includes(r.id)) return;
            const [a, b] = s.days ?? [1, nd];
            for (let d = a; d <= Math.min(b, nd); d++) w[d - 1] = (w[d - 1] ?? 0) + 9 * (1 - Math.abs(d - (a + b) / 2) / (b - a + 2));
          });
        const fixed = new Array<number>(nd).fill(0);
        if (kor) {
          const ym = `${y}-${pad2(m)}`;
          fires.forEach((f) => {
            if (f.region !== r.id || f.detected_at.slice(0, 7) !== ym) return;
            const d = +f.detected_at.slice(8, 10);
            if (d <= nd) w[d - 1] = (w[d - 1] ?? 0) + 4;
          });
          if (y === CM.last_year && m === CM.last_month)
            liveFires(fires, r.id).forEach((f) => {
              const d = +f.detected_at.slice(8, 10);
              const k = y < CM.viirs_start_year ? "modis" : "viirs";
              if (d <= nd) fixed[d - 1] = (fixed[d - 1] ?? 0) + (f[k] || 0);
            });
        }
        const rest = Math.max(0, total - fixed.reduce((a, b) => a + b, 0));
        const v = largestRemainder(rest, w);
        v.forEach((x, i) => {
          days[i] = (days[i] ?? 0) + x + (fixed[i] ?? 0);
        });
      });
      for (let d = 1; d <= nd; d++) out.push({ date: `${y}-${pad2(m)}-${pad2(d)}`, value: st.miss ? null : (days[d - 1] ?? 0), miss: st.miss });
    }
  return out;
}

function hourlyDays(totals: { date: string; value: number | null; miss: string | null }[], source: "occur" | "sat"): CmdDay[] {
  return totals.map((d) => {
    const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
    const base = { date: d.date, dow, we: dow === 0 || dow === 6 };
    if (d.value == null) return { ...base, total: null, v: null, miss: d.miss };
    const w = source === "occur" ? occurWeights(d.date) : satWeights(d.date, +d.date.slice(0, 4) < CM.viirs_start_year ? "MODIS" : "VIIRS");
    return { ...base, total: d.value, v: largestRemainder(d.value, w), miss: null };
  });
}

/* ── 대응 성과(목업 EM.firstArrival · etaMin · fireRecords) ── */
function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function etaMin(u: Unit, f: Fire): number {
  const d = distanceKm(u, f);
  const v = u.type === "heli" ? 200 : u.type === "crew" ? 35 : 45;
  return Math.max(2, Math.round(((d * (u.type === "heli" ? 1 : 1.35)) / v) * 60 + (u.type === "heli" ? 6 : 2)));
}
const SENT = ["dispatched", "onscene", "contained", "out"];
function responseOf(ledger: Ledger, fires: Fire[], units: Unit[], alerts: Alert[]) {
  const hm = (s: string | undefined) => {
    const m = /(\d{1,2}):(\d{2})/.exec(s ?? "");
    return m ? +(m[1] ?? 0) * 60 + +(m[2] ?? 0) : null;
  };
  const recs = fires.filter((f) => !f.historical);
  const sent = recs.filter((f) => SENT.includes(f.status) || units.some((u) => u.fire_id === f.id));
  const ready = units.filter((u) => u.status === "standby");
  const arr = sent
    .map((f) => {
      const det = hm(f.detected_at.slice(11));
      const today = f.detected_at.startsWith(ledger.today);
      const log = alerts.filter((a) => a.fire_id === f.id).flatMap((a) => (Array.isArray(a.log) ? (a.log as { at?: string; text?: string }[]) : []));
      const rep = log.find((l) => /^현장 도착/.test(l.text ?? ""));
      const at = hm(rep?.at);
      if (rep && today && det != null && at != null && at >= det) return { fire_id: f.id, min: at - det, real: true };
      const eta = ready.length ? Math.min(...ready.map((u) => etaMin(u, f))) : null;
      return { fire_id: f.id, min: eta, real: false };
    })
    .filter((x): x is { fire_id: string; min: number; real: boolean } => x.min != null);
  const ms = arr.map((x) => x.min).sort((a, b) => a - b);
  const med = ms.length ? (ms.length % 2 ? (ms[(ms.length - 1) / 2] ?? null) : ((ms[ms.length / 2 - 1] ?? 0) + (ms[ms.length / 2] ?? 0)) / 2) : null;
  const from = recs.reduce((m, f) => (f.detected_at < m ? f.detected_at : m), ledger.today + " 99").slice(0, 10);
  const by: Record<string, number> = { onscene: 0, enroute: 0, return: 0, standby: 0 };
  units.forEach((u) => {
    by[u.status] = (by[u.status] ?? 0) + 1;
  });
  /* 해마다 소실 면적: 기록 기간(fire_records_meta.coverage) 안 해마다 사건 수·면적 합 */
  const cov = ledger.fire_records_meta?.coverage ?? { start: `${CM.last_year}-01-01`, end: ledger.today };
  const burn: { year: number; ha: number; n: number }[] = [];
  for (let y = +cov.start.slice(0, 4); y <= CM.last_year; y++) {
    const s = `${y}-01-01` < cov.start ? cov.start : `${y}-01-01`;
    const e = `${y}-12-31` > cov.end ? cov.end : `${y}-12-31`;
    const rs = fires.filter((f) => {
      const d0 = f.detected_at.slice(0, 10);
      const d1 = (typeof f.contained_at === "string" ? f.contained_at : f.detected_at).slice(0, 10);
      return !(d1 < s || d0 > e);
    });
    burn.push({ year: y, ha: rs.reduce((t, f) => t + (typeof f.burned_ha === "number" ? f.burned_ha : 0), 0), n: rs.length });
  }
  return { arr, med, from, by, total: units.length, busy: (by.enroute ?? 0) + (by.onscene ?? 0), burn };
}

/* ── 묶음 ── */
export interface CmdBoard {
  cm: typeof CM;
  kor: boolean;
  regions: { id: string; name: string; lat: number; lon: number; area_km2: number; ledger: boolean }[];
  cells: Record<string, CmdCells>;
  shocks: { year: number; month: number; regions: string[]; note: string }[];
  missing: { key: string; reason: string; sensors: string[] }[];
  slope: number;
  validation: { n_loo: number; mae_month: number | null; bias_pct: number | null };
  provenance: { method_version: string; data_version: string; updated_at: string };
  hourly: { source: "occur" | "sat"; sel: string[]; days: CmdDay[] };
  response: ReturnType<typeof responseOf> | null;
}

/** 칸·검증은 나라(지역 묶음)마다 한 번 만든다(결정적이라 메모해도 값이 같다) */
const cellMemo = new Map<string, { cells: Record<string, CmdCells>; slope: number; validation: CmdBoard["validation"] }>();

export function cmdBoard(q: CommandQuery, ledger: Ledger, fires: Fire[], units: Unit[], alerts: Alert[]): CmdBoard {
  const kor = q.iso3 === "KOR";
  const regs: Reg[] = kor
    ? ledger.regions.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, area_km2: 0, w: r.w, ledger: true, band: "temperate" as Band, iso3: "KOR" }))
    : (q.regions ?? []).map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, area_km2: r.area_km2 || 0, w: 1, ledger: false, band: bandOf(r.lat, q.iso3), iso3: q.iso3 }));
  const ckey = kor ? `KOR|${fires.filter((f) => !f.historical).map((f) => f.id + f.viirs + f.modis).join(",")}` : `${q.iso3}|${regs.length}`;
  let memo = cellMemo.get(ckey);
  if (!memo) {
    const { cells, slope } = cellsOf(regs, fires, kor);
    memo = { cells, slope, validation: validationOf(regs, cells) };
    cellMemo.set(ckey, memo);
  }
  const sel = (q.sel ?? []).filter((id) => regs.some((r) => r.id === id));
  const source = q.hourly_source === "sat" ? "sat" : "occur";
  const days = hourlyDays(dailyTotals(regs, memo.cells, fires, sel, kor), source);
  return {
    cm: CM,
    kor,
    regions: kor
      ? ledger.regions.map((r) => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, area_km2: 0, ledger: true }))
      : regs.map((r) => ({ id: r.id, name: r.id, lat: r.lat, lon: r.lon, area_km2: r.area_km2, ledger: false })),
    cells: memo.cells,
    shocks: kor ? SHOCKS.map((s) => ({ year: s.year, month: s.month, regions: [...s.regions], note: s.note })) : [],
    missing: kor ? MISSING.map((x) => ({ key: `${x.year}-${x.month}`, reason: x.reason, sensors: [...x.sensors] })) : [],
    slope: memo.slope,
    validation: memo.validation,
    provenance: { ...PROV, updated_at: `${ledger.today} ${ledger.now}` },
    hourly: { source, sel, days },
    response: kor ? responseOf(ledger, fires, units, alerts) : null,
  };
}
