/**
 * 상황판(home) 화면 모델 — 목업 pages/home.js 의 순수 계산 몫만(그리기 없음).
 *
 * 실제 데이터(release) 값은 다시 계산하지 않는다(결정 A1): 캘린더 칸 값·배수·상태는 API 응답 그대로 읽고,
 * 여기서 하는 것은 고르기(가장 많은 달)·늘어놓기(연×월 격자)·연간 합(연 합계 막대·「가장 많았던 해」 — 목업과 같은 단순 합) 뿐이다.
 * 경우 가르기는 shared/data-cases 의 judgeMonth 하나(switch 금지 — 결정 E4).
 */
import { judgeMonth, type CaseState, type View } from "@/shared/data-cases";

/** 캘린더 축(목업 EM.L.calendar_model): 2001–2026 */
export const FIRST_YEAR = 2001;
export const LAST_YEAR = 2026;
export const VIIRS_START = 2012;

/** 경북 북부 시군 slug → release SGG 코드(목업 api.js SGG_OF 그대로) */
export const SGG_OF: Record<string, string> = {
  andong: "47170",
  bonghwa: "47920",
  cheongsong: "47750",
  gunwi: "27720",
  sangju: "47250",
  uiseong: "47730",
  uljin: "47930",
  yecheon: "47900",
  yeongdeok: "47770",
  yeongju: "47210",
  yeongyang: "47760",
};

/**
 * 관심 영역 → 실제 API AOI.
 * - 한국 「경북 북부 전체」: 계약 확장 `group:gb-north` 는 실서버·스냅숏 둘 다 없다(실서버 404 unknown_aoi 잼, 2026-11-14) →
 *   경북 북부 11개 시군 중 10개가 들어 있는 경상북도(SIDO_47) 값을 쓰고, 화면에 그 이름을 그대로 적는다(합을 우리가 만들지 않음 — E1).
 * - 시군 하나: SGG_<코드>
 * - 다른 나라: ADM0_<ISO3>
 */
export function realAoi(iso3: string, region: string | null): string {
  if (iso3 !== "KOR") return `ADM0_${iso3}`;
  const code = region ? SGG_OF[region] : undefined;
  return code ? `SGG_${code}` : "SIDO_47";
}

/** API 달 행(계약 CalendarMonth + 실서버 v1.1 확장 value_projected·as_of_date — E1 실서버 정본) */
export interface MonthRow {
  year: number;
  month: number;
  value: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  value_projected?: number | null;
  as_of_date?: string | null;
  raw_modis: number | null;
  raw_viirs: number | null;
  status: string;
  verdict?: string | null;
  percentile?: number | null;
  ratio_to_median: number | null;
  low_sample?: boolean | null;
}

export type Sensor = "harmonized" | "modis" | "viirs";
export const SENSORS: readonly Sensor[] = ["harmonized", "modis", "viirs"];
/** 센서 보기 → judgeMonth 보기 */
export const VIEW_OF: Record<Sensor, View> = { harmonized: "value", modis: "raw_modis", viirs: "raw_viirs" };

/** 캘린더 칸 하나 */
export interface Cell {
  year: number;
  month: number;
  v: number | null;
  st: CaseState;
  ratio: number | null;
  row: MonthRow | null;
}

/** 연×월 격자(목업 EM.calendar rows) — 값은 judgeMonth 가 고른 값(보기 열) 그대로 */
export function grid(months: readonly MonthRow[], sensor: Sensor): Cell[][] {
  const by = new Map(months.map((r) => [`${r.year}-${r.month}`, r] as const));
  const view = VIEW_OF[sensor];
  const out: Cell[][] = [];
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    const row: Cell[] = [];
    for (let m = 1; m <= 12; m++) {
      const r = by.get(`${y}-${m}`) ?? null;
      if (!r) {
        row.push({ year: y, month: m, v: null, st: "out_of_range", ratio: null, row: null });
        continue;
      }
      const j = judgeMonth(r, { view });
      row.push({ year: y, month: m, v: j.value, st: j.st, ratio: r.ratio_to_median, row: r });
    }
    out.push(row);
  }
  return out;
}

