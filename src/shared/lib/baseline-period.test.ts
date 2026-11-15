import { describe, expect, it } from "vitest";
import { baselineOf, continuityParent, parseBaselinePeriod } from "./baseline-period";

describe("baseline-period", () => {
  it("응답 값을 그대로 읽는다(한국 2012-2025 · 아르헨티나 2001-2025)", () => {
    expect(parseBaselinePeriod("2012-2025")).toEqual({ from: 2012, to: 2025, years: 14 });
    expect(parseBaselinePeriod("2001-2025")).toEqual({ from: 2001, to: 2025, years: 25 });
    expect(parseBaselinePeriod("2012–2025")).toEqual({ from: 2012, to: 2025, years: 14 });
  });
  it("필드 없음(옛 백엔드)·못 읽는 값은 기본 2001–2025", () => {
    expect(baselineOf(undefined)).toEqual({ from: 2001, to: 2025, years: 25 });
    expect(baselineOf(null)).toEqual({ from: 2001, to: 2025, years: 25 });
    expect(baselineOf("VIIRS")).toEqual({ from: 2001, to: 2025, years: 25 });
    expect(parseBaselinePeriod("2025-2012")).toBeNull();
    expect(baselineOf(undefined, { from: 2003, to: 2024 })).toEqual({ from: 2003, to: 2024, years: 22 });
  });
  it("continuity_source: parent:<id> 만 상위 지역", () => {
    expect(continuityParent("parent:SIDO_47")).toBe("SIDO_47");
    expect(continuityParent("own")).toBeNull();
    expect(continuityParent(undefined)).toBeNull();
  });
});
