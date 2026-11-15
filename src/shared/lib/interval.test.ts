import { describe, expect, it } from "vitest";
import { displayInterval, hasSpread } from "./interval";

/** 시험 행은 release v1.2-2026-11-15 실제 행(값 그대로) */
describe("구간 화면 표시(F16): lo = min(lo, hi, value) · hi = max(lo, hi, value)", () => {
  it("보통 행 — aoi_month KR 2000-11 modis_m2v_terra: 구간 그대로", () => {
    const iv = displayInterval(90.079173143953, 22.045159365499, 152.834797074339);
    expect(iv).toEqual({ lo: 22.045159365499, hi: 152.834797074339 });
    expect(hasSpread(iv)).toBe(true);
  });

  it("value 가 hi 보다 큰 행 — cell_month 3145713 2002-09 modis_m2v: hi 를 value 로 넓힌다(값은 자르지 않음)", () => {
    const value = 2086.988525390625;
    const iv = displayInterval(value, 223.428970336914, 867.121215820312);
    expect(iv).toEqual({ lo: 223.428970336914, hi: value });
  });

  it("value 가 lo 보다 작은 행 — cell_month 4034728 2009-03 modis_m2v: lo 를 value 로 넓힌다", () => {
    const value = 204.142944335938;
    expect(displayInterval(value, 206.395477294922, 663.738708496094)).toEqual({ lo: value, hi: 663.738708496094 });
  });

  it("lo > hi 소수점 행 — cell_month 2475557 2010-10 modis_m2v: 셋의 최소·최대", () => {
    const iv = displayInterval(0.000028610229, 0.000004291534, -0.000012397766);
    expect(iv).toEqual({ lo: -0.000012397766, hi: 0.000028610229 });
    expect(iv!.lo).toBeLessThanOrEqual(iv!.hi);
  });

  it("lo > hi 소수점 행 — aoi_month ADM1_MSR-5088 2008-12 (-0.0 · -1.3e-8)", () => {
    expect(displayInterval(-0.00000000508, -0, -0.000000013243)).toEqual({ lo: -0.000000013243, hi: -0 });
  });

  it("lo null 행 — cell_month 3222889 2001-07 modis_m2v_terra(값 있음): 구간 없이 값만", () => {
    expect(displayInterval(34199.33203125, null, null)).toBeNull();
    expect(displayInterval(34199.33203125, undefined, 5)).toBeNull();
    expect(hasSpread(displayInterval(34199.33203125, null, null))).toBe(false);
  });

  it("value null 행 — aoi_month ADM0_ABW 2001-06 missing: 구간 없음", () => {
    expect(displayInterval(null, null, null)).toBeNull();
    expect(displayInterval(null, 3, 5)).toBeNull();
    expect(displayInterval(Number.NaN, 3, 5)).toBeNull();
  });

  it("S-NPP 실측 행 — aoi_month KR 2026-09 snpp_observed(lo = hi = value): 폭 없음", () => {
    const iv = displayInterval(186, 186, 186);
    expect(iv).toEqual({ lo: 186, hi: 186 });
    expect(hasSpread(iv)).toBe(false);
  });
});
