import { describe, expect, it } from "vitest";
import { harmKeys, inRange, monthsOf, periods, pooledOrder, runs, scopeKey, scopeOrder, statusCounts, vsSegments } from "./method";

describe("method 화면 모델", () => {
  it("연속 달은 한 구간으로 묶는다", () => {
    expect(runs(["2026-08", "2026-09", "2026-10", "2026-12"])).toEqual(["2026-08 – 2026-10", "2026-12"]);
    expect(runs(["2025-12", "2026-01"])).toEqual(["2025-12 – 2026-01"]);
  });
  it("기간 행은 시작 달이 있는 출처만(실서버 n21_bridge·배경 행 from null)", () => {
    const M = { value_sources: [{ value_source: "snpp_observed", from: "2012-02", to: "2026-10" }, { value_source: "n21_bridge", from: null, to: null }] };
    expect(periods(M).map((g) => g.value_source)).toEqual(["snpp_observed"]);
  });
  it("채택 모델 먼저, 나머지는 MAE 오름차순", () => {
    const kp = { ratio_lat: { MAE: 80.2, bias: 1.39 }, m2v_xgb: { MAE: 42.1, bias: 0.99 }, ratio_country: { MAE: 49.4, bias: 0.98 } };
    expect(pooledOrder(kp, "m2v_xgb")).toEqual(["m2v_xgb", "ratio_country", "ratio_lat"]);
  });
  it("검증 범위: world · korea · 나라 · 대륙", () => {
    expect(scopeOrder(["continent:Asia", "korea", "argentina", "world"])).toEqual(["world", "korea", "argentina", "continent:Asia"]);
    expect(scopeKey("continent:North America")).toBe("method.sc.c_north_america");
  });
  it("통합 규칙 키는 정한 순서 먼저", () => {
    expect(harmKeys({ zzz: "a", n20_bridge: "b", modis_m2v: "c" })).toEqual(["modis_m2v", "n20_bridge", "zzz"]);
  });
  it("상태 세기·출처 구간은 달 행 그대로(범위 밖 달 빼고)", () => {
    const ms = [
      { year: 2000, month: 10, status: "out_of_range", value_source: null },
      { year: 2026, month: 9, status: "nrt", value_source: "snpp_observed" },
      { year: 2026, month: 10, status: "nrt", value_source: "snpp_observed" },
      { year: 2026, month: 11, status: "partial", value_source: "n20_bridge" },
      { year: 2026, month: 12, status: "out_of_range", value_source: null },
    ];
    const r = inRange(ms);
    expect(r).toHaveLength(3);
    expect(statusCounts(r)).toMatchObject({ nrt: 2, partial: 1, missing: 0 });
    expect(monthsOf(r, "nrt")).toEqual(["2026-09", "2026-10"]);
    expect(vsSegments(r)).toEqual([
      { vs: "snpp_observed", from: "2026-09", to: "2026-10" },
      { vs: "n20_bridge", from: "2026-11", to: "2026-11" },
    ]);
  });
});
