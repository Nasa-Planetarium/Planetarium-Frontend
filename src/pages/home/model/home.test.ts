import { describe, expect, it } from "vitest";
import { annual, eraPlace, grid, last12, realAoi, regionOfAoi, sumMonths, worstMonth, ytdRatio, type MonthRow } from "./home";

const row = (year: number, month: number, value: number | null, status = "ok", extra: Partial<MonthRow> = {}): MonthRow => ({
  year,
  month,
  value,
  value_lo: value,
  value_hi: value,
  raw_modis: value,
  raw_viirs: year >= 2012 ? value : null,
  status,
  ratio_to_median: null,
  ...extra,
});

describe("상황판 모델", () => {
  it("관심 영역 → 실제 AOI(고른 지역 그대로 — 기본 KR, 지도 도구 시군은 SGG, 다른 나라는 시군 무시)", () => {
    expect(realAoi("KR", null)).toBe("KR");
    expect(realAoi("SIDO_11", null)).toBe("SIDO_11");
    expect(realAoi("KR", "andong")).toBe("SGG_47170");
    expect(realAoi("SIDO_47", "gunwi")).toBe("SGG_27720");
    expect(realAoi("ADM0_USA", "andong")).toBe("ADM0_USA");
    expect(regionOfAoi("SGG_47170")).toBe("andong");
    expect(regionOfAoi("SGG_11110")).toBeNull();
  });

  it("격자: 행 없는 달은 out_of_range, 결측(null)은 0 이 아니라 missing(E2), 진행 중 달은 partial", () => {
    const g = grid([row(2001, 6, null, "missing"), row(2026, 11, 44.3, "partial"), row(2025, 3, 2332)], "harmonized");
    expect(g).toHaveLength(26);
    expect(g[0]![5]).toMatchObject({ v: null, st: "missing" });
    expect(g[0]![0]).toMatchObject({ st: "out_of_range" });
    expect(g[25]![10]).toMatchObject({ v: 44.3, st: "partial" });
    expect(worstMonth(g)).toEqual({ year: 2025, month: 3, v: 2332 });
  });

  it("원자료 VIIRS 보기: 2012 이전은 운용 전", () => {
    const g = grid([row(2005, 3, 10)], "viirs");
    expect(g[4]![2]!.st).toBe("before_sensor");
  });

  it("연간 합은 진행 중인 해를 빼고 결측 달을 센다", () => {
    const a = annual(grid([row(2025, 3, 10), row(2025, 4, 5), row(2025, 5, null, "missing"), row(2026, 1, 99)], "harmonized"));
    expect(a.find((r) => r.year === 2025)).toEqual({ year: 2025, total: 15, missing: 1 });
    expect(a.some((r) => r.year === 2026)).toBe(false);
  });

  it("최근 12개월은 해를 넘어 이어지고 없는 달은 null", () => {
    const v = last12([row(2026, 11, 3), row(2025, 12, 1)], { year: 2026, month: 11 });
    expect(v).toHaveLength(12);
    expect(v[0]).toBe(1);
    expect(v[11]).toBe(3);
    expect(v[5]).toBeNull();
  });

  it("올해 누계 예년 대비 = 올해 1–N월 합 ÷ 기준 해 합의 중앙값(결측 있는 해 제외)", () => {
    const rows = [row(2026, 1, 20), row(2026, 2, 20)];
    for (let y = 2001; y <= 2003; y++) rows.push(row(y, 1, 10), row(y, 2, 10));
    rows.push(row(2004, 1, null, "missing"), row(2004, 2, 10));
    const r = ytdRatio(grid(rows, "harmonized"), 2);
    expect(r).toEqual({ ratio: 2, n: 3 });
  });

  it("연대 이름: 다음 이름 자리를 먹으면 짧은 이름, 겹치는 이름은 뺀다", () => {
    const p = eraPlace(
      [
        { x: 0, vars: ["Terra", "T"] },
        { x: 30, vars: ["Aqua", "A"] },
        { x: 33, vars: ["S-NPP", "S"] },
      ],
      { left: 0, right: 200, width: (t) => t.length * 6.8, pad: 3, gap: 6 },
    );
    expect(p.map((q) => q.txt)).toEqual(["T", "Aqua"]);
  });
});

describe("sumMonths — 그린 영역 여러 지역 합", () => {
  it("값 열은 더하고 배수·판정은 비운다", () => {
    const r = (v: number | null, st = "final") => ({ year: 2025, month: 3, value: v, raw_modis: 1, raw_viirs: null, status: st, ratio_to_median: 2, verdict: "high" });
    const out = sumMonths([[r(10)], [r(5)], [r(null)]]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ value: 15, raw_modis: 3, raw_viirs: null, ratio_to_median: null, verdict: null, status: "final" });
  });
});
