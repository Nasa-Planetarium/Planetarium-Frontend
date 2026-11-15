import { describe, expect, it } from "vitest";
import { bboxSqDeg, cellsTooMany, hotspotsTooWide } from "./limits";

/* 실서버 /aois 행(2026-11-15, method_version v1-m2v-2026-11-14) 그대로 */
const KR = { level: "country", n_cells: 1123, bbox: [124.614, 33.198, 130.921, 38.624] };
const JPN = { level: "country", n_cells: 4338, bbox: [122.939, 24.212, 153.986, 45.516] };
const USA = { level: "country", n_cells: 114388, bbox: [-179.144, 18.906, 179.781, 71.412] };
const BRA = { level: "country", n_cells: 71876, bbox: [-74.018, -33.742, -28.877, 5.267] };

describe("range limits", () => {
  it("/cells: 칸 1만 개 넘는 나라만 거절(실서버 400 ADM0_USA·ADM0_BRA, JPN·KR 은 200)", () => {
    expect([KR, JPN, USA, BRA].map(cellsTooMany)).toEqual([false, false, true, true]);
    expect(cellsTooMany({ level: "country", n_cells: 10000 })).toBe(false);
    expect(cellsTooMany({ level: "country", n_cells: 10001 })).toBe(true);
  });
  it("/cells: world·continent 는 칸 수와 무관하게 거절(계약)", () => {
    expect(cellsTooMany({ level: "continent", n_cells: 10 })).toBe(true);
    expect(cellsTooMany({ level: "world" })).toBe(true);
  });
  it("/hotspots: bbox 100 제곱도 넘으면 거절 — JPN 661.43(실서버 detail 661.42)", () => {
    expect(bboxSqDeg(JPN.bbox)).toBeCloseTo(661.425, 2);
    expect([KR, JPN, USA, BRA].map(hotspotsTooWide)).toEqual([false, true, true, true]);
    expect(hotspotsTooWide({ bbox: [0, 0, 10, 10] })).toBe(false);
  });
  it("모르면(행·값 없음) 거절 아님 — 요청해 보고 400 이면 화면 안전망", () => {
    expect(cellsTooMany(null)).toBe(false);
    expect(cellsTooMany({ level: "adm1" })).toBe(false);
    expect(hotspotsTooWide(undefined)).toBe(false);
    expect(hotspotsTooWide({ bbox: null })).toBe(false);
  });
});
