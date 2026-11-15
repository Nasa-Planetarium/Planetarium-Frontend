/**
 * 다음 달 발생 확률 — 화면 규칙만(값은 서버 그대로, 다시 계산하지 않는다 · A1).
 * 색 단계(계약 /occurrence/grid 설명): < 10% / 10~40% / 40~70% / ≥ 70%. 지속·산업 열원 의심은 단계 밖(회색).
 */
import card from "./occurrence-card.json";

export type Band = 0 | 1 | 2 | 3;
/** 회색(지속 열원 · 산업 열원 의심) */
export const GREY = 4;
export const BAND_TOK = ["occ-0", "occ-1", "occ-2", "occ-3", "occ-ps"] as const;
export const BAND_KEYS = ["lt10", "p10_40", "p40_70", "ge70"] as const;

export function bandOf(p: number | null | undefined): Band | null {
  if (p == null || !Number.isFinite(p)) return null;
  return p < 0.1 ? 0 : p < 0.4 ? 1 : p < 0.7 ? 2 : 3;
}

/** 색 칸 번호: 회색이면 4, 값 없으면 null */
export function shadeOf(p: number | null | undefined, grey: boolean | null | undefined): number | null {
  if (grey) return GREY;
  return bandOf(p);
}

/** 확률 표기 — 정수 %, 0 초과 1% 미만은 「<1%」, 99.5% 이상이지만 1 미만은 「>99%」 */
export function pct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "–";
  if (p > 0 && p < 0.005) return "<1%";
  if (p < 1 && p >= 0.995) return ">99%";
  return `${Math.round(p * 100)}%`;
}

/** 확률 차이(%p) 부호 붙여 */
export function ppDiff(p: number | null | undefined, b: number | null | undefined): string {
  if (p == null || b == null) return "–";
  const d = Math.round((p - b) * 100);
  return `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}%p`;
}

/** 0.5° 칸 사각형(칸 중심 → 꼭짓점 고리) */
export function cellRing(lat: number, lon: number, d = 0.5): [number, number][] {
  const h = d / 2;
  return [
    [lon - h, lat - h],
    [lon + h, lat - h],
    [lon + h, lat + h],
    [lon - h, lat + h],
    [lon - h, lat - h],
  ];
}

/** 도형 바깥 상자(서, 남, 동, 북) */
export function geomBounds(geoms: unknown[]): [number, number, number, number] | null {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      const x = c[0] as number,
        y = c[1] as number;
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
      return;
    }
    c.forEach(walk);
  };
  geoms.forEach((g) => walk((g as { coordinates?: unknown } | null)?.coordinates));
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/** 위경도 표기 */
export function latLon(lat: number, lon: number): string {
  const f = (v: number, p: string, q: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? p : q}`;
  return `${f(lat, "N", "S")} ${f(lon, "E", "W")}`;
}

/* ── 검증 수치(release meta 에서 옮긴 상수 — scripts/snap-occurrence.py) ── */
export type Score = { pr_auc: number; brier: number };
export type CardRow = { group: string; rows: number; pos_rate: number; model: Score; same_month: Score; last_year: Score; beats?: boolean };
export const CARD = card as {
  release: string;
  grid: { model: string; calibration: string; validation: string; table: CardRow[] };
  aoi: { model: string; calibration: string; validation: string; table: CardRow };
};

/** 화면에 보일 검증 행: 전 세계 · (나라 자체 행 또는 대륙 행) · 한국이면 시군구 모델 */
export function cardRows(iso3: string, continent: string | null): { scope: "grid" | "aoi"; row: CardRow }[] {
  const T = CARD.grid.table;
  const out: { scope: "grid" | "aoi"; row: CardRow }[] = [];
  const all = T.find((r) => r.group === "ALL");
  if (all) out.push({ scope: "grid", row: all });
  const own = T.find((r) => r.group === iso3) ?? (continent ? T.find((r) => r.group === continent) : undefined);
  if (own && own !== all) out.push({ scope: "grid", row: own });
  if (iso3 === "KOR") out.push({ scope: "aoi", row: CARD.aoi.table });
  return out;
}

/** 표 정렬: 산업 열원 의심(순위 없음)은 늘 맨 아래 */
export function sortOcc<T extends { p_any: number | null; baseline_p: number | null; suspected_industrial: boolean | null; name: string }>(rows: T[], k: "name" | "p" | "b" | "d", dir: number, lang: string): T[] {
  const v = (r: T): number | string | null => (k === "name" ? r.name : k === "p" ? r.p_any : k === "b" ? r.baseline_p : r.p_any == null || r.baseline_p == null ? null : r.p_any - r.baseline_p);
  return rows.slice().sort((a, b) => {
    const ga = a.suspected_industrial ? 1 : 0;
    const gb = b.suspected_industrial ? 1 : 0;
    if (ga !== gb) return ga - gb;
    const x = v(a);
    const y = v(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === "string" ? x.localeCompare(String(y), lang) : (x as number) - (y as number)) * dir;
  });
}
