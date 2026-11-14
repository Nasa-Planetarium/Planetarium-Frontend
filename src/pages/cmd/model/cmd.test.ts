import { describe, expect, it } from "vitest";
import { aggCell, analysis, annual, busiest, calendar, extract, heatPoints, hourlyStats, peakOf, quantile, readBoard, ytdCompare, type Board, type Cells, type Day } from "./cmd";

const cm = { first_year: 2001, last_year: 2026, last_month: 11, last_day: 11, days_in_last_month: 30, viirs_start_year: 2012, baseline_from: 2001, baseline_to: 2025, min_limited: 8, min_unavailable: 3 };
const N = 311;
/** 시군 둘: a = 해마다 3월 10, 2025-03 만 100 · b = 늘 2(2003-11 MODIS 결측) */
function cells(f: (y: number, m: number) => number | null, miss?: (y: number, m: number) => string | null): Cells {
  const c: Cells = { modis: [], viirs: [], harm: [], miss: [], miss_s: [] };
  for (let i = 0; i < N; i++) {
    const y = 2001 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    const ms = miss?.(y, m) ?? null;
    const v = ms ? null : f(y, m);
    c.modis.push(v);
    c.viirs.push(y < 2012 ? null : v);
    c.harm.push(v);
    c.miss.push(ms);
    c.miss_s.push(ms ? ["MODIS"] : null);
  }
  return c;
}
const board: Board = {
  cm,
  kor: true,
  regions: [
    { id: "a", name: "A", lat: 36.5, lon: 128.5, area_km2: 0, ledger: true },
    { id: "b", name: "B", lat: 36.6, lon: 128.9, area_km2: 0, ledger: true },
  ],
  cells: { a: cells((y, m) => (m === 3 ? (y === 2025 ? 100 : 10) : 1)), b: cells(() => 2, (y, m) => (y === 2003 && m === 11 ? "2003-11" : null)) },
  shocks: [],
  missing: [{ key: "2003-11", reason: "아카이브 공백", sensors: ["MODIS"] }],
  slope: 3,
  validation: { n_loo: 14, mae_month: 1, bias_pct: 0 },
  provenance: { method_version: "v0.3", data_version: "v1.1", updated_at: "2026-11-11 14:20" },
  hourly: { source: "occur", sel: [], days: [] },
  response: null,
};

describe("cmd 화면 모델", () => {
  it("readBoard: 모양이 아니면 null", () => {
    expect(readBoard(undefined)).toBeNull();
    expect(readBoard({ fires_live: 0, alerts_new: 0, units_busy: 0, units_ready: 0 })).toBeNull();
    expect(readBoard({ fires_live: 0, alerts_new: 0, units_busy: 0, units_ready: 0, board })?.regions).toHaveLength(2);
  });
  it("aggCell: 한 시군이라도 결측이면 합계 null(0 아님), 미래 달은 future", () => {
    expect(aggCell(board, ["a", "b"], 2003, 11, "harmonized")).toMatchObject({ value: null, missing: "2003-11" });
    expect(aggCell(board, ["a", "b"], 2003, 10, "harmonized").value).toBe(3);
    expect(aggCell(board, ["a"], 2026, 12, "harmonized").future).toBe(true);
  });
  it("calendar: 26년 × 12달, VIIRS 는 2012년 이전 운용 전", () => {
    const c = calendar(board, ["a", "b"], "viirs");
    expect(c.rows).toHaveLength(26);
    expect(c.rows[0]?.reasons[0]).toContain("sensor_not_operating");
    expect(c.rows[25]?.vals[11]).toBeNull();
  });
  it("annual: 연간 합계", () => {
    const a = annual(board, ["a"]);
    expect(a.find((x) => x.year === 2024)?.harmonized).toBe(21);
    expect(a.find((x) => x.year === 2005)?.viirs).toBeNull();
  });
  it("analysis: 2025-03 은 평가 연도 제외 중앙값 대비 배수", () => {
    const r = analysis(board, ["a"], 2025, 3, "harmonized");
    expect(r.baseline.median).toBe(10);
    expect(r.ratio).toBe(10);
    expect(r.state).toBe("comparable");
    expect(analysis(board, ["b"], 2003, 11, "harmonized").state).toBe("unavailable");
  });
  it("ytdCompare: 진행 중인 해는 같은 날짜까지 누계끼리", () => {
    const ann = annual(board, ["a"]);
    const r = ytdCompare(board, ["a"], "harmonized", 2026, ann);
    expect(r.partial).toBe(true);
    expect(r.ratio).not.toBeNull();
  });
  it("extract: 2배 이상 · 5 이상 칸만, z 큰 순", () => {
    const r = extract(board, { regions: [], season: "all", sensor: "harmonized", conf: 0, frp: 0, agri: false });
    expect(r.rows[0]).toMatchObject({ r: "a", y: 2025, m: 3 });
    expect(r.rows.every((x) => x.ratio >= 2 && x.v >= 5)).toBe(true);
  });
  it("heatPoints: 결정적", () => {
    const q = { regions: [], season: "all" as const, sensor: "harmonized" as const, conf: 0, frp: 0, agri: false };
    expect(heatPoints(board, q, 2025, [])).toEqual(heatPoints(board, q, 2025, []));
  });
  it("hourlyStats · peakOf · busiest", () => {
    const days: Day[] = Array.from({ length: 400 }, (_, i) => {
      const v: number[] = Array.from({ length: 24 }, (_, h) => (h === 13 ? 3 : i > 300 && i < 331 ? 1 : 0));
      return { date: `2001-01-01`, dow: i % 7, we: i % 7 === 0, total: v.reduce((s, x) => s + x, 0), v, miss: null };
    });
    const st = hourlyStats(days);
    expect(st[13]?.median).toBe(3);
    expect(peakOf(st, st.map((x) => x.median))?.h).toBe(13);
    const [a, b] = busiest(days);
    expect(b - a).toBe(29);
    expect(a).toBeGreaterThanOrEqual(300);
  });
  it("quantile: R type 7", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });
});
