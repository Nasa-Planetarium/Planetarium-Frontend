/**
 * 예측 분석(lab) 화면 모델 — 목업 pages/lab.js 의 순수 부분(결정 F8 전망).
 * 숫자 원천: 평년 기반 전망 스냅숏 public/data/snap/outlook.json(release v1.1 aoi_month 로 만든 통계 · 모델팀 산출 아님).
 * 실서버(:18490 /api/v1)에 전망 경로가 없어(2026-11-14 /outlook·/aois/KR/outlook 404) 두 모드 모두 이 정적 파일을 읽는다.
 * 여기서는 배율 되돌리기(×10·×100·×1000)와 코드 → 낱말만 한다 — 다시 계산하지 않는다.
 */

export interface OutlookAoi {
  id: string;
  name: string;
  p: (number | null)[];
  lo: (number | null)[];
  hi: (number | null)[];
  bm: (number | null)[];
  b10: (number | null)[];
  b90: (number | null)[];
  x: (number | null)[];
  vd: (number | null)[];
  cov: number[];
  mae: number[];
  mae0: number[];
  n: number[];
  rv: number[];
  rx: number[];
  hp: number[];
  hl: number[];
  hh: number[];
  ha: number[];
  hin: number[];
  pt: number | null;
  ptp: number | null;
}
export interface OutlookMethod {
  id: string;
  computed_at: string;
  origin: string;
  targets: string[];
  partial_month: string;
  partial_as_of: string;
  base_years: [number, number];
  b0: number[];
  beta: number[];
  lambda: number[];
  hindcast: { months: string[] };
  input?: { release?: string };
}
export interface Outlook {
  method: OutlookMethod;
  aoi: OutlookAoi[];
}

export type Level = "high" | "normal" | "low";
export type LvKey = Level | "na";
const VDK = ["above", "similar", "below", "uncertain"] as const;
const LVK: (Level | null)[] = ["high", "normal", "low", null];

export interface Row {
  region_id: string;
  region_name: string;
  aoi_id?: string;
  median: number | null;
  lo80: number | null;
  hi80: number | null;
  level: Level | null;
  verdict?: string;
  ratio?: number | null;
  baseline: { p10: number | null; p50: number | null; p90: number | null };
  ol: OutlookAoi | null;
}

/** ×10 정수 → 값(아래 0 으로 자름 — 스냅숏 lower_clip 0 과 같은 표기) */
export const t10c = (x: number | null | undefined) => (x == null ? null : Math.max(0, x / 10));

export function olRow(o: OutlookAoi | null, k: number, rid: string, rname: string): Row {
  if (!o) return { region_id: rid, region_name: rname, median: null, lo80: null, hi80: null, level: null, baseline: { p10: null, p50: null, p90: null }, ol: null };
  const vd = o.vd[k];
  return {
    region_id: rid,
    region_name: rname,
    aoi_id: o.id,
    median: t10c(o.p[k]),
    lo80: t10c(o.lo[k]),
    hi80: t10c(o.hi[k]),
    level: vd == null ? null : (LVK[vd] ?? null),
    verdict: vd == null ? "uncertain" : (VDK[vd] ?? "uncertain"),
    ratio: o.x[k] == null ? null : (o.x[k] as number) / 100,
    baseline: { p10: t10c(o.b10[k]), p50: t10c(o.bm[k]), p90: t10c(o.b90[k]) },
    ol: o,
  };
}
export const lvOf = (r: Row | null | undefined): LvKey => (r && r.level ? r.level : "na");
/** 지도 원 = 평년 대비 수준 3단(표 「수준」 열과 같은 말) · 0 = 자료 부족(빗금) */
export const LV_CLS: Record<Level, number> = { low: 1, normal: 2, high: 3 };
export const CLS_TOK = ["hatch-bg", "lv-low", "lv-normal", "lv-high"] as const;
export const clsOf = (r: Row | null | undefined) => (r && r.median != null && r.level ? LV_CLS[r.level] : 0);
export const LV_RANK: Record<LvKey, number> = { high: 3, normal: 2, low: 1, na: 0 };

