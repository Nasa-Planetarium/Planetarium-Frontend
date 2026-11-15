/**
 * ② 비교 분석 순수 모델(목업 pages/analysis.js 의 계산 없는 몫) — 화면·DOM 을 모른다.
 * 값은 release 그대로(A1·E1): 판정·백분위·배수는 /compare 값, 달 상태·출처는 /calendar 행. 화면이 하는 일은 고르기·늘어놓기뿐이다.
 * 경우 가르기(결측·범위 밖·운용 전…)는 core.caseOf → judgeMonth(E4, switch 없음).
 */
import { displayInterval, hasSpread } from "@/shared/lib/display";
import { caseOf, ymIso, ymKey, type CalendarData, type CalView, type MonthRow } from "./core";

export const STEPS = [1, 2, 3] as const;
export type Step = (typeof STEPS)[number];
export const isStep = (s: string | null): Step | null => (s === "1" || s === "2" || s === "3" ? (Number(s) as Step) : null);

/** release aoi_id 모양: KR · WORLD · 경북 북부 묶음 · 시도 · 시군구 · 나라 */
export const AOI_OK = (id: string | null | undefined) => /^(KR|WORLD|group:gb-north|SIDO_\d{2}|SGG_\d{5}|ADM0_[A-Z0-9]{3})$/.test(id ?? "");
export const GB_GROUP = "group:gb-north";
/** 한국 화면의 고정 단추(있는 것만): 경북 북부 묶음 · 경북 · 한국 */
export const KOR_AOIS = [GB_GROUP, "SIDO_47", "KR"] as const;
/** 기본 지역: 묶음이 목록에 있으면 묶음, 없으면(실서버 E1) 경북 */
export const defaultAoi = (has: (id: string) => boolean) => (has(GB_GROUP) ? GB_GROUP : "SIDO_47");

/** 고를 수 있는 달 = 진행 중·결측·범위 밖이 아닌 달(API-v3 §6.3) */
const BLOCKED = new Set(["partial", "missing", "out_of_range"]);
export const monthRec = (cal: CalendarData | null, y: number, m: number): MonthRow | null => cal?.months.find((r) => r.year === y && r.month === m) ?? null;
export const selectable = (cal: CalendarData | null, y: number, m: number) => {
  const r = monthRec(cal, y, m);
  return !!r && !BLOCKED.has(r.status ?? "out_of_range");
};

/** 지원 기간: first_month · 마지막 완결 달 · 진행 중 달 */
export function coverage(first: string | null | undefined, last: string | null | undefined, cal: CalendarData | null) {
  /* /aois 에 first_month·last_month 가 없으면(목 스냅숏) 캘린더 행의 범위 안 첫·끝 달 */
  const inR = (cal?.months ?? []).filter((r) => r.status && r.status !== "out_of_range");
  const r0 = inR[0];
  const r1 = inR[inR.length - 1];
  const f = first || (r0 ? ymIso(r0.year, r0.month) : "2000-11");
  const l = last || (r1 ? ymIso(r1.year, r1.month) : f);
  const lr = monthRec(cal, +l.slice(0, 4), +l.slice(5, 7));
  const part = lr?.status === "partial";
  const y = +l.slice(0, 4);
  const m = +l.slice(5, 7);
  const prev = m === 1 ? ymIso(y - 1, 12) : ymIso(y, m - 1);
  return { first_month: f, last_complete_month: part ? prev : l, partial_month: part ? l : null, as_of: part ? (lr?.as_of_date ?? null) : null };
}

/** value_source 구간(행 순서로 이어 붙임) — 지원 기간 띠·목록 */
export interface Regime {
  vs: string;
  from: string;
  to: string;
}
export function regimes(cal: CalendarData | null): Regime[] {
  const out: Regime[] = [];
  (cal?.months ?? []).forEach((r) => {
    if (!r.value_source || r.status === "partial") return;
    const ym = ymIso(r.year, r.month);
    const last = out[out.length - 1];
    if (last && last.vs === r.value_source) last.to = ym;
    else out.push({ vs: r.value_source, from: ym, to: ym });
  });
  return out;
}
/** 띠 모양(목업 VS_CLS): as = MODIS 추정 줄무늬 · va = S-NPP 실측 · af = NOAA-20·21 */
export const VS_TRACK: Record<string, "as" | "va" | "af"> = { modis_m2v_terra: "as", modis_m2v: "as", snpp_observed: "va", n20_bridge: "af", n21_bridge: "af" };
export const ymK = (s: string) => +s.slice(0, 4) * 12 + (+s.slice(5, 7) - 1);

