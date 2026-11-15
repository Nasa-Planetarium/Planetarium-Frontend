/**
 * 방법·검증(method) 화면 모델 — 목업 pages/method.js 의 순수 부분.
 * 값은 /methods/current(release m2v_meta 그대로)와 /aois/{id}/calendar 에서만 읽는다. 다시 계산하지 않는다(A1) —
 * 여기서 하는 일은 줄 세우기·연속 달 묶기·세기뿐이다.
 */

export const SECS = ["method", "v11", "v12", "validation", "status", "sources"] as const;
export type Sec = (typeof SECS)[number];
export const isSec = (s: string | null | undefined): s is Sec => !!s && (SECS as readonly string[]).includes(s);

/** 값 출처 → 띠 견본(분석 화면 .an-segdot 과 같은 모양): as = MODIS 보정 추정 · va = S-NPP 실측 · af = NOAA-20 연결 */
export const VS_CLS: Record<string, string> = { modis_m2v_terra: "as", modis_m2v: "as", snpp_observed: "va", n20_bridge: "af", n21_bridge: "af" };
/** 값 성격: 추정 · 실측 · 연결 */
export const VS_KIND: Record<string, string> = { modis_m2v_terra: "estimate", modis_m2v: "estimate", snpp_observed: "observed", n20_bridge: "bridged", n21_bridge: "bridged" };
/**
 * 값 출처 코드 → 위성·센서·모델(표시용 정의). 실서버 value_sources 에는 이 세 칸이 없다(2026-11-14 실서버 표본 — E1 차이) →
 * 목업 VALUE_SOURCES 의 정의를 코드에 붙여 보인다(값이 아니라 코드의 뜻).
 */
export const VS_INFO: Record<string, { satellites: string[]; instrument: string; model: string | null }> = {
  modis_m2v_terra: { satellites: ["Terra"], instrument: "MODIS", model: "m2v_xgb_terra" },
  modis_m2v: { satellites: ["Terra", "Aqua"], instrument: "MODIS", model: "m2v_xgb" },
  snpp_observed: { satellites: ["N"], instrument: "VIIRS", model: null },
  n20_bridge: { satellites: ["N20"], instrument: "VIIRS", model: "n20_bridge" },
  n21_bridge: { satellites: ["N21"], instrument: "VIIRS", model: "n21_bridge" },
};
/** 위성 코드 → 이름(허용된 고유명만) */
export const SAT: Record<string, string> = { Terra: "Terra", Aqua: "Aqua", N: "Suomi NPP", N20: "NOAA-20", N21: "NOAA-21" };
/** 계약(API-v3 §1)에만 있는 상수 — release m2v_meta 에는 규칙 글만 있고 숫자가 없다 */
export const CONTRACT = { n20_bridge: 1.013 };
/** 통합 규칙(m2v_meta.harmonization) 키 순서 */
export const HARM_ORDER = ["modis_m2v", "2012-01", "snpp_observed", "n20_bridge", "regional_only", "aoi_interval", "cell_interval", "dense_rows", "sparse_cell_table", "hidden_aoi"];
export const LIMS = ["hotspots_not_fire_counts", "reference_is_snpp", "pre2012_is_model_estimate", "n20_bridge_from_2026_11_03", "nrt_may_change", "no_day_status", "cell_sum_ne_aoi", "korea_small_sample", "group_sum_rule"];
export const STS = ["ok", "nrt", "partial", "missing", "out_of_range"] as const;
export const RANGE = { from: "2000-11", to: "2026-11" };

export interface ValueSource {
  value_source: string;
  from?: string | null;
  to?: string | null;
  label_ko?: string;
  factor?: number;
}
export interface MonthRow {
  year: number;
  month: number;
  value?: number | null;
  value_projected?: number | null;
  as_of_date?: string | null;
  value_source?: string | null;
  status?: string | null;
}
export interface Meta {
  final_method?: string;
  final_method_reason?: string;
  method_version?: string;
  train_period?: string;
  target?: string;
  zero_rule?: string;
  evaluation?: string;
  seed?: number;
  created?: string;
  validation_summary?: Record<string, { metric?: string; mean?: number }>;
  harmonization?: Record<string, string>;
  model_names?: Record<string, string>;
  /** v1.2 산업 열원(고정 열원) 제거 — release m2v_meta.static_exclusion 그대로 */
  static_exclusion?: { version?: string; rule?: string; removed_share?: Record<string, Record<string, number>>; limitation?: string };
  m2v_evaluation?: {
    objective?: string;
    features?: string[];
    terra_only_features?: string[];
    category_levels?: Record<string, number>;
    params?: Record<string, number | string>;
    n_rounds_final?: Record<string, number>;
    korea_pooled?: Record<string, { MAE: number; bias: number }>;
    adoption_rule?: string;
    adopted?: string;
  };
}
export interface MethodDoc {
  method_version?: string;
  data_version?: string;
  meta?: Meta;
  value_sources?: ValueSource[];
  sources?: { name: string; credit?: string; url?: string; license?: string; note?: string }[];
  files?: Record<string, unknown>;
  /** v1.2 화면 표시 이름(내부 id → 이름, 계약 Method.display_names). 값은 내부 id 그대로 */
  display_names?: Record<string, string>;
  /** v1.2 성능 문구(계약 Method.performance_copy) */
  performance_copy?: string;
}

