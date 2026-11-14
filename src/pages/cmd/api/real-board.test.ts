import { describe, expect, it } from "vitest";
import { daysOf, ptsOf, windows } from "./real-board";

describe("지휘 통계 실제 묶음 — 순수 몫", () => {
  it("92일 창: 끝에서 거꾸로, 빈틈·겹침 없음", () => {
    const w = windows("2025-01-01", "2025-12-31");
    expect(w).toHaveLength(4);
    expect(w[0]).toEqual(["2025-10-01", "2025-12-31"]);
    expect(w[w.length - 1]?.[0]).toBe("2025-01-01");
    const days = w.reduce((t, [s, e]) => t + (Date.parse(e) - Date.parse(s)) / 864e5 + 1, 0);
    expect(days).toBe(365);
  });
  it("점 → 일×시각(한국 KST): 감지 0 인 날도 칸이 있고 합 = 점 수", () => {
    const pts = [
      { latitude: 36.5, longitude: 128.7, acq_datetime_utc: "2025-03-22T04:22:00Z" },
      { latitude: 36.5, longitude: 128.7, acq_datetime_utc: "2025-03-22T04:25:00Z" },
      { latitude: 36.5, longitude: 128.7, acq_datetime_utc: "2025-03-22T16:10:00Z" },
    ];
    const d = daysOf(pts, "2025-03-21", "2025-03-23", true);
    expect(d.map((x) => x.total)).toEqual([0, 2, 1]);
    expect(d[1]?.v?.[13]).toBe(2);
    expect(d[2]?.v?.[1]).toBe(1);
  });
  it("지도 점 거름: 계절·FRP·신뢰도", () => {
    const pts = [
      { latitude: 1, longitude: 2, acq_datetime_utc: "2025-03-01T00:00:00Z", frp: 10, confidence: "h" },
      { latitude: 1, longitude: 2, acq_datetime_utc: "2025-07-01T00:00:00Z", frp: 10, confidence: "h" },
      { latitude: 1, longitude: 2, acq_datetime_utc: "2025-03-01T00:00:00Z", frp: 1, confidence: "l" },
    ];
    const q = { regions: [], season: "spring" as const, sensor: "harmonized" as const, conf: 50, frp: 5, agri: false };
    expect(ptsOf(pts, q)).toHaveLength(1);
  });
});
