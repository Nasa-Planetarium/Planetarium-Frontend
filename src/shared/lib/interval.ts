/**
 * 불확실성 구간 화면 표시 규칙(결정 F16 · 모델팀 답 2026-11-15) — 구간을 그리는·쓰는 화면은 모두 이것만 부른다.
 *
 *   lo = min(value_lo, value_hi, value) · hi = max(value_lo, value_hi, value)
 *
 * - 값을 자르지 않고 구간을 넓힌다. value(평균 모델)와 value_lo·value_hi(q10·q90 별도 모델)는 다른 모델이라
 *   value 가 구간 밖일 수 있고(대부분 2002–2012 modis_m2v), lo > hi 는 산업 열원 제거의 소수점 오차다.
 * - value_lo 또는 value_hi 가 null(Terra 단독 시기 등)이면 구간 없이 값만 → null.
 * - value 가 null(결측)이면 그릴 값이 없으니 구간도 없다 → null.
 * - 데이터·API·CSV 내보내기는 원값 그대로 — 이 함수는 화면에서만 쓴다.
 */
export interface Interval {
  lo: number;
  hi: number;
}

const num = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

export function displayInterval(value: number | null | undefined, lo: number | null | undefined, hi: number | null | undefined): Interval | null {
  if (!num(value) || !num(lo) || !num(hi)) return null;
  return { lo: Math.min(lo, hi, value), hi: Math.max(lo, hi, value) };
}

/** 폭이 있는 구간인가(lo = hi 인 S-NPP 실측 행은 「실측 · 구간 없음」) */
export const hasSpread = (iv: Interval | null | undefined): iv is Interval => iv != null && iv.hi > iv.lo;