/** 표시 이름(화면에만): 서버 display_names → 사전 v12frs.dn.<id> → 내부 id. 코드·값은 내부 id 그대로 */
export const DN_IDS = ["m2v_xgb", "m2v_xgb_terra", "m2v_q10_q90", "n20_bridge"] as const;
export function displayName(M: MethodDoc | undefined, id: string | null | undefined, dict: (id: string) => string | null): string | null {
  if (!id) return null;
  return M?.display_names?.[id] ?? dict(id) ?? null;
}

/** 산업 열원 제거 비율 행 순서(release removed_share 키): 한국 · 아르헨티나 · 전 세계, 나머지는 원래 순서 */
export function removedRows(rs: Record<string, Record<string, number>> | undefined) {
  const o = ["KR", "ADM0_ARG", "WORLD"];
  const keys = Object.keys(rs ?? {});
  return o.filter((k) => keys.includes(k)).concat(keys.filter((k) => !o.includes(k))).map((k) => ({ aoi: k, periods: rs?.[k] ?? {} }));
}

/** 한계 목록: 이 판에 위성 일별 상태가 있으면 「일별 상태 없음」 한계는 뺀다(v1.2 부터 release 에 있음) */
export const limsOf = (files: Record<string, unknown> | undefined) => LIMS.filter((k) => !(k === "no_day_status" && !!files?.satellite_day_status));

export const ymS = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** 기간 행 = 시작 달이 있는 출처만(실서버는 쓰지 않는 출처 n21_bridge·배경 행도 from null 로 준다) */
export const periods = (M: MethodDoc | undefined) => (M?.value_sources ?? []).filter((g) => !!g.from);

/** 통합 규칙 키: 정한 순서 먼저, 나머지는 원래 순서 */
export function harmKeys(hm: Record<string, string> | undefined) {
  const h = hm ?? {};
  return HARM_ORDER.filter((k) => h[k]).concat(Object.keys(h).filter((k) => !HARM_ORDER.includes(k)));
}

/** 한국 합계 검증 모델 순서: 채택 모델 먼저, 나머지는 MAE 작은 것부터 */
export function pooledOrder(kp: Record<string, { MAE: number; bias: number }>, adopted: string | undefined) {
  return Object.keys(kp).sort((a, b) => Number(b === adopted) - Number(a === adopted) || (kp[a]?.MAE ?? Infinity) - (kp[b]?.MAE ?? Infinity));
}

/** 검증 범위 순서: world · korea · 나라 · 대륙(이름순) */
export function scopeOrder(keys: string[]) {
  const rank = (k: string) => (k === "world" ? 0 : k === "korea" ? 1 : /^continent:/.test(k) ? 3 : 2);
  return keys.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
/** 검증 범위 → 사전 키(method.sc.*) */
export function scopeKey(k: string) {
  const c = /^continent:(.+)$/.exec(k);
  return "method.sc." + (c?.[1] ? "c_" + c[1].toLowerCase().replace(/[^a-z]+/g, "_") : k);
}

/** 범위 안(2000-11 – 2026-11) 달만 */
export const inRange = (ms: MonthRow[]) => ms.filter((x) => {
  const ym = ymS(x.year, x.month);
  return ym >= RANGE.from && ym <= RANGE.to;
});

/** 연속 달 묶기: ["2026-08","2026-09","2026-10"] → ["2026-08 – 2026-10"] */
export function runs(arr: string[]) {
  const out: { from: string; to: string; k: number }[] = [];
  arr.forEach((ym) => {
    const l = out[out.length - 1];
    const k = +ym.slice(0, 4) * 12 + +ym.slice(5, 7);
    if (l && l.k + 1 === k) {
      l.to = ym;
      l.k = k;
    } else out.push({ from: ym, to: ym, k });
  });
  return out.map((r) => (r.from === r.to ? r.from : `${r.from} – ${r.to}`));
}

/** 이 AOI 의 출처 구간(달 단위 실측): 같은 value_source 가 이어지는 동안 한 구간 */
export function vsSegments(ms: MonthRow[]) {
  const segs: { vs: string; from: string; to: string }[] = [];
  ms.forEach((x) => {
    const v = x.value_source;
    if (!v) return;
    const l = segs[segs.length - 1];
    if (l && l.vs === v) l.to = ymS(x.year, x.month);
    else segs.push({ vs: v, from: ymS(x.year, x.month), to: ymS(x.year, x.month) });
  });
  return segs;
}

/** 상태별 달 수 · 달 목록 */
export function statusCounts(ms: MonthRow[]) {
  return Object.fromEntries(STS.map((s) => [s, ms.filter((x) => x.status === s).length])) as Record<(typeof STS)[number], number>;
}
export const monthsOf = (ms: MonthRow[], st: string) => ms.filter((x) => x.status === st).map((x) => ymS(x.year, x.month));

/** 머리줄 나라 → AOI(한국 KR · 다른 나라 ADM0_<iso3>) */
export { aoiOfIso3 as aoiOfCountry } from "@/shared/lib/adm0";
