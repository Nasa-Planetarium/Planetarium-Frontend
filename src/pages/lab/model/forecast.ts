/**
 * FireOutlook Planner 30일 전망 — 화면 규칙만(값은 서버 POST /forecast 응답 그대로, 다시 계산하지 않는다 · A1).
 * 규칙 출처: 모델팀 계약 「POST /forecast」(contract/openapi.yaml postForecast 설명) · 결정 F17.
 */
import type { components } from "@/shared/api";

export type Forecast = components["schemas"]["Forecast"];
export type ForecastDay = components["schemas"]["ForecastDay"];
export type ForecastQuery = components["schemas"]["ForecastQuery"];
type Ring = [number, number][];

/** 화면이 고른 지역: aoi_id · 사각형 [서, 남, 동, 북] · 다각형 고리([경도, 위도], 닫힌 고리) */
export type FcRegion = { kind: "aoi"; id: string } | { kind: "bbox"; b: [number, number, number, number] } | { kind: "poly"; ring: Ring };

/** 데모 기본 지역(F17): 한국 = 시도 강원, 아르헨티나 = 주 코르도바. 그 밖 나라는 나라 전체 */
export const DEFAULT_REGION: Record<string, string> = { KOR: "SIDO_51", ARG: "ADM1_ARG-1299" };

/**
 * 나라 1급 지도 면 id(public/geo/c/KOR.json) → 계약 aoi_id. 한국은 시도 코드가 ISO 3166-2 와 달라(강원 KR-42 → SIDO_51 등) 표로 둔다.
 * 표 = KOR.json 의 iso 열 × aoi_list 시도 이름(2026-11-15 release v1.2 에서 대어 봄).
 */
const KOR_SIDO: Record<string, string> = {
  "KOR-2494": "SIDO_43", "KOR-2495": "SIDO_28", "KOR-2496": "SIDO_51", "KOR-2497": "SIDO_11", "KOR-2498": "SIDO_41", "KOR-2499": "SIDO_52",
  "KOR-2500": "SIDO_29", "KOR-2502": "SIDO_44", "KOR-2503": "SIDO_30", "KOR-2504": "SIDO_27", "KOR-2505": "SIDO_48", "KOR-2506": "SIDO_46",
  "KOR-2507": "SIDO_26", "KOR-2508": "SIDO_31", "KOR-2509": "SIDO_47", "KOR-2510": "SIDO_50", "KOR-5129": "SIDO_36",
};
export function aoiOfFace(faceId: string): string {
  return KOR_SIDO[faceId] ?? `ADM1_${faceId}`;
}

/** 꼭짓점 상한(계약 ForecastRegion — 우리가 정한 값) */
export const MAX_VERTICES = 2000;

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
/** 주소 ?region= · ?bbox=서,남,동,북 · ?poly=경도,위도;경도,위도;… → 지역(틀리면 null) */
export function parseRegion(sp: { get(k: string): string | null }): FcRegion | null {
  const id = sp.get("region");
  if (id && /^[A-Za-z0-9_:-]{1,40}$/.test(id)) return { kind: "aoi", id };
  const bb = sp.get("bbox");
  if (bb) {
    const b = bb.split(",").map(num);
    if (b.length === 4 && b.every(Number.isFinite) && b[0]! < b[2]! && b[1]! < b[3]! && b[1]! >= -90 && b[3]! <= 90 && b[0]! >= -180 && b[2]! <= 180) return { kind: "bbox", b: b as [number, number, number, number] };
    return null;
  }
  const pp = sp.get("poly");
  if (pp) {
    const pts = pp.split(";").map((p) => p.split(",").map(num));
    if (pts.length < 3 || pts.length > MAX_VERTICES || !pts.every((p) => p.length === 2 && p.every(Number.isFinite))) return null;
    return { kind: "poly", ring: closeRing(pts as Ring) };
  }
  return null;
}

