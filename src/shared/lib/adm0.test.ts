import { describe, expect, it } from "vitest";
import { aoiOfIso3, iso3OfAdm0 } from "./adm0";

describe("나라 코드 ↔ release 지역 id", () => {
  it("한국 = KR, 보통 나라 = ADM0_<색인 코드>(숨김 섬나라 포함)", () => {
    expect(aoiOfIso3("KOR")).toBe("KR");
    expect(aoiOfIso3("MDV")).toBe("ADM0_MDV");
    expect(aoiOfIso3("JPN")).toBe("ADM0_JPN");
  });
  it("색인과 release 코드가 다른 네 나라(스냅숏 iso3_alias 와 같은 표)", () => {
    expect(aoiOfIso3("SSD")).toBe("ADM0_SDS");
    expect(aoiOfIso3("ESH")).toBe("ADM0_SAH");
    expect(aoiOfIso3("PSE")).toBe("ADM0_PSX");
    expect(aoiOfIso3("ALA")).toBe("ADM0_ALD");
  });
  it("되돌리기: release 코드 → 색인 코드", () => {
    expect(["SDS", "SAH", "PSX", "ALD", "MDV"].map(iso3OfAdm0)).toEqual(["SSD", "ESH", "PSE", "ALA", "MDV"]);
  });
});
