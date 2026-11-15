/**
 * 지도 값 눈금(표시 규칙서 R3, 2026-11-15) — 순수 함수.
 * 지도 칸 값의 단위는 하나: 「0.1° 칸당 월 감지량」. 0.1° 칸은 값 그대로, 1° 칸은 합 ÷ 100(그 1° 안 0.1° 칸 평균),
 * 여러 달 합은 ÷ 달 수. 단계 경계는 0.1 · 1 · 10 · 100(로그 5단계). 값 ≤ 0 과 null 은 그리지 않는다(v1.2 음수 칸 = 0).
 * 지역 최댓값에 대한 상대 색(sqrt(v/vmax) · log1p(v)/max)은 쓰지 않는다 — 나라마다 같은 색이 다른 양을 뜻하게 된다.
 */
export const UNIT_DEG = 0.1;
export const STEPS = [0.1, 1, 10, 100] as const;
export const N_STEPS = STEPS.length + 1;

/** 칸 값 → 0.1° 칸당 월 감지량. cellDeg = 칸 크기(도), months = 합친 달 수 */
export function density(v: number | null | undefined, cellDeg = UNIT_DEG, months = 1): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  const n = (cellDeg / UNIT_DEG) ** 2;
  return v / (Math.max(1e-9, n) * Math.max(1, months));
}

/** 0.1° 칸당 값 → 단계 0–4. 그리지 않는 값(≤ 0 · null · NaN)은 null */
export function stepOf(d: number | null | undefined): number | null {
  if (d == null || !Number.isFinite(d) || d <= 0) return null;
  let k = 0;
  for (const s of STEPS) if (d >= s) k++;
  return k;
}

/** 칸 값 그대로 → 단계(크기·달 수를 넣으면 먼저 0.1° 칸당으로) */
export const stepOfCell = (v: number | null | undefined, cellDeg = UNIT_DEG, months = 1) => stepOf(density(v, cellDeg, months));

/** 범례 경계 숫자(화면 언어 숫자 꼴은 쓰는 쪽) */
export const STEP_LABELS = ["0.1", "1", "10", "100"] as const;
