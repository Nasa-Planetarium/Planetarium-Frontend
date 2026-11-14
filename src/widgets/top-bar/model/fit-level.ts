/**
 * 머리줄 넘침 단계(목업 core.js fitTop) — 말줄임 대신 우선순위 낮은 칸부터 통째로 뺀다.
 * 단계 1 기상 → 2 나라 이름(ISO3 만) → 3 다음 통과 남은 분 → 4 다음 통과 → 5 위험지수 이름표 → 6 시계 숫자 → 7 위험 낱말 → 8 (폰) 지금 탭 이름.
 * 위험지수 값은 끝까지 남는다. 폭·글꼴·내용이 바뀔 때마다 0 부터 다시 잰다.
 *
 * 순수 함수: overflowAt(k) = 「단계 k 를 켰을 때 아직 넘치나」. DOM 측정은 부르는 쪽(use-fit-level)이 한다.
 */
export const MAX_FIT_LEVEL = 8;

export function fitLevel(overflowAt: (k: number) => boolean, max = MAX_FIT_LEVEL): number {
  let k = 0;
  while (k < max && overflowAt(k)) k++;
  return k;
}