/** 보기 한 칸: value 보기는 값·출처, 원자료 보기는 센서 값(출처 없음) — 경우는 judgeMonth */
export function viewCell(r: MonthRow | null, view: CalView) {
  if (!r) return null;
  const c = caseOf(r, view);
  return { value: c.value, status: c.st, value_source: view === "value" ? (r.value_source ?? null) : null, data_source: r.data_source ?? null, lo: c.lo, hi: c.hi };
}

export interface DistItem {
  year: number;
  value: number | null;
  state: "baseline" | "evaluated" | "missing";
  value_lo?: number | null;
  value_hi?: number | null;
}
/** /compare baseline[] → 분포 막대(기준에 든 해 · 결측 해 · 평가 해). 수염 = 화면 구간 displayInterval(F16, 폭이 있는 해만) */
export function distOf(
  c: { value: number | null; value_lo?: number | null; value_hi?: number | null; baseline?: { year: number; value: number | null; status?: string; used?: boolean }[] },
  y: number,
  lh: (yy: number) => { value_lo?: number | null; value_hi?: number | null },
): DistItem[] {
  if (!c.baseline) return [];
  const out: DistItem[] = [];
  c.baseline.forEach((b) => {
    if (b.used) out.push({ year: b.year, value: b.value, state: "baseline", ...lh(b.year) });
    else if (b.status === "missing") out.push({ year: b.year, value: null, state: "missing" });
  });
  const iv = displayInterval(c.value, c.value_lo, c.value_hi);
  out.push({ year: y, value: c.value, state: "evaluated", ...(hasSpread(iv) ? { value_lo: iv.lo, value_hi: iv.hi } : {}) });
  return out.sort((a, z) => a.year - z.year);
}
/** 원자료 보기 분포: 같은 달 각 해의 그 보기 값(기준 끝 해 뒤는 평가 해만) */
export function distRaw(cal: CalendarData, view: CalView, y: number, m: number, baseTo: number): DistItem[] {
  const ys = Array.from(new Set(cal.months.map((r) => r.year)));
  const out: DistItem[] = [];
  ys.forEach((yy) => {
    const k = viewCell(monthRec(cal, yy, m), view);
    if (!k || k.status === "out_of_range" || k.status === "before_sensor") return;
    if (yy > baseTo && yy !== y) return;
    out.push({ year: yy, value: k.value, state: yy === y ? "evaluated" : k.status === "missing" ? "missing" : "baseline" });
  });
  return out;
}

