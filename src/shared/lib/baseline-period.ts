/**
 * 같은 달 비교의 평년(기준) 기간 — 비교 응답 `baseline_period`("2001-2025" · "2012-2025") 그대로.
 *
 * 모델팀 v1.2(2026-11-15): 지역마다 연속성 점검으로 기간을 고른다(한국 2012–2025, 아르헨티나·전 세계 2001–2025).
 * 옛 백엔드 응답엔 필드가 없다 → 부른 쪽이 준 기본값(지금까지 화면에 적던 2001–2025)을 그대로 쓴다.
 * 기간을 다시 정하지 않는다. 글자를 숫자 두 개로 읽기만 한다.
 */
export interface BaselinePeriod {
  from: number;
  to: number;
  /** 기간에 든 해 수(to − from + 1). 실제 비교에 쓴 연수는 응답 n_baseline_years */
  years: number;
}

export const DEFAULT_BASELINE: BaselinePeriod = { from: 2001, to: 2025, years: 25 };

/** "2012-2025" · "2012–2025" · "2012~2025" → { from, to, years }. 못 읽으면 null */
export function parseBaselinePeriod(s: string | null | undefined): BaselinePeriod | null {
  if (typeof s !== "string") return null;
  const m = /^\s*(\d{4})\s*[-–~]\s*(\d{4})\s*$/.exec(s);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!(from <= to)) return null;
  return { from, to, years: to - from + 1 };
}

/** 응답 값이 있으면 그것, 없으면(옛 응답) fallback */
export function baselineOf(s: string | null | undefined, fallback: { from: number; to: number } = DEFAULT_BASELINE): BaselinePeriod {
  return parseBaselinePeriod(s) ?? { from: fallback.from, to: fallback.to, years: fallback.to - fallback.from + 1 };
}

/** continuity_source → 물려받은 상위 지역 id(`parent:<id>`) · 자기 값이면 null */
export function continuityParent(s: string | null | undefined): string | null {
  return typeof s === "string" && s.startsWith("parent:") ? s.slice(7) || null : null;
}
