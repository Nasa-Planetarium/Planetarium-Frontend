import { describe, expect, it } from "vitest";
import { satDaySummary, satSpans } from "./summary";

describe("satDaySummary", () => {
  it("위성별로 세고 ok 아닌 날만 고른다(위성 순서 Terra → NOAA-21)", () => {
    const s = satDaySummary([
      { satellite: "NOAA-20", date_utc: "2026-11-02", status: "ok" },
      { satellite: "S-NPP", date_utc: "2026-11-02", status: "missing", note: null },
      { satellite: "S-NPP", date_utc: "2026-11-01", status: "low", note: "seasonal_decline" },
      { satellite: "NOAA-20", date_utc: "2026-11-14", status: "partial", note: "partial_current_day" },
    ]);
    expect(s.map((x) => x.satellite)).toEqual(["S-NPP", "NOAA-20"]);
    expect(s[0]?.counts).toEqual({ ok: 0, low: 1, missing: 1, partial: 0 });
    expect(s[0]?.off.map((o) => o.date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(s[1]?.off).toEqual([{ date: "2026-11-14", status: "partial", note: "partial_current_day" }]);
  });
  it("행이 없으면 빈 목록", () => {
    expect(satDaySummary([])).toEqual([]);
  });
});

describe("satSpans", () => {
  it("위성별 기간 · Σ", () => {
    const s = satSpans([
      { satellite: "Aqua", year: 2002, month: 7, obs_days: 26, low_days: 0, missing_days: 2, first_day: "2002-07-04", last_day: "2002-07-31", month_status: "partial" },
      { satellite: "Aqua", year: 2002, month: 8, obs_days: 24, low_days: 1, missing_days: 7, first_day: "2002-08-01", last_day: "2002-08-31", month_status: "complete" },
    ]);
    expect(s).toEqual([{ satellite: "Aqua", first: "2002-07-04", last: "2002-08-31", months: 2, obs: 50, low: 1, missing: 9, partialMonths: 1 }]);
  });
});
