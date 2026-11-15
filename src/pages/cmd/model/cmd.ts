/**
 * 지휘 통계(cmd) 화면 모델 — 목업 pages/cmd.js(조건 → 시군·달 통계 · 이상 달 추출 · 지도 점 · 시간대 분포 · 기간 다이얼)와
 * core.js 의 묶음 함수(aggCell · calendar · annual · analysis · ytdCompare · hourlyStats · 가장 활발한 30일)를 순수 함수로.
 * 데이터는 AgencyPort.getCommandStats(q).board 하나에서만 온다(목 생성기 = shared/mock/agency/cmd-board.ts). 값을 지어내지 않고 묶기만 한다.
 */
import type { CommandStats } from "@/shared/agency";

/* ── 묶음 모양(목 생성기와 같은 필드 — 포트는 자유 필드라 여기서 좁힌다) ── */
export interface Cm {
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
}
export interface Cells {
  modis: (number | null)[];
  viirs: (number | null)[];
  harm: (number | null)[];
  miss: (string | null)[];
  miss_s: (string[] | null)[];
}
export interface Day {
  date: string;
  dow: number;
  we: boolean;
  total: number | null;
  v: number[] | null;
  miss: string | null;
}
export interface Arrival {
  fire_id: string;
  min: number;
  real: boolean;
}
export interface Board {
  cm: Cm;
  kor: boolean;
  regions: { id: string; name: string; lat: number; lon: number; area_km2: number; ledger: boolean }[];
  cells: Record<string, Cells>;
  shocks: { year: number; month: number; regions: string[]; note: string }[];
  missing: { key: string; reason: string; sensors: string[] }[];
  slope: number;
  validation: { n_loo: number; mae_month: number | null; bias_pct: number | null };
  provenance: { method_version: string; data_version: string; updated_at: string };
  hourly: { source: "occur" | "sat"; sel: string[]; days: Day[] };
  response: {
    arr: Arrival[];
    med: number | null;
    from: string;
    by: Record<string, number>;
    total: number;
    busy: number;
    burn: { year: number; ha: number; n: number }[];
  } | null;
}

/** 포트 응답 → 묶음(모양이 다르면 null — 화면은 「불러오는 중」) */
export function readBoard(s: CommandStats | undefined): Board | null {
  const b = s?.board as Partial<Board> | undefined;
  if (!b || !b.cm || !b.cells || !Array.isArray(b.regions) || !b.hourly || !Array.isArray(b.hourly.days)) return null;
  return {
    cm: b.cm,
    kor: b.kor === true,
    regions: b.regions,
    cells: b.cells,
    shocks: Array.isArray(b.shocks) ? b.shocks : [],
    missing: Array.isArray(b.missing) ? b.missing : [],
    slope: typeof b.slope === "number" ? b.slope : 3,
    validation: b.validation ?? { n_loo: 0, mae_month: null, bias_pct: null },
    provenance: b.provenance ?? { method_version: "v1", data_version: "", updated_at: "" },
    hourly: b.hourly,
    response: b.response ?? null,
  };
}

export type Sensor = "harmonized" | "raw" | "modis" | "viirs";
export const SENSORS: Sensor[] = ["harmonized", "raw", "modis", "viirs"];
export type Season = "all" | "spring" | "summer" | "autumn" | "winter";
export const SEASON_MONTHS: Record<Season, number[]> = {
  all: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};
export interface Query {
  regions: string[];
  season: Season;
  sensor: Sensor;
  conf: number;
  frp: number;
  agri: boolean;
}

export const years = (cm: Cm) => Array.from({ length: cm.last_year - cm.first_year + 1 }, (_, i) => cm.first_year + i);
export const ix = (cm: Cm, y: number, m: number) => (y - cm.first_year) * 12 + (m - 1);
export const isFuture = (cm: Cm, y: number, m: number) => y > cm.last_year || (y === cm.last_year && m > cm.last_month) || y < cm.first_year;
export const isPartial = (cm: Cm, y: number, m: number) => y === cm.last_year && m === cm.last_month;
export const fracOf = (cm: Cm) => cm.last_day / cm.days_in_last_month;
export const ids = (b: Board, regions: string[]) => (regions.length ? regions : b.regions.map((r) => r.id));

