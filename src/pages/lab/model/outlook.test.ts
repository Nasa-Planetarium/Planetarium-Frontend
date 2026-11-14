import { describe, expect, it } from "vitest";
import { clsOf, dimYM, hindRows, lvOf, niceMax, olRow, skill, valRows, type OutlookAoi } from "./outlook";

const aoi: OutlookAoi = {
  id: "SIDO_47",
  name: "경상북도",
  p: [178, 120, 90],
  lo: [77, null, 40],
  hi: [362, 300, 200],
  bm: [104, 100, 80],
  b10: [50, 40, 30],
  b90: [300, 250, 200],
  x: [171, 120, 112],
  vd: [1, 0, null],
  cov: [875],
  mae: [93],
  mae0: [110],
  n: [168],
  rv: [10],
  rx: [105],
  hp: [20, -5],
  hl: [10, -9],
  hh: [40, 30],
  ha: [25, 50],
  hin: [1, 0],
  pt: 443,
  ptp: 1023,
};

describe("lab 전망 모델", () => {
  it("×10 정수를 값으로(배율만 되돌림)", () => {
    const r = olRow(aoi, 0, "all", "경상북도");
    expect(r.median).toBe(17.8);
    expect(r.lo80).toBe(7.7);
    expect(r.hi80).toBe(36.2);
    expect(r.baseline).toEqual({ p10: 5, p50: 10.4, p90: 30 });
    expect(r.ratio).toBe(1.71);
    expect(r.level).toBe("normal");
    expect(r.verdict).toBe("similar");
  });
  it("판정 코드: 0 높음 · 1 평년 · 2 낮음 · null 자료 부족", () => {
    expect(olRow(aoi, 1, "a", "").level).toBe("high");
    expect(lvOf(olRow(aoi, 2, "a", ""))).toBe("na");
    expect(clsOf(olRow(aoi, 2, "a", ""))).toBe(0);
    expect(clsOf(olRow(aoi, 1, "a", ""))).toBe(3);
    expect(olRow(aoi, 1, "a", "").lo80).toBeNull();
  });
  it("자료 없는 지역은 값 없이(0 아님 — E2)", () => {
    const r = olRow(null, 0, "x", "x");
    expect(r.median).toBeNull();
    expect(lvOf(r)).toBe("na");
  });
  it("뒷검증 행과 검증 수치", () => {
    const h = hindRows(aoi, ["2024-01", "2024-02"]);
    expect(h[1]).toEqual({ ym: "2024-02", actual: 5, median: 0, lo80: 0, hi80: 3, hit: false });
    expect(skill(aoi)).toEqual({ mae: 0.093, mae0: 0.11, cov: 0.875, n: 168 });
  });
  it("보정 검증 행: meta.validation 이 없으면 korea_pooled 를 채택 모델 먼저 옮긴다", () => {
    const rows = valRows({ m2v_evaluation: { adopted: "m2v_xgb", korea_pooled: { ratio_lat: { MAE: 80.2, bias: 1.39 }, m2v_xgb: { MAE: 42.1, bias: 0.99 } } } });
    expect(rows.map((r) => [r.model, r.selected, r.metrics.mae_month_total])).toEqual([
      ["m2v_xgb", true, 42.1],
      ["ratio_lat", false, 80.2],
    ]);
  });
  it("축 위끝·달 일수", () => {
    expect(niceMax(37)).toBe(50);
    expect(niceMax(0)).toBe(1);
    expect(dimYM("2026-02")).toBe(28);
  });
});
