import type { Bbox } from "../model/types";

/**
 * 이동 경계(목업 map3d maxBounds): 전체 보기 범위 + 여유 — 범위의 15% · 다른 축 길이의 60% · 최소 4° 중 큰 값(가로로 긴 나라를 세로 칸에 맞춰도 끝이 잘리지 않게).
 * 전 세계에 가까운 범위(경도 폭 300° 이상)는 묶지 않는다. 목업의 한국 고정 상자(경북 북부)는 전 지역 범위로 바뀌어 같은 식을 쓴다.
 */
export function moveBounds(v: Bbox | null | undefined): [[number, number], [number, number]] | null {
  if (!v) return null;
  const sx = v[2] - v[0];
  const sy = v[3] - v[1];
  if (!(sx > 0 && sy > 0) || sx >= 300) return null;
  // 날짜 변경선을 넘는 나라(미국 172°–293°): ±180 으로 자르면 서쪽 끝(캄차카)에 갇힌다 → 묶지 않는다
  if (v[0] < -180 || v[2] > 180) return null;
  const dx = Math.max(sx * 0.15, sy * 0.6, 4);
  const dy = Math.max(sy * 0.15, sx * 0.6, 4);
  return [
    [Math.max(-180, v[0] - dx), Math.max(-85, v[1] - dy)],
    [Math.min(180, v[2] + dx), Math.min(85, v[3] + dy)],
  ];
}