/** 한 칸(지역·연·월)의 지표 값(raw = 2012년 이전 MODIS, 이후 VIIRS) */
export function cellVal(b: Board, r: string, y: number, m: number, s: Sensor): number | null {
  const c = b.cells[r];
  if (!c || isFuture(b.cm, y, m)) return null;
  const i = ix(b.cm, y, m);
  const pre = y < b.cm.viirs_start_year;
  const pick = { harmonized: c.harm, modis: c.modis, viirs: c.viirs, raw: pre ? c.modis : c.viirs }[s];
  return pick[i] ?? null;
}

/** 지역 묶음의 한 달 값. 한 지역이라도 결측이면 합계도 null(부분 합을 값처럼 보이지 않게) */
export function aggCell(b: Board, rs: string[], y: number, m: number, s: Sensor): { value: number | null; missing: string | null; future: boolean; zeroModis: number } {
  if (isFuture(b.cm, y, m)) return { value: null, missing: null, future: true, zeroModis: 0 };
  let sum = 0;
  let any = false;
  let zero = 0;
  for (const r of rs) {
    const c = b.cells[r];
    if (!c) continue;
    const v = cellVal(b, r, y, m, s);
    const miss = c.miss[ix(b.cm, y, m)];
    if (v == null) {
      if (miss && !(s === "viirs" && y < b.cm.viirs_start_year)) return { value: null, missing: miss, future: false, zeroModis: 0 };
      continue;
    }
    sum += v;
    any = true;
    if (y < b.cm.viirs_start_year && c.modis[ix(b.cm, y, m)] === 0) zero++;
  }
  return { value: any ? sum : null, missing: null, future: false, zeroModis: zero };
}

/* ── 분위수(R type 7) · 중앙값 ── */
export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const a = sorted[lo] ?? 0;
  const c = sorted[hi] ?? 0;
  return a + (c - a) * (h - lo);
}
export const median = (a: number[]) => quantile(a.slice().sort((x, y) => x - y), 0.5);

/* ── 캘린더(years-y): 연도 × 달 ── */
export interface CalRow {
  year: number;
  vals: (number | null)[];
  missing: (string | null)[];
  reasons: (string[] | null)[];
}
export interface Cal {
  years: number[];
  rows: CalRow[];
  max: number;
  sensor: Sensor;
}
export function calendar(b: Board, rs: string[], s: Sensor): Cal {
  const cm = b.cm;
  const rows = years(cm).map((y) => {
    const vals: (number | null)[] = [];
    const missing: (string | null)[] = [];
    const reasons: (string[] | null)[] = [];
    for (let m = 1; m <= 12; m++) {
      const a = aggCell(b, rs, y, m, s);
      vals.push(a.value);
      missing.push(a.missing);
      const why: string[] = [];
      if (a.missing) why.push("missing");
      if (!a.future && y < cm.viirs_start_year && s !== "viirs") {
        why.push("modis_only_period");
        if (a.value === 0) why.push("modis_only_small");
        else if (a.zeroModis) why.push("modis_zero_cells");
      }
      if (!a.future && s === "viirs" && y < cm.viirs_start_year) why.push("sensor_not_operating");
      if (isPartial(cm, y, m)) why.push("partial_month");
      reasons.push(a.future ? null : why);
    }
    return { year: y, vals, missing, reasons };
  });
  let max = 0;
  rows.forEach((r) => r.vals.forEach((v) => (max = v != null && v > max ? v : max)));
  return { years: years(cm), rows, max, sensor: s };
}

