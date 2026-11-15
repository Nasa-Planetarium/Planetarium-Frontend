import { describe, expect, it } from "vitest";
import { FRP_RATIOS } from "./frp-ratios.gen";
import { displayName, limsOf, removedRows, SECS } from "./method";

describe("method v1.2", () => {
  it("절 6개(v1.2 변경점이 v1.1 다음)", () => {
    expect(SECS).toEqual(["method", "v11", "v12", "validation", "status", "sources"]);
  });
  it("표시 이름: 서버 display_names → 사전 → null", () => {
    const M = { display_names: { m2v_xgb: "FireBridge (MODIS-to-VIIRS Harmonizer)" } };
    expect(displayName(M, "m2v_xgb", () => "사전")).toBe("FireBridge (MODIS-to-VIIRS Harmonizer)");
    expect(displayName(M, "n20_bridge", (id) => (id === "n20_bridge" ? "N20 Bridge" : null))).toBe("N20 Bridge");
    expect(displayName(undefined, "x", () => null)).toBeNull();
  });
  it("산업 열원 제거 비율 행: KR · ARG · WORLD 순", () => {
    expect(removedRows({ WORLD: { a: 0.004 }, KR: { a: 0.07 }, ADM0_ARG: { a: 0.007 } }).map((r) => r.aoi)).toEqual(["KR", "ADM0_ARG", "WORLD"]);
  });
  it("위성 일별 상태가 있으면 「일별 상태 없음」 한계를 뺀다", () => {
    expect(limsOf({ satellite_day_status: true })).not.toContain("no_day_status");
    expect(limsOf({})).toContain("no_day_status");
  });
  it("FRP 환산 비율 표 = release year=all 8행(4위성 × 낮·밤), 모델팀 노트 값", () => {
    expect(FRP_RATIOS).toHaveLength(8);
    const r = (s: string, d: string) => FRP_RATIOS.find((x) => x.satellite === s && x.daynight === d)?.ratio;
    expect(r("Aqua", "D")).toBe(1.141);
    expect(r("Terra", "N")).toBe(2.406);
    expect(r("N20", "D")).toBe(0.999);
    expect(r("N21", "N")).toBe(1.222);
  });
});