/** 진행 중인 달(status partial) — 없으면 null */
export function partialOf(months: readonly MonthRow[]): MonthRow | null {
  return months.find((r) => r.status === "partial") ?? null;
}

/** 가장 많은 달(목업 worstMonth — 끝난 달·진행 중 모두, 값이 있는 칸 중 최댓값) */
export function worstMonth(g: Cell[][]): { year: number; month: number; v: number } | null {
  let w: { year: number; month: number; v: number } | null = null;
  for (const row of g) for (const c of row) if (c.v != null && (!w || c.v > w.v)) w = { year: c.year, month: c.month, v: c.v };
  return w;
}

/** 연간 합(목업 EM.annual — 그 해 달 값의 단순 합, 결측 달은 세어 따로 둔다). 진행 중인 해는 뺀다 */
export function annual(g: Cell[][]): { year: number; total: number; missing: number }[] {
  return g
    .filter((row) => row[0] && row[0].year < LAST_YEAR)
    .map((row) => ({
      year: row[0]!.year,
      total: row.reduce((s, c) => s + (c.v ?? 0), 0),
      missing: row.filter((c) => c.st === "missing").length,
    }));
}

/** 최근 12개월 값(스파크라인) — 진행 중인 달까지, 값 없는 달은 null(잇지 않음) */
export function last12(months: readonly MonthRow[], upto: { year: number; month: number }): (number | null)[] {
  const by = new Map(months.map((r) => [`${r.year}-${r.month}`, r] as const));
  const out: (number | null)[] = [];
  for (let k = 11; k >= 0; k--) {
    let y = upto.year;
    let m = upto.month - k;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    out.push(by.get(`${y}-${m}`)?.value ?? null);
  }
  return out;
}

/**
 * 올해 누계 예년 대비(목업 EM.ytdCompare 의 실제 자료 판): 올해 1월–지난달 끝난 달 값 합 ÷ 2001–2025 같은 달들 합의 중앙값.
 * 결측 달이 있는 해는 기준에서 뺀다(목업과 같은 규칙). 값은 release 달 값의 합일 뿐 — 판정·배수를 release 대신 만들지 않는다(표시는 「예년 대비」 숫자 하나).
 */
export function ytdRatio(g: Cell[][], uptoMonth: number): { ratio: number; n: number } | null {
  if (uptoMonth < 1) return null;
  const sumOf = (row: Cell[]) => {
    let s = 0;
    for (let m = 1; m <= uptoMonth; m++) {
      const c = row[m - 1];
      if (!c || c.v == null) return null;
      s += c.v;
    }
    return s;
  };
  const cur = g.find((r) => r[0]?.year === LAST_YEAR);
  const now = cur ? sumOf(cur) : null;
  if (now == null) return null;
  const base = g
    .filter((r) => (r[0]?.year ?? 0) < LAST_YEAR)
    .map(sumOf)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  if (!base.length) return null;
  const h = (base.length - 1) / 2;
  const med = (base[Math.floor(h)]! + base[Math.ceil(h)]!) / 2;
  return med > 0 ? { ratio: now / med, n: base.length } : null;
}

