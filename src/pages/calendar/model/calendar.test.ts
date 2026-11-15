import { describe, expect, it } from "vitest";
import { bandsOf, caseOf, counts, fmtCell, fmtCompact, iso3OfAoi, parseLatLon, partialOf, type CalendarData, type MonthRow } from "./calendar";

const row = (y: number, m: number, o: Partial<MonthRow> = {}): MonthRow => ({ year: y, month: m, value: 10, value_lo: 8, value_hi: 12, raw_modis: 3, raw_viirs: 9, status: "ok", value_source: "snpp_observed", ...o });

describe("캘린더 모델(E1–E4)", () => {
  it("결측은 null 로 남는다(E2, 0 아님)", () => {
    const c = caseOf(row(2001, 6, { status: "missing", value: null }), "value");
    expect(c.st).toBe("missing");
    expect(c.value).toBeNull();
  });
  it("구간 밖 = 값 유지 · 구간은 값까지 넓힘(F16) · 플래그(E3), 실서버가 이미 비운 행의 flags 도 읽는다", () => {
    const a = caseOf(row(2010, 3, { value: 20, value_lo: 8, value_hi: 12 }), "value");
    expect([a.value, a.lo, a.hi, a.io]).toEqual([20, 8, 20, true]);
    const b = caseOf(row(2010, 3, { value_lo: null, value_hi: null, flags: ["interval_out_of_range"] }), "value");
    expect(b.io).toBe(true);
  });
  it("보정 전 보기 = 2012-01 까지 MODIS · 2012-02 부터 VIIRS", () => {
    expect(caseOf(row(2012, 1), "raw_stitched").value).toBe(3);
    expect(caseOf(row(2012, 2), "raw_stitched").value).toBe(9);
  });
  it("원자료 VIIRS 보기에서 2012-02 전은 운용 전", () => {
    expect(caseOf(row(2005, 1), "raw_viirs").st).toBe("before_sensor");
  });
  it("값 출처 띠는 행의 value_source 를 이은 구간(E1)", () => {
    const cal: CalendarData = { aoi_id: "KR", method_version: "x", months: [row(2012, 1, { value_source: "modis_m2v" }), row(2012, 2), row(2012, 3)] };
    expect(bandsOf(cal, "value")).toEqual([
      { vs: "modis_m2v", from: [2012, 1], to: [2012, 1] },
      { vs: "snpp_observed", from: [2012, 2], to: [2012, 3] },
    ]);
    expect(bandsOf(cal, "raw_modis")).toEqual([]);
    expect(counts(cal, "value")?.ok).toBe(3);
  });
  it("진행 중 달 줄 값 · 위경도 · ISO3 · 짧은 숫자", () => {
    expect(partialOf(row(2026, 11, { status: "partial", value: 44.3, value_projected: 102.3, as_of_date: "2026-11-13" }))).toEqual({ date: "2026-11-13", v: 44.3, p: 102.3 });
    expect(parseLatLon("36.35N 128.7E")).toEqual({ lat: 36.35, lon: 128.7 });
    expect(parseLatLon("33.9S, 151.2E")).toEqual({ lat: -33.9, lon: 151.2 });
    expect(parseLatLon("의성")).toBeNull();
    expect([iso3OfAoi("SGG_47730"), iso3OfAoi("ADM0_BRA"), iso3OfAoi("WORLD")]).toEqual(["KOR", "BRA", null]);
    expect(fmtCompact("ko", 2353)).toBe("2.4천");
    expect(fmtCompact("en", 0.01)).toBe("<0.1");
  });
  it("칸 숫자(g9 · 목업 EM.fmt.cell): 1,000–9,999 는 정수 그대로, 1만 이상만 짧은 표기 — 「1.6천」 섞임 없음", () => {
    expect(fmtCell("ko", 1597.4)).toBe("1597");
    expect(fmtCell("ko", 2800)).toBe("2800");
    expect(fmtCell("ko", 165)).toBe("165");
    expect(fmtCell("ko", 4.25)).toBe("4.3");
    expect(fmtCell("ko", 12500)).toBe("1.3만");
    expect(fmtCell("en", 12500)).toBe("12.5K");
    expect(fmtCell("ko", null)).toBe("");
  });
});
