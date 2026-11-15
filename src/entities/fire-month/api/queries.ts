import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap, type components } from "@/shared/api";

type S = components["schemas"];
export type FireRegime = S["FireRegime"];
export type FireRegimeMonth = S["FireRegimeMonth"];
export type CellFrpList = S["CellFrpList"];
export type CellFrp = S["CellFrp"];

const DAY = 24 * 60 * 60 * 1000;
/** YYYY-MM → 그 달 첫날·마지막 날(YYYY-MM-DD) */
export function monthSpan(ym: string): { start: string; end: string } {
  const y = +ym.slice(0, 4);
  const m = +ym.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}` };
}

/**
 * 불 유형 배지 한 달(계약 GET /aois/{aoiId}/fire-regime?start&end — release aoi_month_fire_regime).
 * 범위 밖 AOI 는 오류가 아니라 200 + months [] + coverage.available=false → 화면은 「이 지역 자료 없음」.
 */
export const fireRegimeQuery = (aoiId: string, ym: string, mv: string | null, on = true) =>
  queryOptions({
    queryKey: qk(`aois/${aoiId}/fire-regime`, { start: ym, end: ym }, mv),
    queryFn: async ({ signal }) =>
      (await api.GET("/aois/{aoiId}/fire-regime", { params: { path: { aoiId }, query: { start: ym, end: ym } }, signal }).then(unwrap)) as unknown as FireRegime,
    staleTime: DAY,
    enabled: !!mv && on,
    retry: false,
  });

/**
 * 불 세기 FRP(S-NPP 기준) 한 달 칸 목록(계약 GET /cells/frp?aoi_id&start&end&freq=month — release harmonized_cell_day_frp).
 * 행 없는 칸 = 기준 점 감지 없음(FRP 없음) — 0 MW 로 칠하지 않는다.
 */
export const frpMonthQuery = (aoiId: string, ym: string, mv: string | null, on = true) => {
  const { start, end } = monthSpan(ym);
  return queryOptions({
    queryKey: qk("cells/frp", { aoi_id: aoiId, start, end, freq: "month" }, mv),
    queryFn: async ({ signal }) =>
      (await api.GET("/cells/frp", { params: { query: { aoi_id: aoiId, start, end, freq: "month" } }, signal }).then(unwrap)) as unknown as CellFrpList,
    staleTime: DAY,
    enabled: !!mv && on,
    retry: false,
  });
};
