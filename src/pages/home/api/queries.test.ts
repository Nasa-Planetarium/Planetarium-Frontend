import { describe, expect, it } from "vitest";
import { monthsOf } from "./queries";

describe("기간이 걸친 달(넓은 범위 지도 1° 칸 합)", () => {
  it("한 달 안", () => expect(monthsOf("2026-11-05", "2026-11-11")).toEqual([[2026, 11]]));
  it("해를 넘김", () => expect(monthsOf("2025-12-20", "2026-01-03")).toEqual([[2025, 12], [2026, 1]]));
  it("최근 24달까지", () => {
    const m = monthsOf("2020-01-01", "2026-11-11");
    expect(m).toHaveLength(24);
    expect(m[m.length - 1]).toEqual([2026, 11]);
  });
});
