/**
 * 불 유형 · FRP 화면 모델(순수). 값은 응답 그대로 — 여기서는 칸 목록을 묶기만 한다(Σ·max·개수, 계약 /cells/frp 의 월 묶음과 같은 규칙).
 * 모델 값을 다시 계산하지 않는다(A1).
 */
export const REGIMES = ["large_fire", "many_small", "mixed", "none"] as const;
export type Regime = (typeof REGIMES)[number];
export const isRegime = (s: unknown): s is Regime => typeof s === "string" && (REGIMES as readonly string[]).includes(s);

export interface FrpCellLike {
  frp_snpp_equiv_sum?: number | null;
  frp_snpp_equiv_max?: number | null;
  frp_sum?: number | null;
  n_points: number;
}
export interface FrpSummary {
  /** Σ frp_snpp_equiv_sum (MW·칸날 합) */
  sum: number;
  /** max frp_snpp_equiv_max (MW) */
  max: number | null;
  /** Σ frp_sum(원 FRP, 참고) */
  rawSum: number | null;
  cells: number;
  points: number;
}

/** 칸 목록 → 요약. 칸이 없으면 null(「이 달 FRP 없음」 — 0 MW 로 바꾸지 않는다) */
export function frpSummary(cells: readonly FrpCellLike[] | null | undefined): FrpSummary | null {
  if (!cells || !cells.length) return null;
  let sum = 0;
  let max: number | null = null;
  let raw = 0;
  let rawN = 0;
  let points = 0;
  for (const c of cells) {
    sum += c.frp_snpp_equiv_sum ?? 0;
    if (c.frp_snpp_equiv_max != null) max = max == null ? c.frp_snpp_equiv_max : Math.max(max, c.frp_snpp_equiv_max);
    if (c.frp_sum != null) {
      raw += c.frp_sum;
      rawN++;
    }
    points += c.n_points;
  }
  return { sum, max, rawSum: rawN ? raw : null, cells: cells.length, points };
}

/** 큰 불 비중(share_large) 0–1 → 백분율 정수. null 은 null */
export const sharePct = (s: number | null | undefined) => (s == null ? null : Math.round(s * 100));
