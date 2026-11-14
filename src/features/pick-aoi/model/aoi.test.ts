import { describe, expect, it } from "vitest";
import { bboxArea, iso3OfAoi, pathOf, scopeOf, unionBbox, type AoiRec } from "./aoi";

const A = (aoi_id: string, level: string, parent_id: string | null, extra: Partial<AoiRec> = {}): AoiRec => ({ aoi_id, level, parent_id, name_ko: aoi_id, name_en: null, ...extra });
const aois: AoiRec[] = [
  A("WORLD", "world", null),
  A("CONT_Asia", "continent", "WORLD"),
  A("KR", "country", "CONT_Asia"),
  A("SIDO_11", "kr_sido", "KR"),
  A("SIDO_47", "kr_sido", "KR"),
  A("SGG_47170", "kr_sgg", "SIDO_47"),
  A("SGG_47210", "kr_sgg", "SIDO_47"),
  A("group:gb-north", "group", "SIDO_47"),
  A("ADM0_USA", "country", "CONT_North_America"),
  A("ADM1_USA-1", "adm1", "ADM0_USA"),
  A("ADM0_ABW", "country", "CONT_North_America"),
];
const byId = new Map(aois.map((a) => [a.aoi_id, a] as const));

describe("지역 범위(scopeOf)", () => {
  it("나라 = 범위, 행 = 시도(묶음·대륙 제외)", () => {
    const s = scopeOf(aois, byId, "KR");
    expect(s.scope).toBe("KR");
    expect(s.focus).toBeNull();
    expect(s.rows.map((r) => r.aoi_id)).toEqual(["SIDO_11", "SIDO_47"]);
  });
  it("시도 = 범위, 행 = 시군구(경북 북부 묶음 빼고 23 시군구 전부 — 여기선 2)", () => {
    expect(scopeOf(aois, byId, "SIDO_47").rows.map((r) => r.aoi_id)).toEqual(["SGG_47170", "SGG_47210"]);
  });
  it("시군구 = 그 시도가 범위, 그 시군구가 강조", () => {
    const s = scopeOf(aois, byId, "SGG_47170");
    expect(s.scope).toBe("SIDO_47");
    expect(s.focus).toBe("SGG_47170");
    expect(s.rows).toHaveLength(2);
  });
  it("다른 나라: 1급 행 · 아래 단 없는 작은 나라는 자기 하나", () => {
    expect(scopeOf(aois, byId, "ADM0_USA").rows.map((r) => r.aoi_id)).toEqual(["ADM1_USA-1"]);
    const s = scopeOf(aois, byId, "ADM0_ABW");
    expect(s.scope).toBe("ADM0_ABW");
    expect(s.rows.map((r) => r.aoi_id)).toEqual(["ADM0_ABW"]);
  });
  it("위 단 사슬 · 나라 코드", () => {
    expect(pathOf(byId, "SGG_47170").map((a) => a.aoi_id)).toEqual(["KR", "SIDO_47", "SGG_47170"]);
    expect(iso3OfAoi("ADM1_USA-1")).toBe("USA");
    expect(iso3OfAoi("SIDO_47")).toBe("KOR");
  });
  it("상자 합·넓이", () => {
    expect(unionBbox([[1, 2, 3, 4], null, [0, 3, 2, 5]])).toEqual([0, 2, 3, 5]);
    expect(bboxArea([124.6, 33.2, 130.9, 38.6])).toBeLessThan(100);
  });
});
