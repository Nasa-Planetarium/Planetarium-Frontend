import { describe, expect, it } from "vitest";
import { burnState, countOf, daysBack, eventBox, eventPlace, eventSpan, monthWindow, noCoverage } from "./event";

describe("화재 사건 도움 함수", () => {
  it("한 달 창(윤년 2월 포함)", () => {
    expect(monthWindow(2025, 3)).toEqual({ start: "2025-03-01", end: "2025-03-31" });
    expect(monthWindow(2024, 2)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });
  it("계약 기간 한도 창: end 포함 n일", () => {
    expect(daysBack("2025-12-31", 1)).toBe("2025-12-31");
    expect(daysBack("2025-12-31", 3700)).toBe("2015-11-15");
  });
  it("연소 면적 상태: null 자료 없음 · 0 확인 안 됨 · 양수 확인", () => {
    expect(burnState({ burned_area_km2: null })).toBe("na");
    expect(burnState({ burned_area_km2: 0 })).toBe("none");
    expect(burnState({ burned_area_km2: 97.24 })).toBe("km2");
  });
  it("넓이 0 상자는 윤곽 없음(중심 원만)", () => {
    expect(eventBox({ lat_min: 36, lat_max: 36, lon_min: 128, lon_max: 128 })).toBeNull();
    expect(eventBox({ lat_min: 36.3, lat_max: 36.4, lon_min: 128.7, lon_max: 129.1 })).toHaveLength(4);
  });
  it("자리 이름·기간 표기", () => {
    expect(eventPlace({ sgg_all: "안동시,의성군", sido_nm: "경상북도", country: "KOR", adm1_code: "KOR-1" })).toBe("경상북도 안동시·의성군");
    expect(eventPlace({ sgg_all: null, sido_nm: null, country: "ARG", adm1_code: "ARG-1271" })).toBe("ARG-1271");
    expect(eventSpan({ start_date: "2025-03-23", end_date: "2025-03-27" })).toBe("2025-03-23 – 03-27");
    expect(eventSpan({ start_date: "2025-03-23", end_date: "2025-03-23" })).toBe("2025-03-23");
  });
  it("자료 없음 vs 해당 없음 · total 없으면 「이상」", () => {
    expect(noCoverage({ coverage: { available: false, scope: "kr_arg_events", reason: "out_of_coverage" } })).toBe(true);
    expect(noCoverage({ coverage: { available: true, scope: "kr_arg_events", reason: null } })).toBe(false);
    expect(countOf({ total: 237, count: 3, truncated: true })).toEqual({ n: 237, atLeast: false });
    expect(countOf({ total: null, count: 3, truncated: true })).toEqual({ n: 3, atLeast: true });
  });
});
