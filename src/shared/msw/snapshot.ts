/**
 * release 정적 스냅숏(public/data/snap/*.json, 형식은 같은 폴더 FORMAT.md) → 계약(openapi.yaml) 응답 모양.
 *
 * 값은 release 그대로다(결정 A1). 여기서 하는 일은 「배율 되돌리기(×10·×100)」와 「코드 인덱스 → 코드 문자열」뿐이다.
 * verdict·percentile·status 를 다시 계산하지 않는다. 결측(null)은 null 로 둔다(E2, 0 으로 바꾸지 않음).
 * 이 파일은 MSW 처리기만 쓴다. 화면은 이 파일을 import 하지 않는다(실제 백엔드로 바뀌면 이 파일은 빠진다).
 */
import type { components } from "@/shared/api";

type S = components["schemas"];
export type CalendarMonth = S["CalendarMonth"];
export type Aoi = S["Aoi"];
export type Comparison = S["Comparison"];

type Arr = (number | null)[];

export interface KoreaAoiRaw {
  id: string;
  name: string;
  level: "kr" | "sido" | "sgg";
  parent: string | null;
  n_cells: number;
  v: Arr; lo: Arr; hi: Arr; rm: Arr; rv: Arr;
  pct: Arr; rat: Arr; vd: Arr; bm: Arr; b25: Arr; b75: Arr; nb: Arr; ls: Arr;
  vs?: Arr; ds?: Arr; st?: Arr;
  /** v1.1 진행 중인 달 달 전체 추정(value_projected ×10) — snap.partial 순서와 같은 자리 */
  vp?: Arr;
}
export interface KoreaSnap {
  release: string;
  method_version: string;
  months: { start: string; n: number };
  codes: { vs: string[]; ds: string[]; st: string[]; vd: string[] };
  month: { vs: Arr; ds: Arr; st: Arr };
  /** v1.1 진행 중인 달(m = 달 번호, as_of_date = 마지막 관측일) */
  partial?: { m: number; ym: string; as_of_date: string }[];
  aoi: KoreaAoiRaw[];
}
export interface CountryAoiRaw {
  id: string;
  name: string;
  level: string;
  parent: string | null;
  v: Arr;
  vd: Arr;
}
export interface CountriesSnap {
  release: string;
  method_version: string;
  months: { start: string; n: number };
  codes: { vd: string[]; vs: string[]; ds?: string[]; st?: string[] };
  world: { v: Arr; vs: Arr; ds: Arr; st: Arr };
  iso3_to_aoi: Record<string, string | null>;
  aoi: CountryAoiRaw[];
}

const div = (x: number | null | undefined, k: number) => (x == null ? null : x / k);
const code = <T extends string>(list: readonly string[], i: number | null | undefined) => (i == null ? null : ((list[i] ?? null) as T | null));

/** 달 인덱스 m(0 = 2000-11) → { year, month } */
export function ymOf(start: string, m: number) {
  const [y0, m0] = start.split("-").map(Number) as [number, number];
  const t = (y0 * 12 + (m0 - 1)) + m;
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
}
export function indexOf(start: string, year: number, month: number) {
  const [y0, m0] = start.split("-").map(Number) as [number, number];
  return year * 12 + (month - 1) - (y0 * 12 + (m0 - 1));
}

const LEVEL: Record<string, S["AoiLevel"]> = { kr: "country", sido: "kr_sido", sgg: "kr_sgg", country: "country", world: "world", continent: "continent" };

export function koreaAoi(a: KoreaAoiRaw): Aoi {
  return { aoi_id: a.id, name_ko: a.name, name_en: null, level: LEVEL[a.level] ?? "country", parent_id: a.parent, n_cells: a.n_cells, hidden: false };
}
export function countryAoi(a: CountryAoiRaw): Aoi {
  return { aoi_id: a.id, name_ko: a.name, name_en: null, level: LEVEL[a.level] ?? "country", parent_id: a.parent, n_cells: 0, hidden: false };
}

