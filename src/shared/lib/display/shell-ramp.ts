import { hexRgb } from "../map-color";

/**
 * 어두운 셸 위 연속 램프(캘린더 연×월 칸 · 분석 달력 · 지휘 통계 · 상황판 달력) — --h0..--h6 을 정해진 위치에(목업 charts.ramp).
 * 네 화면(calendar · analysis · cmd · home model)에 똑같이 복사돼 있던 makeRamp 를 하나로 모은 것(표시 규칙서 §5 — 다시 갈라지지 않게 정적 검사가 잰다).
 * 지도 칸 색은 이 램프가 아니라 이산 5단계(ramp.ts)다. 캘린더 칸을 지도와 같은 눈금으로 할지는 사람 결정 D1.
 */
export const SHELL_RAMP_AT = [0, 0.12, 0.3, 0.5, 0.7, 0.86, 1] as const;

export function shellRamp(stops: readonly string[]): (t: number) => string {
  const S = SHELL_RAMP_AT.map((t, i) => [t, hexRgb(stops[i] ?? "#000")] as const);
  return (t0: number) => {
    const t = Math.max(0, Math.min(1, t0));
    let j = 0;
    while (j < S.length - 2 && t > (S[j + 1] as (typeof S)[number])[0]) j++;
    const [a, ca] = S[j] as (typeof S)[number];
    const [b, cb] = S[j + 1] as (typeof S)[number];
    const u = (t - a) / (b - a || 1);
    return "#" + ca.map((v, i) => Math.round(v + ((cb[i] as number) - v) * u).toString(16).padStart(2, "0")).join("");
  };
}
