import { describe, expect, it } from "vitest";
import { calendarCSV, coverage, distOf, presetStart, selectable, stepNumbers, toCSV } from "./analysis";
import type { CalendarData } from "./core";

const cal: CalendarData = {
  aoi_id: "SIDO_47",
  method_version: "v",
  months: [
    { year: 2025, month: 2, value: 10, status: "ok", value_source: "snpp_observed" },
    { year: 2025, month: 3, value: 2353, status: "ok", value_source: "snpp_observed" },
    { year: 2025, month: 4, value: null, status: "missing" },
    { year: 2026, month: 11, value: 44.3, value_projected: 102.3, as_of_date: "2026-11-13", status: "partial" },
  ],
};

describe("비교 분석 모델", () => {
  it("고를 수 있는 달 = 진행 중·결측·범위 밖이 아닌 달", () => {
    expect(selectable(cal, 2025, 3)).toBe(true);
    expect(selectable(cal, 2025, 4)).toBe(false);
    expect(selectable(cal, 2026, 11)).toBe(false);
    expect(selectable(cal, 1999, 1)).toBe(false);
  });
  it("지원 기간: 끝 달이 진행 중이면 완결 달은 그 앞 달", () => {
    expect(coverage("2000-11", "2026-11", cal)).toEqual({ first_month: "2000-11", last_complete_month: "2026-10", partial_month: "2026-11", as_of: "2026-11-13" });
    expect(coverage(null, null, cal)).toEqual({ first_month: "2025-02", last_complete_month: "2026-10", partial_month: "2026-11", as_of: "2026-11-13" });
  });
  it("분포: 기준에 든 해 · 결측 해 · 평가 해(값은 /compare 그대로)", () => {
    const d = distOf(
      { value: 5, value_lo: 5, value_hi: 5, baseline: [{ year: 2001, value: 1, used: true }, { year: 2002, value: null, status: "missing" }, { year: 2003, value: 9, used: false, status: "partial" }] },
      2025,
      () => ({}),
    );
    expect(d.map((x) => [x.year, x.state, x.value])).toEqual([[2001, "baseline", 1], [2002, "missing", null], [2025, "evaluated", 5]]);
  });
  it("보정 전·후 요약은 앞뒤 5년이 모두 있을 때만", () => expect(stepNumbers(cal)).toBeNull());
  it("기간 빠른 선택: 분석 월 포함 k개월의 첫날", () => {
    expect(presetStart(2025, 3, 3)).toBe("2025-01-01");
    expect(presetStart(2025, 3, 12)).toBe("2024-04-01");
  });
  it("CSV: 따옴표 규칙 · 완결 달 v1.1 열 채움 · 결측은 빈 칸(0 아님)", () => {
    expect(toCSV([{ a: 'x,"y"', b: null }], ["a", "b"])).toBe('a,b\n"x,""y""",');
    const lines = calendarCSV(cal).split("\n");
    expect(lines[2]).toContain("2025,3,2353");
    expect(lines[2]).toContain("2025-03-31");
    expect(lines[3]?.split(",")[3]).toBe("");
    expect(lines[4]).toContain("102.3,2026-11-13");
  });
});
