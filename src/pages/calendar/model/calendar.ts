/**
 * 캘린더 화면 순수 모델(목업 pages/calendar.js 의 계산 없는 몫) — 화면·DOM 을 모른다.
 * 규칙: E1 실제 행 값 그대로(다시 계산 없음 — 출처 띠도 행의 value_source 로) · E2 결측 = null(0 아님) ·
 *       E3 구간 밖 = 값 유지 · 구간 버림 · 플래그 · E4 경우 가르기 = shared/data-cases judgeMonth(switch 없음).
 */
import { judgeMonth, type CaseResult, type CaseRow, type View } from "@/shared/data-cases";

export const Y0 = 2000;
export const Y1 = 2026;
export const FIRST: readonly [number, number] = [2000, 11];
export const LAST: readonly [number, number] = [2026, 11];
/** 보기 4개: 통합 · 보정 전(2012-01 까지 MODIS · 이후 VIIRS 이음) · 원자료 MODIS · 원자료 VIIRS */
export const VIEWS = ["value", "raw_stitched", "raw_modis", "raw_viirs"] as const;
export type CalView = (typeof VIEWS)[number];
export const MODES = ["cal", "world"] as const;
export type Mode = (typeof MODES)[number];
export const GB = "group:gb-north";

export const p2 = (n: number) => String(n).padStart(2, "0");
export const ymIso = (y: number, m: number) => `${y}-${p2(m)}`;
export const ymKey = (y: number, m: number) => y * 12 + m;
export const inRange = (y: number, m: number) => ymKey(y, m) >= ymKey(FIRST[0], FIRST[1]) && ymKey(y, m) <= ymKey(LAST[0], LAST[1]);
/** 전 세계 재생 달 번호(0 = 2000-11) */
export const monthIndex = (y: number, m: number) => (y - 2000) * 12 + m - 11;
export const ymOfIndex = (i: number): [number, number] => [2000 + Math.floor((10 + i) / 12), ((10 + i) % 12) + 1];

/** 캘린더 한 달 행(계약 CalendarMonth + v1.1 실서버 열). 화면은 이 모양만 읽는다 */
export interface MonthRow extends CaseRow {
  year: number;
  month: number;
  value?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  value_projected?: number | null;
  as_of_date?: string | null;
  raw_modis?: number | null;
  raw_viirs?: number | null;
  value_source?: string | null;
  data_source?: string | null;
  status?: string | null;
  verdict?: string | null;
  percentile?: number | null;
  ratio_to_median?: number | null;
  low_sample?: boolean | null;
  flags?: string[] | null;
}
export interface CalendarData {
  aoi_id: string;
  method_version: string;
  months: MonthRow[];
  /** 셸 API 에 없어 정적 world-1deg/meta.json 으로 만든 대체판(원자료·비교 열 없음) */
  local?: boolean;
}

/** 원자료 보기에서 그 달이 읽는 열: 보정 전은 2012-01 까지 MODIS · 2012-02 부터 VIIRS */
export const stitchView = (y: number, m: number): View => (ymKey(y, m) < ymKey(2012, 2) ? "raw_modis" : "raw_viirs");
export const caseView = (view: CalView, y: number, m: number): View => (view === "raw_stitched" ? stitchView(y, m) : view);

/** 서버 flags 의 구간 밖 표지(이름이 판마다 다르다: interval_out · interval_out_of_range) */
const IO_FLAGS = ["interval_out", "interval_out_of_range"];

export interface MonthCase extends CaseResult {
  /** 화면 표지(before_sensor 는 원자료 VIIRS 보기의 운용 전) */
  io: boolean;
}

/** E4: 한 달 행 → 경우(judgeMonth). 실서버가 이미 E3 를 적용해 구간을 비운 행도 플래그를 잃지 않게 합친다 */
export function caseOf(r: MonthRow | null | undefined, view: CalView, y?: number, m?: number): MonthCase {
  const yy = r?.year ?? y ?? 0;
  const mm = r?.month ?? m ?? 1;
  const row: MonthRow = r ?? { year: yy, month: mm, status: "out_of_range" };
  const v = caseView(view, yy, mm);
  const k = judgeMonth(row, { view: v });
  const srvIo = v === "value" && Array.isArray(row.flags) && row.flags.some((f) => IO_FLAGS.includes(f));
  const io = k.flags.includes("interval_out") || srvIo;
  return { ...k, lo: io ? null : k.lo, hi: io ? null : k.hi, io };
}