/* ── 연간 합계 ── */
export interface AnnualRow {
  year: number;
  modis: number;
  viirs: number | null;
  harmonized: number;
  raw: number;
  missing_months: number;
}
export function annual(b: Board, rs: string[]): AnnualRow[] {
  return years(b.cm).map((y) => {
    const t: AnnualRow = { year: y, modis: 0, viirs: y >= b.cm.viirs_start_year ? 0 : null, harmonized: 0, raw: 0, missing_months: 0 };
    for (let m = 1; m <= 12; m++)
      rs.forEach((r) => {
        const c = b.cells[r];
        if (!c || isFuture(b.cm, y, m)) return;
        const i = ix(b.cm, y, m);
        if (c.miss[i]) t.missing_months++;
        t.modis += c.modis[i] ?? 0;
        const vi = c.viirs[i];
        if (vi != null && t.viirs != null) t.viirs += vi;
        t.harmonized += c.harm[i] ?? 0;
        t.raw += (y < b.cm.viirs_start_year ? c.modis[i] : c.viirs[i]) ?? 0;
      });
    return t;
  });
}
export const annualOf = (rows: AnnualRow[], y: number, s: Sensor): number | null => {
  const a = rows.find((x) => x.year === y);
  return a ? a[s] : null;
};

/* ── 같은 달 비교(EM.analysis 의 쓰는 몫) ── */
export type AnaState = "comparable" | "limited" | "unavailable";
export interface Reason {
  code: string;
  severity: "block" | "limit" | "info";
  extra?: { key: string; params?: Record<string, string | number> } | string;
}
export const REASON_SEV: Record<string, Reason["severity"]> = {
  not_selected: "block",
  outside_support: "block",
  missing: "block",
  sensor_not_operating: "block",
  baseline_insufficient: "block",
  partial_month: "limit",
  baseline_short: "limit",
  median_zero: "limit",
  modis_only_small: "limit",
  baseline_modis_zero: "limit",
  baseline_missing: "info",
  modis_only_period: "info",
  modis_zero_cells: "info",
};
export interface Analysis {
  year: number;
  month: number;
  metric: "harmonized" | "modis" | "viirs";
  value: number | null;
  baseline: { n: number; from: number; to: number; median: number | null; p10: number | null; p90: number | null; missing_years: number };
  ratio: number | null;
  difference: number | null;
  state: AnaState;
  reasons: Reason[];
  partial: boolean;
  frac: number;
  missingKey: string | null;
}
export function analysis(b: Board, rs: string[], y: number, m: number, metric: "harmonized" | "modis" | "viirs"): Analysis {
  const cm = b.cm;
  const reasons: Reason[] = [];
  const add = (code: string, extra?: Reason["extra"]) => {
    if (!reasons.some((r) => r.code === code)) reasons.push({ code, severity: REASON_SEV[code] ?? "info", extra });
  };
  const partial = isPartial(cm, y, m);
  const frac = partial ? fracOf(cm) : 1;
  if (partial) add("partial_month", { key: "data.x.partial", params: { d: cm.last_day, n: cm.days_in_last_month } });
  const cur = aggCell(b, rs, y, m, metric);
  if (metric === "viirs" && y < cm.viirs_start_year) add("sensor_not_operating");
  else if (cur.value == null) add("missing");
  if (y < cm.viirs_start_year && metric !== "viirs") {
    add("modis_only_period", { key: "data.x.modis_month" });
    const mo = aggCell(b, rs, y, m, "modis");
    if (mo.value === 0) add("modis_only_small", { key: "data.x.modis_zero_sum" });
  }
  const vals: number[] = [];
  let missingYears = 0;
  let modisYears = 0;
  let modisZero = 0;
  for (let yy = cm.first_year; yy <= cm.last_year; yy++) {
    if (isFuture(cm, yy, m) || yy === y || yy < cm.baseline_from || yy > cm.baseline_to) continue;
    if (metric === "viirs" && yy < cm.viirs_start_year) continue;
    const a = aggCell(b, rs, yy, m, metric);
    if (a.value == null) {
      missingYears++;
      continue;
    }
    vals.push(a.value);
    if (yy < cm.viirs_start_year && metric !== "viirs") {
      modisYears++;
      if (a.value === 0) modisZero++;
    }
  }
  vals.sort((p, q) => p - q);
  const n = vals.length;
  const enough = n >= cm.min_unavailable;
  const base = { n, from: cm.baseline_from, to: cm.baseline_to, median: enough ? quantile(vals, 0.5) : null, p10: enough ? quantile(vals, 0.1) : null, p90: enough ? quantile(vals, 0.9) : null, missing_years: missingYears };
  if (!enough) add("baseline_insufficient", { key: "data.x.base_n", params: { n } });
  else if (n < cm.min_limited) add("baseline_short", { key: "data.x.base_n", params: { n } });
  if (missingYears) add("baseline_missing", { key: "data.x.miss_years", params: { n: missingYears } });
  if (modisYears) add("modis_only_period", { key: "data.x.modis_years", params: { n, k: modisYears } });
  if (enough && modisZero * 3 >= n) add("baseline_modis_zero", { key: "data.x.of_years", params: { n, k: modisZero } });
  const v = cur.value;
  const medCmp = base.median == null ? null : base.median * frac;
  let ratio: number | null = null;
  let difference: number | null = null;
  if (v != null && medCmp != null) {
    difference = v - medCmp;
    if (medCmp > 0) ratio = v / medCmp;
    else add("median_zero");
  }
  const sev = (s: Reason["severity"]) => reasons.some((r) => r.severity === s);
  const state: AnaState = v == null || sev("block") ? "unavailable" : sev("limit") ? "limited" : "comparable";
  if (state === "unavailable") {
    ratio = null;
    difference = null;
  }
  return { year: y, month: m, metric, value: v, baseline: base, ratio, difference, state, reasons, partial, frac, missingKey: cur.missing };
}
export const metricOf = (s: Sensor, y: number, cm: Cm): "harmonized" | "modis" | "viirs" => (s === "raw" ? (y < cm.viirs_start_year ? "modis" : "viirs") : s);