/** 한국 AOI 한 달 행(계약 CalendarMonth). 달 공통 열(vs·ds·st)은 aoi[k] ?? month[k] (FORMAT.md) */
export function koreaMonth(snap: KoreaSnap, a: KoreaAoiRaw, m: number): CalendarMonth {
  const { year, month } = ymOf(snap.months.start, m);
  const pick = (k: "vs" | "ds" | "st") => a[k]?.[m] ?? snap.month[k][m] ?? null;
  return {
    year,
    month,
    value: div(a.v[m], 10),
    value_lo: div(a.lo[m], 10),
    value_hi: div(a.hi[m], 10),
    raw_modis: a.rm[m] ?? null,
    raw_viirs: a.rv[m] ?? null,
    value_source: code<S["ValueSource"]>(snap.codes.vs, pick("vs")),
    data_source: code<S["DataSource"]>(snap.codes.ds, pick("ds")),
    status: (code<S["MonthStatus"]>(snap.codes.st, pick("st")) ?? "out_of_range") as S["MonthStatus"],
    n_cells: a.n_cells,
    verdict: code<S["Verdict"]>(snap.codes.vd, a.vd[m]),
    percentile: div(a.pct[m], 10),
    ratio_to_median: div(a.rat[m], 100),
    low_sample: a.ls[m] == null ? null : a.ls[m] === 1,
    ...partialOf(snap, a, m),
  };
}

/**
 * v1.1 진행 중인 달(실서버 /calendar 의 value_projected · as_of_date — 팀 계약 v1.1 모양). 진행 중인 달이 아니면 붙이지 않는다.
 * 값은 스냅숏 vp(release aoi_month.value_projected ×10) 그대로.
 */
function partialOf(snap: KoreaSnap, a: KoreaAoiRaw, m: number): Record<string, unknown> {
  const k = (snap.partial ?? []).findIndex((p) => p.m === m);
  if (k < 0) return {};
  return { value_projected: div(a.vp?.[k] ?? null, 10), as_of_date: snap.partial?.[k]?.as_of_date ?? null };
}

/**
 * 나라 AOI 한 달 행. countries.json 은 값(v)·판정(vd)만 담는다 — 나머지 열은 null.
 * 달 공통 열(vs·ds·st)은 world 배열을 쓴다 [추론: 한국 270개 AOI 는 달마다 같았다(FORMAT.md 잰 것), 나라도 같다고 봄 — 백엔드가 오면 그 값이 이긴다].
 */
export function countryMonth(snap: CountriesSnap, a: CountryAoiRaw, m: number): CalendarMonth {
  const { year, month } = ymOf(snap.months.start, m);
  const st = code<S["MonthStatus"]>(snap.codes.st ?? ["ok", "nrt", "partial", "missing"], snap.world.st[m]);
  return {
    year,
    month,
    value: div(a.v[m], 10),
    value_lo: null,
    value_hi: null,
    raw_modis: null,
    raw_viirs: null,
    value_source: code<S["ValueSource"]>(snap.codes.vs, snap.world.vs[m]),
    data_source: code<S["DataSource"]>(snap.codes.ds ?? ["SP", "NRT"], snap.world.ds[m]),
    status: (st ?? "out_of_range") as S["MonthStatus"],
    verdict: code<S["Verdict"]>(snap.codes.vd, a.vd[m]),
    percentile: null,
    ratio_to_median: null,
    low_sample: null,
  };
}

/** 한국 AOI 비교(계약 Comparison). 기준 분포 열(bm·b25·b75·nb)은 파일 값 그대로 */
export function koreaComparison(snap: KoreaSnap, a: KoreaAoiRaw, m: number): Comparison {
  const row = koreaMonth(snap, a, m);
  return {
    aoi_id: a.id,
    year: row.year,
    month: row.month,
    value: row.value,
    value_lo: row.value_lo,
    value_hi: row.value_hi,
    baseline_median: div(a.bm[m], 10),
    baseline_p25: div(a.b25[m], 10),
    baseline_p75: div(a.b75[m], 10),
    percentile: row.percentile,
    ratio_to_median: row.ratio_to_median,
    n_baseline_years: a.nb[m] ?? null,
    verdict: row.verdict,
    status: row.status,
    value_source: row.value_source,
    low_sample: row.low_sample,
    method_version: snap.method_version,
  };
}