/** 칸(/cells 속성) 경우: 같은 처리기, 보기 열을 value 자리에 */
export interface CellProps {
  cell_lat?: number;
  cell_lon?: number;
  value?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  raw_modis?: number | null;
  raw_viirs?: number | null;
  status?: string | null;
  interval_out_of_range?: boolean | null;
}
export function cellCase(p: CellProps, view: CalView, y: number, m: number) {
  const v = caseView(view, y, m);
  const k = judgeMonth({ ...p, year: y, month: m, status: p.status === "missing" ? "missing" : "ok" }, { view: v });
  const io = k.flags.includes("interval_out") || (v === "value" && p.interval_out_of_range === true);
  return { value: k.value, lo: io ? null : k.lo, hi: io ? null : k.hi, io, status: p.status ?? null };
}

/** value_source → 띠 모양: d Terra 추정(점선 빗금) · a MODIS 추정(빗금) · b S-NPP 실측(채움) · c NOAA-20/21 연결(테두리) */
export const VS_CLS: Record<string, "a" | "b" | "c" | "d"> = { modis_m2v_terra: "d", modis_m2v: "a", snpp_observed: "b", n20_bridge: "c", n21_bridge: "c" };
export const vsCls = (vs: string) => VS_CLS[vs] ?? "c";

export interface Band {
  vs: string;
  from: [number, number];
  to: [number, number];
}
/** 값 출처 띠: 행의 value_source 를 이어진 구간으로(E1 — /method 날짜가 아니라 실제 행) */
export function bandsOf(cal: CalendarData | null, view: CalView): Band[] {
  if (view !== "value" || !cal) return [];
  const out: Band[] = [];
  cal.months.forEach((r) => {
    if (!inRange(r.year, r.month) || !r.value_source) return;
    const last = out[out.length - 1];
    if (last && last.vs === r.value_source) last.to = [r.year, r.month];
    else out.push({ vs: r.value_source, from: [r.year, r.month], to: [r.year, r.month] });
  });
  return out;
}
export const yfOf = (ym: readonly [number, number], end?: boolean) => ym[0] + (ym[1] - 1 + (end ? 1 : 0)) / 12;

/** 머리 범위 줄의 두 기간(MODIS 보정 추정 ↔ VIIRS 실측·연결) — 행 경계로 */
export function srcScope(cal: CalendarData | null) {
  if (!cal) return null;
  const ms = cal.months.filter((r) => inRange(r.year, r.month) && r.value_source);
  const md = ms.filter((r) => /^modis/.test(r.value_source ?? ""));
  const vi = ms.filter((r) => !/^modis/.test(r.value_source ?? ""));
  const a = md[0];
  const b = md[md.length - 1];
  const c = vi[0];
  if (!a || !b || !c) return null;
  return { modisFrom: ymIso(a.year, a.month), modisTo: ymIso(b.year, b.month), viirsFrom: ymIso(c.year, c.month) };
}

export type CountKey = "ok" | "nrt" | "partial" | "missing" | "before_sensor" | "interval_out";
/** 상태별 달 수(범위 안 313달). 운용 전·구간 밖은 0 보다 클 때만 칸을 둔다 */
export function counts(cal: CalendarData | null, view: CalView) {
  if (!cal) return null;
  const n: Record<CountKey, number> = { ok: 0, nrt: 0, partial: 0, missing: 0, before_sensor: 0, interval_out: 0 };
  cal.months.forEach((r) => {
    if (!inRange(r.year, r.month)) return;
    const c = caseOf(r, view);
    if (c.st in n) n[c.st as CountKey]++;
    if (c.io) n.interval_out++;
  });
  return n;
}

export interface GridRow {
  year: number;
  cs: MonthCase[];
}
/** 연×월 격자 입력 + 색 눈금(p95) */
export function calInput(cal: CalendarData | null, view: CalView) {
  const byKey = new Map((cal?.months ?? []).map((r) => [ymKey(r.year, r.month), r] as const));
  const rows: GridRow[] = [];
  const vals: number[] = [];
  for (let y = Y0; y <= Y1; y++) {
    const cs: MonthCase[] = [];
    for (let m = 1; m <= 12; m++) {
      const r = byKey.get(ymKey(y, m)) ?? { year: y, month: m, status: "out_of_range" };
      const c = caseOf(inRange(y, m) ? r : { year: y, month: m, status: "out_of_range" }, view);
      cs.push(c);
      if (c.value != null) vals.push(c.value);
    }
    rows.push({ year: y, cs });
  }
  vals.sort((a, b) => a - b);
  return { rows, max: vals.length ? (vals[vals.length - 1] as number) : 0, p95: vals.length ? quantile(vals, 0.95) : null };
}
export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

