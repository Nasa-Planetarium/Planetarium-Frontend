/**
 * 하천·도로 선 파일(public/geo/lines/<ISO3>.json)이 있는 나라. 없는 나라는 요청하지 않는다 —
 * 전에는 한국 밖(JPN·USA·BRA…)에서 지도를 열 때마다 404 가 브라우저 콘솔 오류로 남았다(2026-11-15 운영 66화면 측정).
 * 전 세계 하천선(public/geo/rivers-world.json)은 이것과 따로 그대로 읽는다.
 * 파일을 더하거나 빼면 여기도 고친다 — lines.test.ts 가 폴더와 대조한다.
 */
export const LINES_ISO3: ReadonlySet<string> = new Set(["KOR"]);
export const hasLines = (iso3: string | null | undefined): boolean => !!iso3 && LINES_ISO3.has(iso3);