/* ── 올해 누계 vs 예년(EM.ytdCompare) ── */
export function ytdCompare(b: Board, rs: string[], s: Sensor, Y: number, ann: AnnualRow[]) {
  const cm = b.cm;
  const bs = metricOf(s, Y, cm);
  const a0 = bs === "viirs" ? cm.viirs_start_year : cm.baseline_from;
  const a1 = cm.baseline_to;
  const value = annualOf(ann, Y, s);
  const partial = Y === cm.last_year;
  const FR = fracOf(cm);
  const sumTo = (row: CalRow) => {
    let t = 0;
    row.vals.forEach((v, i) => {
      if (v == null) return;
      if (!partial || i < cm.last_month - 1) t += v;
      else if (i === cm.last_month - 1) t += v * FR;
    });
    return t;
  };
  const rows = calendar(b, rs, bs).rows.filter((r) => r.year >= a0 && r.year <= a1 && r.year !== Y && !r.missing.some(Boolean));
  const xs = rows.map(sumTo).sort((p, q) => p - q);
  const med = quantile(xs, 0.5);
  const ratio = value != null && med ? value / med : null;
  return { value, med, ratio, n: rows.length, from: a0, to: a1, partial };
}

/* ── 이상 달 추출(목업 cmd.js prep · extract) ── */
const FARM: Record<string, number> = { yecheon: 0.9, sangju: 0.9, uiseong: 0.7, gunwi: 0.7, yeongju: 0.6, andong: 0.5 };
const AGRI_M = [0.1, 0.15, 0.35, 0.3, 0.05, 0, 0, 0, 0, 0.15, 0.3, 0.2];
type Series = { fv: (v: number) => number; at: (y: number) => { med: number; sd: number; n: number } };
export function prep(b: Board, q: Query) {
  const c = q.conf / 90;
  const kbC = 1 - 0.55 * Math.pow(c, 1.3);
  const keC = 1 - 0.25 * Math.pow(c, 1.3);
  const kbF = Math.exp(-q.frp / 14);
  const keF = Math.exp(-q.frp / 60);
  const memo: Record<string, Series> = {};
  const series = (r: string, m: number, s: "harmonized" | "modis" | "viirs"): Series => {
    const k = `${r}:${m}:${s}`;
    const hit = memo[k];
    if (hit) return hit;
    const list: { y: number; v: number }[] = [];
    for (let y = b.cm.baseline_from; y <= b.cm.baseline_to; y++) {
      const v = cellVal(b, r, y, m, s);
      if (v != null) list.push({ y, v });
    }
    const med0 = median(list.map((d) => d.v)) ?? 0;
    const kb = kbC * kbF * (q.agri ? 1 - (FARM[r] ?? 0.3) * (AGRI_M[m - 1] ?? 0) : 1);
    const ke = keC * keF;
    const fv = (v: number) => Math.min(v, med0) * kb + Math.max(0, v - med0) * ke;
    const at: Record<number, { med: number; sd: number; n: number }> = {};
    const out: Series = {
      fv,
      at(y) {
        const h = at[y];
        if (h) return h;
        const fb = list.filter((d) => d.y !== y).map((d) => fv(d.v));
        const md = median(fb) ?? 0;
        const mad = (median(fb.map((v) => Math.abs(v - md))) ?? 0) * 1.4826;
        const sd = Math.sqrt(fb.reduce((a, v) => a + (v - md) * (v - md), 0) / Math.max(1, fb.length - 1));
        return (at[y] = { med: md, sd: Math.max(0.8, mad || sd), n: fb.length });
      },
    };
    memo[k] = out;
    return out;
  };
  return (r: string, m: number, y: number | null) => series(r, m, metricOf(q.sensor, y ?? b.cm.baseline_to, b.cm));
}
export interface AnomRow {
  r: string;
  y: number;
  m: number;
  v: number;
  med: number;
  n: number;
  ratio: number;
  z: number;
  partial: boolean;
}
export function extract(b: Board, q: Query): { rows: AnomRow[]; cand: number; skipped: number } {
  const stat = prep(b, q);
  const months = SEASON_MONTHS[q.season];
  const rows: AnomRow[] = [];
  let cand = 0;
  let skipped = 0;
  const FR = fracOf(b.cm);
  ids(b, q.regions).forEach((r) =>
    months.forEach((m) =>
      years(b.cm).forEach((y) => {
        const raw = cellVal(b, r, y, m, q.sensor);
        if (raw == null) return;
        const s = stat(r, m, y);
        const base = s.at(y);
        if (base.n < b.cm.min_unavailable) {
          skipped++;
          return;
        }
        cand++;
        const p = isPartial(b.cm, y, m);
        const v = s.fv(raw);
        const med = base.med * (p ? FR : 1);
        const sd = base.sd * (p ? Math.sqrt(FR) : 1);
        const ratio = med ? v / med : 0;
        const z = (v - med) / sd;
        if (ratio >= 2 && v >= 5) rows.push({ r, y, m, v, med, n: base.n, ratio, z, partial: p });
      }),
    ),
  );
  rows.sort((p, q2) => q2.z - p.z);
  return { rows, cand, skipped };
}
export const qKey = (q: Query) => JSON.stringify([q.regions.slice().sort(), q.season, q.sensor, q.conf, q.frp, q.agri]);

