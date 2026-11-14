import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexOf, koreaComparison, koreaMonth, ymOf, type KoreaSnap } from "./snapshot";

const file = path.resolve(__dirname, "../../../public/data/snap/korea.json");
const snap = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as KoreaSnap) : null;

describe("달 인덱스", () => {
  it("0 = 2000-11, 312 = 2026-11", () => {
    expect(ymOf("2000-11", 0)).toEqual({ year: 2000, month: 11 });
    expect(ymOf("2000-11", 312)).toEqual({ year: 2026, month: 11 });
    expect(indexOf("2000-11", 2001, 6)).toBe(7);
  });
});

describe.skipIf(!snap)("스냅숏 → 계약 모양(public/data/snap/korea.json)", () => {
  const S = snap as KoreaSnap;
  const kr = S.aoi.find((a) => a.id === "KR")!;

  it("2001-06 은 missing, 값 null(0 아님)", () => {
    const r = koreaMonth(S, kr, indexOf(S.months.start, 2001, 6));
    expect(r.status).toBe("missing");
    expect(r.value).toBeNull();
  });

  it("값 = 정수/10, 배수 = 정수/100 (재계산 없음)", () => {
    const i = indexOf(S.months.start, 2020, 4);
    const r = koreaMonth(S, kr, i);
    expect(r.value).toBe(kr.v[i] == null ? null : kr.v[i]! / 10);
    expect(r.ratio_to_median).toBe(kr.rat[i] == null ? null : kr.rat[i]! / 100);
    expect(r.verdict).toBe(kr.vd[i] == null ? null : S.codes.vd[kr.vd[i]!]);
  });

  it("값 출처 경계: 2002-07 modis_m2v · 2012-02 snpp_observed · 2026-11 n20_bridge", () => {
    expect(koreaMonth(S, kr, indexOf(S.months.start, 2002, 6)).value_source).toBe("modis_m2v_terra");
    expect(koreaMonth(S, kr, indexOf(S.months.start, 2002, 7)).value_source).toBe("modis_m2v");
    expect(koreaMonth(S, kr, indexOf(S.months.start, 2012, 2)).value_source).toBe("snpp_observed");
    expect(koreaMonth(S, kr, indexOf(S.months.start, 2026, 11)).value_source).toBe("n20_bridge");
  });

  it("비교 응답에 method_version 이 붙는다", () => {
    const c = koreaComparison(S, kr, indexOf(S.months.start, 2025, 3));
    expect(c.method_version).toBe(S.method_version);
    expect(c.aoi_id).toBe("KR");
  });
});
