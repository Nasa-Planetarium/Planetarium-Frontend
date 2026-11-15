import { api, unwrap } from "@/shared/api";
import { rowsToCsv } from "@/shared/lib/export";

/**
 * 위성 상태 CSV — 이 경로는 서버 CSV 가 없다(406) → JSON 응답의 days[]·months[] 행을 열 그대로 옮긴다. 날짜 = UTC.
 * freq=day 는 기간 ≤ 366일, freq=month 는 전체(기간 없음).
 */
export async function satelliteCsv(o: { freq: "day"; start: string; end: string } | { freq: "month" }) {
  const query = o.freq === "day" ? { start: o.start, end: o.end, freq: "day" as const } : { freq: "month" as const };
  const d = (await api.GET("/satellite-status", { params: { query } }).then(unwrap)) as unknown as { months?: Record<string, unknown>[]; days?: Record<string, unknown>[]; through?: string | null };
  const rows = (o.freq === "day" ? d.days : d.months) ?? [];
  return { text: rowsToCsv(rows), through: d.through ?? "" };
}