/* ── 결정적 난수(목업 core.js 그대로 — 지도 밀도 점 흩뿌림용, 값 아님) ── */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 지도 밀도 점(목업 heatPoints): 시군 안 하위 중심 3곳 + 대형 산불 달은 사건 기록 위치 쪽으로. 화선 좌표 아님 */
export interface HeatPt {
  lat: number;
  lon: number;
  frp: number;
}
export function heatPoints(b: Board, q: Query, year: number | null, hist: { lat: number; lon: number; detected_at: string }[]): HeatPt[] {
  const stat = prep(b, q);
  const months = SEASON_MONTHS[q.season];
  const ys = year ? [year] : years(b.cm);
  const plan: [string, number, number, number][] = [];
  let total = 0;
  ids(b, q.regions).forEach((r) =>
    ys.forEach((y) =>
      months.forEach((m) => {
        const raw = cellVal(b, r, y, m, q.sensor);
        if (raw == null) return;
        const n = stat(r, m, y).fv(raw) * (year ? 0.55 : 0.09);
        if (n > 0.3) {
          plan.push([r, y, m, n]);
          total += n;
        }
      }),
    ),
  );
  const k = total > 2600 ? 2600 / total : 1;
  const pts: HeatPt[] = [];
  const regOf = (r: string) => b.regions.find((x) => x.id === r);
  const spread = (r: string) => {
    const g = regOf(r);
    if (!g || g.ledger) return 1;
    return g.area_km2 ? Math.max(3, Math.min(40, Math.sqrt(g.area_km2) / 111 / 0.12)) : 3;
  };
  const subs: Record<string, { lat: number; lon: number; w: number; k: number }[]> = {};
  const subCenters = (r: string) => {
    const hit = subs[r];
    if (hit) return hit;
    const reg = regOf(r);
    const R = rng("cm-sub:" + r);
    const s = spread(r);
    return (subs[r] = [0, 1, 2].map(() => ({ lat: (reg?.lat ?? 0) + (R() - 0.5) * 0.14 * s, lon: (reg?.lon ?? 0) + (R() - 0.5) * 0.18 * s, w: 0.4 + R(), k: s })));
  };
  plan.forEach(([r, y, m, n]) => {
    const R = rng(`cm-pt:${r}:${y}:${m}`);
    const sc = subCenters(r);
    const sh = b.shocks.find((s) => s.year === y && s.month === m && s.regions.includes(r));
    const h = sh ? hist.find((f) => +f.detected_at.slice(0, 4) === y) : undefined;
    const cnt = Math.round(n * k + R() * 0.6);
    const wsum = sc.reduce((s, c) => s + c.w, 0);
    const reg = regOf(r);
    for (let i = 0; i < cnt; i++) {
      let lat: number;
      let lon: number;
      if (h && reg && R() < 0.65) {
        lat = h.lat * 0.55 + reg.lat * 0.45 + gauss(R) * 0.035;
        lon = h.lon * 0.55 + reg.lon * 0.45 + gauss(R) * 0.045;
      } else {
        let t = R() * wsum;
        let c = sc[0];
        for (const s of sc) {
          t -= s.w;
          if (t <= 0) {
            c = s;
            break;
          }
        }
        lat = (c?.lat ?? 0) + gauss(R) * 0.032 * (c?.k ?? 1);
        lon = (c?.lon ?? 0) + gauss(R) * 0.042 * (c?.k ?? 1);
      }
      pts.push({ lat, lon, frp: Math.max(q.frp, 1) + Math.pow(R(), 2) * (sh ? 220 : 35) });
    }
  });
  return pts;
}

