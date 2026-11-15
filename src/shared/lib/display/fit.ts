/**
 * 시야 맞춤(표시 규칙서 R10, 2026-11-15) — PR #15 의 날짜 변경선 처리(fitLon)를 공통 함수 하나로(점 지도 · 세계 재생 두 벌이던 것).
 * 이 지도들은 세계 사본을 그리지 않아 ±180 밖은 빈 곳이므로, 날짜 변경선을 넘는 경도 범위는 더 넓은 쪽만 남긴다.
 */
export type LL = [[number, number], [number, number]];

/** 경도 범위(미국 172 → 293, 러시아 19 → 190 처럼 180 을 넘게 적힌 것)를 −180 ~ 180 안으로 — 더 넓은 쪽을 남긴다 */
export function fitLon(w: number, e: number): [number, number] {
  if (e > 180) return e - 180 > 180 - w ? [Math.max(-180, w - 360), e - 360] : [w, 180];
  if (w < -180) return -180 - w > e + 180 ? [w + 360, Math.min(180, e + 360)] : [-180, e];
  return [w, e];
}

/** 점 목록의 경계 상자(+pad). 경도 폭이 반 바퀴를 넘으면 날짜 변경선을 넘는 것으로 보고 서경을 +360 해서 다시 잰 뒤 fitLon */
export function boundsOf(pts: readonly (readonly number[])[], pad = 0): LL | null {
  let w = 999;
  let s = 999;
  let e = -999;
  let n = -999;
  pts.forEach((q) => {
    const x = q[0] as number;
    const y = q[1] as number;
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  });
  if (w > e) return null;
  if (e - w > 180) {
    w = 999;
    e = -999;
    pts.forEach((q) => {
      const x = (q[0] as number) < 0 ? (q[0] as number) + 360 : (q[0] as number);
      w = Math.min(w, x);
      e = Math.max(e, x);
    });
  }
  const [fw, fe] = fitLon(w - pad, e + pad);
  return [
    [fw, Math.max(-85, s - pad)],
    [fe, Math.min(85, n + pad)],
  ];
}

/** 상자 [서, 남, 동, 북](동 > 180 가능) → 맞춤 범위 */
export function boxBounds(b: readonly number[], latMin = -85, latMax = 85): LL {
  const [w, e] = fitLon(b[0] as number, b[2] as number);
  return [
    [w, Math.max(latMin, b[1] as number)],
    [e, Math.min(latMax, b[3] as number)],
  ];
}

/** 맞춤 범위가 서쪽으로 넘쳤으면(< −180) 동경 쪽 점을 −360, 동쪽으로 넘쳤으면(> 180) 서경 쪽 점을 +360 — 표지·윤곽을 고른 쪽에 둔다 */
export function lonInFit(lon: number, fit: LL): number {
  if (fit[0][0] < -180 && lon > 0 && lon - 360 >= fit[0][0] - 1) return lon - 360;
  if (fit[1][0] > 180 && lon < 0 && lon + 360 <= fit[1][0] + 1) return lon + 360;
  return lon;
}

export const FIT_PADDING = 16;
export const FIT_MAX_ZOOM = 9;
