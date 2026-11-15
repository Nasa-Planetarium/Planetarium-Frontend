import { describe, expect, it } from "vitest";
import { frpSummary, isRegime, sharePct } from "./summary";

describe("frpSummary", () => {
  it("칸이 없으면 null — 0 MW 로 바꾸지 않는다", () => {
    expect(frpSummary([])).toBeNull();
    expect(frpSummary(null)).toBeNull();
  });
  it("Σ 환산 합 · max 환산 최대 · Σ 점", () => {
    const s = frpSummary([
      { frp_snpp_equiv_sum: 10.5, frp_snpp_equiv_max: 4, frp_sum: 11, n_points: 3 },
      { frp_snpp_equiv_sum: 2, frp_snpp_equiv_max: 7.25, frp_sum: null, n_points: 1 },
    ]);
    expect(s).toEqual({ sum: 12.5, max: 7.25, rawSum: 11, cells: 2, points: 4 });
  });
  it("값 0 인 칸도 칸으로 센다(행 있음 ≠ 행 없음)", () => {
    expect(frpSummary([{ frp_snpp_equiv_sum: 0, frp_snpp_equiv_max: 0, n_points: 1 }])).toEqual({ sum: 0, max: 0, rawSum: null, cells: 1, points: 1 });
  });
});

describe("regime", () => {
  it("코드 4종만", () => {
    expect(isRegime("large_fire")).toBe(true);
    expect(isRegime("none")).toBe(true);
    expect(isRegime("big")).toBe(false);
  });
  it("share_large → 백분율", () => {
    expect(sharePct(0.5456)).toBe(55);
    expect(sharePct(null)).toBeNull();
  });
});