/* ── 시간대별 분포 ── */
export interface HourStat {
  h: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
  n: number;
}
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
export function hourlyStats(days: Day[]): HourStat[] {
  const ok = days.filter((d) => d.v);
  return Array.from({ length: 24 }, (_, h) => {
    const a = ok.map((d) => d.v?.[h] ?? 0).sort((x, y) => x - y);
    return { h, min: a.length ? (a[0] ?? null) : null, p25: r1(quantile(a, 0.25)), median: r1(quantile(a, 0.5)), p75: r1(quantile(a, 0.75)), max: a.length ? (a[a.length - 1] ?? null) : null, n: a.length };
  });
}
export const meanOf = (days: Day[]) => Array.from({ length: 24 }, (_, h) => (days.length ? days.reduce((t, d) => t + (d.v ? (d.v[h] ?? 0) : 0), 0) / days.length : null));
/** 가장 활발한 30일: 최근 365일 안에서 일 합계가 가장 큰 연속 30일(결측 낀 창은 건너뜀, 같으면 최근 쪽) → [a, b] 인덱스 */
export function busiest(days: Day[], W = 30, within = 365): [number, number] {
  const N = days.length;
  const lo = Math.max(0, N - within);
  let best = -1;
  let bi = N - 1;
  let sum = 0;
  let miss = 0;
  for (let i = lo; i < N; i++) {
    const d = days[i];
    if (d?.total == null) miss++;
    else sum += d.total;
    if (i - W >= lo) {
      const o = days[i - W];
      if (o?.total == null) miss--;
      else sum -= o.total;
    }
    if (i - lo >= W - 1 && !miss && sum >= best) {
      best = sum;
      bi = i;
    }
  }
  return [Math.max(0, bi - W + 1), bi];
}
export interface Peak {
  h: number;
  val: number;
  med: number | null;
}
/** 피크 = 시각별 평균이 가장 큰 시각(동률이면 중앙값이 큰 쪽 → 이른 시각) */
export function peakOf(st: HourStat[], mean: (number | null)[] | null): Peak | null {
  if (!mean || !st.some((x) => x.n)) return null;
  let h = -1;
  st.forEach((x, i) => {
    const mi = mean[i];
    if (!x.n || mi == null) return;
    const mh = h >= 0 ? (mean[h] ?? 0) : 0;
    if (h < 0 || mi > mh + 1e-12 || (Math.abs(mi - mh) <= 1e-12 && (x.median ?? 0) > (st[h]?.median ?? 0))) h = i;
  });
  if (h < 0 || (mean[h] ?? 0) <= 0) return { h: -1, val: 0, med: 0 };
  return { h, val: mean[h] ?? 0, med: st[h]?.median ?? null };
}
export const medTotal = (days: Day[]) => quantile(days.map((d) => d.total ?? 0).sort((x, y) => x - y), 0.5);