export function closeRing(r: Ring): Ring {
  if (!r.length) return r;
  const a = r[0]!;
  const z = r[r.length - 1]!;
  return a[0] === z[0] && a[1] === z[1] ? r : [...r, [a[0], a[1]]];
}

/** 지역 → 주소 조각(parseRegion 의 거꾸로). 닫는 점은 빼고 적는다 */
export function regionParams(r: FcRegion): Record<string, string> {
  const f = (v: number) => String(Math.round(v * 1e6) / 1e6);
  if (r.kind === "aoi") return { region: r.id };
  if (r.kind === "bbox") return { bbox: r.b.map(f).join(",") };
  return { poly: r.ring.slice(0, -1).map((p) => `${f(p[0])},${f(p[1])}`).join(";") };
}

/** 지역 → 요청 본문(화면 기본 30일) */
export function queryOf(r: FcRegion): ForecastQuery {
  const region = r.kind === "aoi" ? r.id : r.kind === "bbox" ? [...r.b] : { type: "Polygon" as const, coordinates: [r.ring.map((p) => [p[0], p[1]])] };
  return { region, horizon_days: 30 } as ForecastQuery;
}
export const regionKeyOf = (r: FcRegion) => JSON.stringify(regionParams(r));

/** 머리 「관측 기준 MM-DD」 — as_of 글자 그대로 자른다(날짜 계산 없음) */
export const asOfMD = (asOf: string | null | undefined) => (asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf.slice(5) : "–");

/** 일별 구분: lead ≤ 7 「모델 예측」, ≥ 8 「평년 패턴 기반」 */
export const leadKind = (d: Pick<ForecastDay, "lead_days_from_as_of">): "model" | "pattern" => (d.lead_days_from_as_of <= 7 ? "model" : "pattern");

/**
 * 요약 표시 방식
 *  - hint: display_hint 가 있으면(p_any ≥ 0.98) 확률 대신 그 문구 + 예상 탐지 수가 주 정보
 *  - baseline: value_source baseline 또는 skill none → 「예년 수준(모델 예측력 낮음)」, 「예측」이라 부르지 않음
 *  - model: model_calibrated · model → 확률 + skill
 */
export function summaryMode(r: Pick<Forecast, "display_hint" | "value_source" | "skill">): "hint" | "baseline" | "model" {
  if (r.display_hint) return "hint";
  if (r.value_source === "baseline" || r.skill === "none") return "baseline";
  return "model";
}

/** 고른 지역 자체가 산업 열원 의심인가(→ 주 숫자 회색, 순위·강조 없음) */
export const selfIndustrial = (r: Pick<Forecast, "suspected_industrial_sgg">, reg: FcRegion) => reg.kind === "aoi" && r.suspected_industrial_sgg.includes(reg.id);

/** 확률 % 소수 한 자리 — 0 초과 0.1% 미만 「<0.1%」, 99.95% 이상이지만 1 미만 「>99.9%」 */
export function pct1(p: number | null | undefined, lang = "ko"): string {
  if (p == null || !Number.isFinite(p)) return "–";
  if (p > 0 && p < 0.0005) return "<0.1%";
  if (p < 1 && p >= 0.9995) return ">99.9%";
  return `${new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(p * 100)}%`;
}

/** 탐지 수·일 수 — 응답 자리수(소수 2자리) 그대로, 끝 0 은 뺌 */
export const cnt = (n: number | null | undefined, lang = "ko") => (n == null || !Number.isFinite(n) ? "–" : new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(n));

/** 날짜 짧게: ko 「11.15」, 그 밖 「Nov 15」 */
export function md(iso: string, lang: string): string {
  const m = +iso.slice(5, 7);
  const d = +iso.slice(8, 10);
  if (lang === "ko") return `${m}.${d}`;
  return new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(+iso.slice(0, 4), m - 1, d)));
}

/** 그린 영역 꼭짓점 수(닫는 점 뺌) */
export const vertexCount = (r: FcRegion) => (r.kind === "poly" ? Math.max(0, r.ring.length - 1) : r.kind === "bbox" ? 4 : 0);
