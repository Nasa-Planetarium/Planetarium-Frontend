import { api, getCsvText, unwrap } from "@/shared/api";
import { rowsToCsv } from "@/shared/lib/export";
import { monthSpan, type FireRegime } from "./queries";

/** 불 세기 FRP 칸 × 달 CSV — 서버 CSV(GET /cells/frp?freq=month&format=csv) 그대로(칸 중심 위경도 · S-NPP 환산 합·최대 · 점 수) */
export const frpCsv = (aoiId: string, ym: string) => getCsvText("/cells/frp", { aoi_id: aoiId, ...monthSpan(ym), freq: "month" });

/**
 * 불 유형 CSV — 이 경로는 서버 CSV 가 없다(406) → JSON 응답의 months 행을 열 그대로 옮긴다(값 다시 계산 없음).
 * 앞 열 aoi_id · name, 끝 열 data_release · coverage_available.
 */
export async function regimeCsv(aoiId: string, start: string, end: string) {
  const d = (await api.GET("/aois/{aoiId}/fire-regime", { params: { path: { aoiId }, query: { start, end } } }).then(unwrap)) as unknown as FireRegime & { data_release?: string };
  const rows = d.months.map((m) => ({ aoi_id: d.aoi_id, name: d.name, ...m, data_release: d.data_release ?? "", coverage_available: d.coverage?.available ?? "" }));
  const cols = ["aoi_id", "name", ...new Set(d.months.flatMap((m) => Object.keys(m))), "data_release", "coverage_available"];
  return rowsToCsv(rows, cols);
}