/** 다이얼 막대 묶음(일·주·월·분기·연) — 목업 hrBrush 의 묶음 규칙 */
export const UNITS = [
  { k: "day", per: 1 },
  { k: "week", per: 7 },
  { k: "month", per: 30.44 },
  { k: "quarter", per: 91.3 },
  { k: "year", per: 365.25 },
] as const;
export type UnitK = (typeof UNITS)[number]["k"];
const BIN_START: Record<UnitK, (d: Day) => boolean> = {
  day: () => true,
  week: (d) => d.dow === 1,
  month: (d) => d.date.slice(8, 10) === "01",
  quarter: (d) => d.date.slice(8, 10) === "01" && (+d.date.slice(5, 7) - 1) % 3 === 0,
  year: (d) => d.date.slice(5, 10) === "01-01",
};
export interface Bin {
  i0: number;
  i1: number;
  sum: number;
  inc: number;
  nx: number;
  miss: number;
}
export function binsOf(days: Day[], d0: number, d1: number, unit: UnitK, a: number, b: number, inDow: (d: Day) => boolean): Bin[] {
  const bins: Bin[] = [];
  let cur: Bin | null = null;
  for (let i = d0; i <= d1; i++) {
    const d = days[i];
    if (!d) continue;
    if (!cur || BIN_START[unit](d)) {
      cur = { i0: i, i1: i, sum: 0, inc: 0, nx: 0, miss: 0 };
      bins.push(cur);
    }
    cur.i1 = i;
    if (d.total == null) {
      cur.miss++;
      continue;
    }
    cur.sum += d.total;
    if (i >= a && i <= b) {
      if (inDow(d)) cur.inc += d.total;
      else cur.nx++;
    }
  }
  return bins;
}

/* ── 차트 공통(목업 charts.js) ── */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
export function ticks(max: number, n = 4) {
  const m = niceMax(max);
  const step = m / n;
  const out: number[] = [];
  for (let v = 0; v <= m + 1e-9; v += step) out.push(+v.toFixed(6));
  return { max: m, ticks: out };
}

/* ── 날짜 ── */
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const dParts = (s: string): [number, number, number] => [+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)];
/** 날짜 → days 인덱스(2001-01-01 부터 날수, 범위로 자름) */
export function dayIdx(days: Day[], date: string): number {
  const t0 = Date.UTC(2001, 0, 1);
  const [y, m, d] = dParts(date);
  const t = Date.UTC(y, m - 1, d);
  return Math.max(0, Math.min(days.length - 1, Math.round((t - t0) / 864e5)));
}
