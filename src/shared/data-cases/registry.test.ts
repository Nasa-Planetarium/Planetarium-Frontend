import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { CASE_CODE, judge, ORDER } from "./registry";
import type { CaseContext, CaseRow } from "./types";

const row = (o: Partial<CaseRow>): CaseRow => ({ year: 2020, month: 3, status: "ok", value: 10, value_lo: 8, value_hi: 12, raw_modis: 5, raw_viirs: 9, low_sample: false, ...o });

describe("자료 케이스 레지스트리(E2·E3·E4)", () => {
  it("판정 순서는 목업 cases.js ORDER 와 같다", () => {
    expect(ORDER).toEqual(["out_of_range", "before_sensor", "missing", "interval_out", "partial", "nrt", "low_sample", "ok"]);
    expect(CASE_CODE.missing).toBe("E2-MISSING");
    expect(CASE_CODE.interval_out).toBe("E3-INTERVAL");
  });

  it("E2: 결측(status missing)은 값 null 「결측」 — 0 이 아니다", () => {
    const r = judge(row({ year: 2001, month: 6, status: "missing", value: null, value_lo: null, value_hi: null }));
    expect(r.id).toBe("missing");
    expect(r.st).toBe("missing");
    expect(r.value).toBeNull();
    expect(r.wordKey).toBe("shell.st.missing");
  });

  it("E2: status 가 ok 여도 값이 null 이면 결측", () => {
    expect(judge(row({ value: null })).st).toBe("missing");
  });

  it("E3(F16): 값이 구간 밖이면 값은 그대로, 구간은 값까지 넓히고 플래그", () => {
    const r = judge(row({ value: 20, value_lo: 8, value_hi: 12 }));
    expect(r.value).toBe(20);
    expect([r.lo, r.hi]).toEqual([8, 20]);
    expect(r.flags).toContain("interval_out");
    expect(r.st).toBe("ok");
  });

  it("F16: lo > hi 소수점 행(v1.2 cell 2475557 2010-10)은 셋의 최소·최대, lo null 행은 구간 없이 값만", () => {
    const a = judge(row({ value: 0.000028610229, value_lo: 0.000004291534, value_hi: -0.000012397766 }));
    expect([a.value, a.lo, a.hi]).toEqual([0.000028610229, -0.000012397766, 0.000028610229]);
    const b = judge(row({ year: 2001, month: 7, value: 34199.33203125, value_lo: null, value_hi: null }));
    expect([b.value, b.lo, b.hi, b.flags]).toEqual([34199.33203125, null, null, []]);
  });

  it("구간 안이면 구간을 그대로 둔다", () => {
    const r = judge(row({}));
    expect([r.lo, r.hi]).toEqual([8, 12]);
    expect(r.flags).toEqual([]);
  });

  it("partial · nrt 는 표지, low_sample 은 플래그(같이 붙을 수 있다)", () => {
    const r = judge(row({ status: "partial", low_sample: true }));
    expect(r.st).toBe("partial");
    expect(r.flags).toEqual(["low_sample"]);
    expect(judge(row({ status: "nrt" })).st).toBe("nrt");
  });

  it("nrt + 구간 밖: 표지 nrt, 플래그 interval_out", () => {
    const r = judge(row({ status: "nrt", value: 1, value_lo: 2, value_hi: 3 }));
    expect(r.st).toBe("nrt");
    expect(r.flags).toEqual(["interval_out"]);
  });

  it("release 기간 밖·out_of_range 는 값 없음", () => {
    expect(judge(row({ year: 2000, month: 10 })).st).toBe("out_of_range");
    expect(judge(row({ status: "out_of_range" })).value).toBeNull();
    expect(judge(null).st).toBe("out_of_range");
  });

  it("원자료 VIIRS 보기에서 2012-02 전은 「운용 전」(결측 아님)", () => {
    const ctx: CaseContext = { view: "raw_viirs" };
    expect(judge(row({ year: 2011, month: 12, raw_viirs: null }), ctx).st).toBe("before_sensor");
    expect(judge(row({ year: 2012, month: 2, raw_viirs: null }), ctx).st).toBe("missing");
    const ok = judge(row({ year: 2015, month: 2, raw_viirs: 7 }), ctx);
    expect([ok.value, ok.lo, ok.hi]).toEqual([7, null, null]);
  });
});

/**
 * 목업 cases.js 와 같은 입력 → 같은 결과(대조 시험). 목업 폴더가 있을 때만 돈다:
 *   MOCKUP_DIR=~/planetarium/fe-src/mockup pnpm test
 * 폴더가 없으면 건너뛴다(SKIP ≠ PASS — 보고에 따로 적는다).
 */
const mockupDir = process.env.MOCKUP_DIR;
const casesJs = mockupDir ? path.join(mockupDir, "cases.js") : "";
describe.skipIf(!mockupDir || !fs.existsSync(casesJs))("목업 cases.js 대조", () => {
  it("대표 행 120개에서 id·st·flags·value·lo·hi 가 같다", () => {
    const ctx: Record<string, unknown> = { EM: { t: (k: string) => k } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(casesJs, "utf8"), ctx);
    const EM = ctx.EM as { cases: { month: (r: unknown, c: unknown) => Record<string, unknown> } };
    const statuses = ["ok", "nrt", "partial", "missing", "out_of_range"];
    const views = ["value", "raw_modis", "raw_viirs"] as const;
    const samples: [CaseRow, CaseContext][] = [];
    for (const st of statuses)
      for (const view of views)
        for (const [y, m] of [[2000, 10], [2001, 6], [2011, 12], [2012, 2], [2026, 11], [2026, 12], [2020, 7], [2005, 1]] as const)
          samples.push([row({ year: y, month: m, status: st, value: (y * m) % 3 === 0 ? null : 15, value_lo: 9, value_hi: (y + m) % 2 ? 12 : 20, raw_viirs: y < 2012 ? null : 4, low_sample: m % 2 === 0 }), { view }]);
    for (const [r, c] of samples.slice(0, 120)) {
      const a = judge(r, c);
      const b = EM.cases.month(r, c);
      expect({ id: a.id, st: a.st, flags: a.flags, value: a.value, lo: a.lo, hi: a.hi }).toEqual({
        id: b.id,
        st: b.st,
        flags: [...(b.flags as string[])],
        value: b.value ?? null,
        lo: b.lo ?? null,
        hi: b.hi ?? null,
      });
    }
  });
});
