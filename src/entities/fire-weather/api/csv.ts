import { getCsvText } from "@/shared/api";

/** FWI 일별 CSV — 서버 CSV(GET /aois/{aoiId}/fwi?start&end&format=csv, 기간 ≤ 366일) 그대로. 날짜 = 현지 태양시 날 */
export const fwiCsv = (aoiId: string, start: string, end: string) => getCsvText("/aois/{aoiId}/fwi", { start, end }, { aoiId });

/** as_of_date 로 끝나는 365일 창(계약 한도 366일 안) */
export function fwiWindow(asOf: string): { start: string; end: string } {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 364);
  return { start: d.toISOString().slice(0, 10), end: asOf };
}