/** 그 달 일수 */
export const dimYM = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();

/** 뒷검증(한 달 앞 예측을 과거에 돌린 것) 행 */
export function hindRows(o: OutlookAoi, months: string[]) {
  return months.map((ym, i) => ({
    ym,
    actual: (o.ha[i] ?? 0) / 10,
    median: Math.max(0, (o.hp[i] ?? 0) / 10),
    lo80: Math.max(0, (o.hl[i] ?? 0) / 10),
    hi80: Math.max(0, (o.hh[i] ?? 0) / 10),
    hit: o.hin[i] === 1,
  }));
}
/** 연도 빼기 검증 수치(×1000 → 값) */
export const skill = (o: OutlookAoi) => ({ mae: (o.mae[0] ?? 0) / 1000, mae0: (o.mae0[0] ?? 0) / 1000, cov: (o.cov[0] ?? 0) / 1000, n: o.n[0] ?? 0 });

/** 축 위끝을 보기 좋은 수로(목업 charts.js niceMax) */
export function niceMax(v: number) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const steps = [1, 2, 2.5, 5, 10];
  return (steps.find((s) => n <= s) ?? 10) * p;
}

/**
 * 한국 지역 원장: 경북 북부 11개 시군(목업 EM.L.regions · api.js SGG_OF). 군위는 2023-07 대구 편입이라 release 에서 SGG_27720.
 * 좌표·이름은 지리 정의(값이 아님) — 지도 원 자리와 이름표에만 쓴다.
 */
export const KR_REGIONS = [
  { id: "yeongju", sgg: "SGG_47210", name: "영주시", lat: 36.83, lon: 128.6 },
  { id: "bonghwa", sgg: "SGG_47920", name: "봉화군", lat: 36.92, lon: 128.92 },
  { id: "uljin", sgg: "SGG_47930", name: "울진군", lat: 36.93, lon: 129.33 },
  { id: "yecheon", sgg: "SGG_47900", name: "예천군", lat: 36.66, lon: 128.42 },
  { id: "andong", sgg: "SGG_47170", name: "안동시", lat: 36.6, lon: 128.78 },
  { id: "yeongyang", sgg: "SGG_47760", name: "영양군", lat: 36.69, lon: 129.12 },
  { id: "sangju", sgg: "SGG_47250", name: "상주시", lat: 36.4, lon: 128.17 },
  { id: "uiseong", sgg: "SGG_47730", name: "의성군", lat: 36.35, lon: 128.66 },
  { id: "cheongsong", sgg: "SGG_47750", name: "청송군", lat: 36.4, lon: 129.06 },
  { id: "yeongdeok", sgg: "SGG_47770", name: "영덕군", lat: 36.45, lon: 129.33 },
  { id: "gunwi", sgg: "SGG_27720", name: "군위군", lat: 36.21, lon: 128.58 },
] as const;
/** 한국 권역(전체) AOI = 경상북도 */
export const KR_TOTAL = "SIDO_47";

/** 보정 검증 행: meta.validation 이 있으면 그것, 없으면(실서버) m2v_evaluation.korea_pooled 를 행 모양으로만 옮긴다(목업 api.js hMethod 와 같은 옮김) */
export interface ValRow {
  scope: string;
  model: string;
  selected: boolean;
  metrics: Record<string, number | null>;
  n: number | null;
}
export function valRows(meta: { validation?: ValRow[]; final_method?: string; m2v_evaluation?: { adopted?: string; korea_pooled?: Record<string, { MAE: number; bias: number }> } } | undefined): ValRow[] {
  if (!meta) return [];
  if (Array.isArray(meta.validation)) return meta.validation;
  const ev = meta.m2v_evaluation ?? {};
  const kp = ev.korea_pooled ?? {};
  const ad = ev.adopted ?? meta.final_method;
  return Object.keys(kp)
    .sort((x, z) => Number(z === ad) - Number(x === ad))
    .map((model) => ({ scope: "korea", model, selected: model === ad, metrics: { mae_month_total: kp[model]?.MAE ?? null, bias_ratio: kp[model]?.bias ?? null }, n: null }));
}