/** 열 램프(목업 charts.js ramp): --h0..--h6 을 정해진 자리에 놓고 사이를 잇는다 */
const RAMP_AT = [0, 0.12, 0.3, 0.5, 0.7, 0.86, 1];
const hexRGB = (h: string): [number, number, number] => {
  let s = String(h || "").replace("#", "");
  if (s.length === 3)
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export function makeRamp(hex: readonly string[]): (t: number) => string {
  const stops = RAMP_AT.map((t, i) => [t, hexRGB(hex[i] ?? "#000")] as const);
  return (t0: number) => {
    const t = Math.max(0, Math.min(1, t0));
    let j = 0;
    while (j < stops.length - 2 && t > stops[j + 1]![0]) j++;
    const [a, c0] = stops[j]!;
    const [b, c1] = stops[j + 1]!;
    const u = (t - a) / (b - a);
    return "#" + c0.map((v, i) => Math.round(v + (c1[i]! - v) * u).toString(16).padStart(2, "0")).join("");
  };
}

/** 캘린더 색 눈금 상한(목업: 값 있는 칸의 97 백분위) */
export function scaleMaxOf(g: Cell[][]): number {
  const all = g
    .flat()
    .map((c) => c.v)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  return all[Math.floor(all.length * 0.97)] ?? all[all.length - 1] ?? 1;
}

/** 축 최대(목업 charts.niceMax) */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** 날짜 */
export function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const ymKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
export function monthEnd(y: number, m: number): string {
  return `${ymKey(y, m)}-${String(daysIn(y, m)).padStart(2, "0")}`;
}
export function dayCount(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
}

/** 위성 연대(목업 EM.SATS) */
export const SATS = [
  { sat: "Terra", short: "T", sensor: "MODIS", start: "2000-02-24" },
  { sat: "Aqua", short: "A", sensor: "MODIS", start: "2002-07-04" },
  { sat: "S-NPP", short: "S", sensor: "VIIRS", start: "2012-01-19" },
  { sat: "NOAA-20", short: "N20", sensor: "VIIRS", start: "2018-01-05" },
  { sat: "NOAA-21", short: "N21", sensor: "VIIRS", start: "2023-02-10" },
] as const;

/** 연대 이름 배치(목업 EM.eraPlace): 겹치면 짧은 이름, 그래도 겹치면 뺀다 */
export function eraPlace(
  items: { x: number; pin?: boolean; vars: string[] }[],
  o: { left: number; right: number; width: (t: string) => number; pad?: number; gap?: number },
): { i: number; txt: string; l: number }[] {
  const pad = o.pad ?? 4;
  const gap = o.gap ?? 6;
  const out: { i: number; txt: string; l: number }[] = [];
  let prevR = -1e9;
  const box = (it: (typeof items)[number], v: string) => {
    const tw = o.width(v);
    let l = it.pin ? Math.max(o.left, it.x + pad) : it.x + pad;
    if (l + tw > o.right) l = it.x - pad - tw;
    l = Math.max(o.left, l);
    return { txt: v, l, r: l + tw };
  };
  items.forEach((it, i) => {
    const nx = items[i + 1];
    const nextL = nx ? box(nx, nx.vars[nx.vars.length - 1] ?? "").l : Infinity;
    let got: { txt: string; l: number; r: number } | null = null;
    for (const strict of [true, false]) {
      for (const v of it.vars) {
        const b = box(it, v);
        if (b.r > o.right + 0.5 || b.l < prevR + gap || (strict && b.r + gap > nextL)) continue;
        got = b;
        break;
      }
      if (got) break;
    }
    if (got) {
      out.push({ i, txt: got.txt, l: got.l });
      prevR = got.r;
    }
  });
  return out;
}

/** 원장 시각 「어제 10:14」 → 사전 home.at.yday */
export const YDAY = "어제 ";

/** 불 표지 상태(목업 map3d fireMarkOf) */
export const CLOSED = ["contained", "out", "resolved"];
export const ACTIVE = ["new", "ack", "dispatched", "onscene"];
export function frpCls(frp: number | null | undefined): "" | "fs-m" | "fs-s" {
  return frp == null || frp >= 80 ? "" : frp >= 20 ? "fs-m" : "fs-s";
}
/** 지도 이름표: 원문 끝 두 낱말(「길안면 묵계리」) · 번역 이름은 첫 쉼표 마디 */
export function fireLabel(name: string, translated: string): string {
  return translated === name ? String(name).split(" ").slice(-2).join(" ") : (translated.split(",")[0] ?? translated).trim();
}
