import { describe, expect, it } from "vitest";
import { pickableAois, pickableIso3, type CountryInfo } from "./country";

const c = (iso3: string, iso2?: string): CountryInfo => ({ iso3, iso2, name_en: iso3, bbox: [0, 0, 1, 1], c: [0, 0], tz: "UTC", n1: 0 });
const list = [c("KOR", "KR"), c("MDV", "MV"), c("SSD", "SS"), c("TUV", "TV"), c("ATC")];
const aois = [
  { aoi_id: "WORLD" },
  { aoi_id: "KR", has_data: true },
  { aoi_id: "ADM0_MDV", has_data: true },
  { aoi_id: "ADM1_MDV-5230", has_data: true },
  { aoi_id: "ADM0_SDS", has_data: true },
  { aoi_id: "ADM0_GIB", has_data: true },
  { aoi_id: "ADM0_XXX", has_data: false },
];

describe("고를 수 있는 나라·지역", () => {
  it("나라 칩: release 에 자료 있는 나라 행이 있는 나라만(TUV 행 없음 · ATC 는 ISO2 없음)", () => {
    expect([...(pickableIso3(list, aois) ?? [])].sort()).toEqual(["KOR", "MDV", "SSD"]);
  });
  it("목록을 아직 못 받았으면 막지 않는다(null)", () => {
    expect(pickableIso3(list, undefined)).toBeNull();
  });
  it("지역 고르기: 자료 없음 · 나라 색인에 없는 나라(GIB)를 뺀다", () => {
    const pick = pickableIso3(list, aois);
    expect(pickableAois(aois, pick).map((a) => a.aoi_id)).toEqual(["WORLD", "KR", "ADM0_MDV", "ADM1_MDV-5230", "ADM0_SDS"]);
    expect(pickableAois(aois, null).map((a) => a.aoi_id)).not.toContain("ADM0_XXX");
  });
});