/** 처음 고를 달: 정상·NRT 인 마지막 달(진행 중 달은 값이 차는 중) */
export function lastMonth(cal: CalendarData | null): [number, number] {
  const ms = cal?.months ?? [];
  for (let k = ms.length - 1; k >= 0; k--) {
    const r = ms[k] as MonthRow;
    if (r.status === "ok" || r.status === "nrt") return [r.year, r.month];
  }
  return [LAST[0], LAST[1]];
}

/** 진행 중 달 줄 값: 「2026-11-13까지 44.3 (이 추세면 한 달 약 102.3)」 — 값이 없으면 null */
export function partialOf(r: MonthRow | null | undefined) {
  if (!r || r.status !== "partial" || r.value == null) return null;
  return { date: r.as_of_date ?? "", v: r.value, p: r.value_projected ?? null };
}

/** 열 램프: --h0..--h6 을 정해진 위치에(목업 charts.ramp). stops = 토큰에서 읽은 #rrggbb 7개 */
const RAMP_AT = [0, 0.12, 0.3, 0.5, 0.7, 0.86, 1];
const hexRGB = (h: string) => {
  let s = String(h || "").trim().replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export function makeRamp(stops: string[]) {
  const S = RAMP_AT.map((t, i) => [t, hexRGB(stops[i] ?? "#000")] as const);
  return (t0: number) => {
    const t = Math.max(0, Math.min(1, t0));
    let j = 0;
    while (j < S.length - 2 && t > (S[j + 1] as (typeof S)[number])[0]) j++;
    const [a, ca] = S[j] as (typeof S)[number];
    const [b, cb] = S[j + 1] as (typeof S)[number];
    const u = (t - a) / (b - a);
    return "#" + ca.map((v, i) => Math.round(v + ((cb[i] as number) - v) * u).toString(16).padStart(2, "0")).join("");
  };
}

/** 칸 원 단계(로그 눈금 경계 1 · 10 · 100 · 1000) */
export const DOT_STEPS = [1, 10, 100, 1000];
export const stepOf = (v: number) => DOT_STEPS.filter((s) => v >= s).length;

/** 위경도 글자 → { lat, lon } | null. 「36.35, 128.7」 「36.35 128.7」 「36.35N 128.7E」 「33.9S, 151.2E」 */
export function parseLatLon(s: string | null | undefined) {
  const m = /^\s*([+-]?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?\s*(?:,\s*|\s+)([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?\s*$/i.exec(String(s ?? ""));
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  if (m[2] && /s/i.test(m[2])) lat = -Math.abs(lat);
  if (m[4] && /w/i.test(m[4])) lon = -Math.abs(lon);
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
}

/** 시도 영어 이름(표시 낱말 — release 에 name_en 열이 없음 R3, 목업 api.js SIDO_EN 그대로). 값이 아니라 이름표다 */
export const SIDO_EN: Record<string, string> = {
  SIDO_11: "Seoul", SIDO_26: "Busan", SIDO_27: "Daegu", SIDO_28: "Incheon", SIDO_29: "Gwangju", SIDO_30: "Daejeon", SIDO_31: "Ulsan", SIDO_36: "Sejong",
  SIDO_41: "Gyeonggi-do", SIDO_43: "Chungcheongbuk-do", SIDO_44: "Chungcheongnam-do", SIDO_46: "Jeollanam-do", SIDO_47: "Gyeongsangbuk-do", SIDO_48: "Gyeongsangnam-do",
  SIDO_50: "Jeju", SIDO_51: "Gangwon", SIDO_52: "Jeonbuk",
};
export const nameEn = (a: { aoi_id: string; name_en: string | null }) => a.name_en || SIDO_EN[a.aoi_id] || null;

/** AOI → 나라 ISO3: 한국 단위(KR · SIDO · SGG · 묶음) = KOR, ADM0_XXX = XXX */
export const isKorId = (id: string | null | undefined) => id === "KR" || id === GB || /^(SIDO|SGG)_/.test(id ?? "");
export function iso3OfAoi(id: string | null | undefined): string | null {
  if (!id || id === "WORLD") return null;
  if (isKorId(id)) return "KOR";
  const m = /^ADM0_([A-Z]{3})$/.exec(id);
  return m ? (m[1] as string) : null;
}
export const aoiOfIso3 = (iso3: string) => (iso3 === "KOR" ? "KR" : `ADM0_${iso3}`);

/** 사례(경북 안 지역에서 점 지도 확대 상자) */
export const CASES_UI: readonly (readonly [string, number, number])[] = [
  ["uiseong-2025-03", 2025, 3],
  ["uljin-2022-03", 2022, 3],
];
export const CASE_BOX: Record<string, [number, number, number, number]> = {
  "uiseong-2025-03": [128.3, 36.0, 129.6, 36.9],
  "uljin-2022-03": [129.0, 36.85, 129.5, 37.45],
};
/** 점 고르기: 한국 안 지역이고 달이 점 범위(2000-11 – 2026-11) 안이면 */
export function caseFor(ym: string, aoiId: string, inGb: boolean) {
  if (!isKorId(aoiId) || ym < "2000-11" || ym > "2026-11") return null;
  const hit = inGb ? CASES_UI.find((c) => ymIso(c[1], c[2]) === ym) : undefined;
  return { aoi_id: aoiId, ym, caseId: hit ? hit[0] : null, focus: hit ? (CASE_BOX[hit[0]] ?? null) : null };
}

/** 한국 사례 시각(UTC 분 오프셋) → KST 표기 */
export function kst(t0utc: number, min: number) {
  const d = new Date(t0utc + (min + 540) * 60000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
export const fmtLat = (x: number) => `${Math.abs(x).toFixed(4)}°${x >= 0 ? "N" : "S"}`;
export const fmtLon = (x: number) => `${Math.abs(x).toFixed(4)}°${x >= 0 ? "E" : "W"}`;
export const SAT_NAME: Record<string, string> = { "Suomi NPP": "S-NPP", N: "S-NPP", N20: "NOAA-20", N21: "NOAA-21" };

/** 숫자 서식(목업 EM.fmt) — 언어별 Intl 캐시 */
const nfC = new Map<string, Intl.NumberFormat>();
const intl = (lang: string, key: string, o: Intl.NumberFormatOptions) => {
  const k = `${lang}|${key}`;
  let f = nfC.get(k);
  if (!f) {
    f = new Intl.NumberFormat(lang === "ko" ? "ko-KR" : lang, o);
    nfC.set(k, f);
  }
  return f;
};
export function fmtNum(lang: string, n: number | null | undefined, d = 0) {
  if (n == null || Number.isNaN(n)) return "–";
  return intl(lang, `n${d}`, { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n));
}
/** 칸 안 짧은 숫자: 86 · 312 · 1.4K(en) / 1.4천(ko). 10 미만 소수는 한 자리. null → "" */
export function fmtCompact(lang: string, n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "";
  const a = Math.abs(n);
  if (a > 0 && a < 0.05) return `<${fmtNum(lang, 0.1, 1)}`;
  if (a < 1000) return a < 10 && !Number.isInteger(+n) ? fmtNum(lang, n, 1) : fmtNum(lang, Math.round(n));
  return intl(lang, "c", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n));
}
/** 캘린더 칸 숫자(목업 EM.fmt.cell): 10 미만 소수 한 자리 · 10–9,999 는 정수(칸 안이라 쉼표 없음) · 1만 이상만 짧은 표기 — 「1.6천」과 「824」가 한 달력에 섞이지 않게 */
export function fmtCell(lang: string, n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "";
  const a = Math.abs(n);
  if (a >= 1000 && a < 10000) return String(Math.round(n));
  return fmtCompact(lang, n);
}
/** 값 표기: 0.1 미만 「<0.1」, 소수 한 자리(정수면 정수) */
export function fmtVal(lang: string, x: number | null | undefined) {
  if (x == null || Number.isNaN(x)) return "–";
  if (+x > 0 && +x < 0.05) return `<${fmtNum(lang, 0.1, 1)}`;
  let v = Math.round(+x * 10) / 10;
  if (Object.is(v, -0)) v = 0;
  return Number.isInteger(v) ? fmtNum(lang, v) : fmtNum(lang, v, 1);
}
/** 축 눈금: lim 이상이면 짧은 표기 */
export function fmtAxis(lang: string, v: number, lim = 1e4) {
  if (Math.abs(v) < lim) return fmtNum(lang, v);
  return intl(lang, "c", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}
export const monthWord = (lang: string, m: number) =>
  lang === "ko" ? `${m}월` : new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2001, m - 1, 15)));
export const ymWord = (lang: string, y: number, m: number) => (lang === "ko" ? `${y}년 ${m}월` : `${monthWord(lang, m)} ${y}`);

export function niceMax(v: number) {
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