/** ⑥ 보정 전·후 시계열: 연 합계(12달 모두 값이 있는 해만) 또는 월별 */
export const STITCH = ymKey(2012, 2);
const getOf: Record<CalView, (r: MonthRow) => number | null | undefined> = {
  value: (r) => r.value,
  raw_stitched: (r) => (ymKey(r.year, r.month) < STITCH ? r.raw_modis : r.raw_viirs),
  raw_modis: (r) => r.raw_modis,
  raw_viirs: (r) => r.raw_viirs,
};
export interface Pt {
  x: number;
  y: number | null;
}
export function stepSeries(cal: CalendarData | null, gran: "year" | "month", view: CalView): Pt[] {
  const ms = cal?.months ?? [];
  const get = getOf[view];
  if (gran === "month") return ms.filter((r) => r.status !== "out_of_range").map((r) => ({ x: r.year + (r.month - 1) / 12, y: r.status === "partial" ? null : (get(r) ?? null) }));
  const by = new Map<number, MonthRow[]>();
  ms.forEach((r) => {
    const a = by.get(r.year) ?? [];
    a.push(r);
    by.set(r.year, a);
  });
  return Array.from(by, ([y, rs]) => {
    const ok = rs.length === 12 && rs.every((r) => r.status !== "partial" && r.status !== "out_of_range" && get(r) != null);
    return { x: y + 0.5, y: ok ? rs.reduce((s, r) => s + Number(get(r)), 0) : null };
  });
}
/** 경계 해(2012)를 뺀 앞뒤 5년 연 합계 평균: 2007–2011 vs 2013–2017 */
export function stepNumbers(cal: CalendarData | null) {
  const mean = (f: (r: MonthRow) => number | null | undefined, y0: number, y1: number) => {
    let s = 0;
    for (let y = y0; y <= y1; y++)
      for (let m = 1; m <= 12; m++) {
        const r = monthRec(cal, y, m);
        const v = r ? f(r) : null;
        if (v == null) return null;
        s += Number(v);
      }
    return s / (y1 - y0 + 1);
  };
  const o = { rb: mean(getOf.raw_stitched, 2007, 2011), ra: mean(getOf.raw_stitched, 2013, 2017), vb: mean(getOf.value, 2007, 2011), va: mean(getOf.value, 2013, 2017) };
  return o.rb == null || o.ra == null || o.vb == null || o.va == null || !o.rb || !o.vb ? null : (o as { rb: number; ra: number; vb: number; va: number });
}

/** ⑤ 날짜 범위 추이 */
export const isoD = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 기본: 분석 월 포함 3개월 */
export function trDefault(y: number, m: number) {
  return { start: presetStart(y, m, 3), end: isoD(y, m, lastDay(y, m)) };
}
export function presetStart(y: number, m: number, k: number) {
  const s0 = y * 12 + m - 1 - (k - 1);
  return isoD(Math.floor(s0 / 12), (s0 % 12) + 1, 1);
}
export function trMonths(cal: CalendarData | null, a: string, b: string): MonthRow[] {
  const out: MonthRow[] = [];
  let y = +a.slice(0, 4);
  let m = +a.slice(5, 7);
  const ek = +b.slice(0, 4) * 12 + +b.slice(5, 7);
  while (y * 12 + m <= ek) {
    const r = monthRec(cal, y, m);
    if (r) out.push(r);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
export const TRMAX = 731;

/** CSV(따옴표 규칙 RFC 4180) */
export function toCSV(rows: Record<string, unknown>[], cols: string[]) {
  const q = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((k) => q(r[k])).join(","))].join("\n");
}
export const RESULT_COLS = [
  "aoi_id", "aoi_name", "year", "month", "value", "value_lo", "value_hi", "value_source", "status", "verdict", "percentile", "ratio_to_median",
  "baseline_median", "baseline_p25", "baseline_p75", "n_baseline_years", "baseline_from", "baseline_to", "sentence", "method_version", "release",
];
export const CAL_COLS = ["aoi_id", "year", "month", "value", "value_lo", "value_hi", "value_projected", "as_of_date", "raw_modis", "raw_viirs", "value_source", "data_source", "status", "verdict", "percentile", "ratio_to_median"];
/** 캘린더 CSV(화면과 같은 조건 · v1.1 열): 완결 달의 value_projected = value, as_of_date = 월말(API 가 주면 그대로) */
export function calendarCSV(cal: CalendarData) {
  const rows = cal.months
    .filter((r) => r.status !== "out_of_range")
    .map((r) => ({
      ...r,
      aoi_id: cal.aoi_id,
      value_projected: r.value_projected ?? (r.status === "partial" ? null : r.value),
      as_of_date: r.as_of_date ?? (r.value != null && r.status !== "partial" ? isoD(r.year, r.month, lastDay(r.year, r.month)) : null),
    }));
  return toCSV(rows as unknown as Record<string, unknown>[], CAL_COLS);
}
export const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "-");

/** 한계 낱말 키(목업 LIM_BASE) — 묶음(derived) 지역이면 합 규칙 하나 더 */
export const LIM_BASE = ["hotspots_not_fire_counts", "reference_is_snpp", "pre2012_is_model_estimate", "n20_bridge_from_2026_11_03", "nrt_may_change", "no_day_status", "cell_sum_ne_aoi", "korea_small_sample"];
