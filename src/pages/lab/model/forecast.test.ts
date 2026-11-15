import { describe, expect, it } from "vitest";
import { aoiOfFace, asOfMD, closeRing, leadKind, parseRegion, pct1, queryOf, regionParams, selfIndustrial, summaryMode, cnt, type FcRegion } from "./forecast";

const sp = (q: string) => new URLSearchParams(q);

describe("30일 전망 화면 규칙(F17)", () => {
  it("머리 「관측 기준 MM-DD」 는 as_of 글자 그대로", () => {
    expect(asOfMD("2026-11-14")).toBe("11-14");
    expect(asOfMD(null)).toBe("–");
    expect(asOfMD("2026-11")).toBe("–");
  });

  it("lead ≤ 7 모델 예측 · ≥ 8 평년 패턴 기반", () => {
    expect(leadKind({ lead_days_from_as_of: 1 })).toBe("model");
    expect(leadKind({ lead_days_from_as_of: 7 })).toBe("model");
    expect(leadKind({ lead_days_from_as_of: 8 })).toBe("pattern");
    expect(leadKind({ lead_days_from_as_of: 30 })).toBe("pattern");
  });

  it("요약 방식: display_hint > baseline(value_source·skill none) > model", () => {
    expect(summaryMode({ display_hint: "거의 확실히 탐지됨 — 예상 건수를 보세요", value_source: "model_calibrated", skill: "low" })).toBe("hint");
    expect(summaryMode({ display_hint: "", value_source: "baseline", skill: "none" })).toBe("baseline");
    expect(summaryMode({ display_hint: "", value_source: "model", skill: "none" })).toBe("baseline");
    expect(summaryMode({ display_hint: "", value_source: "model_calibrated", skill: "high" })).toBe("model");
    expect(summaryMode({ display_hint: "", value_source: "model_calibrated", skill: "low" })).toBe("model");
  });

  it("고른 시군구가 산업 열원 의심이면 회색", () => {
    expect(selfIndustrial({ suspected_industrial_sgg: ["SGG_31140"] }, { kind: "aoi", id: "SGG_31140" })).toBe(true);
    expect(selfIndustrial({ suspected_industrial_sgg: ["SGG_31140"] }, { kind: "aoi", id: "SIDO_31" })).toBe(false);
    expect(selfIndustrial({ suspected_industrial_sgg: [] }, { kind: "bbox", b: [1, 2, 3, 4] })).toBe(false);
  });

  it("확률·건수 표기", () => {
    expect(pct1(0.619)).toBe("61.9%");
    expect(pct1(0.0283)).toBe("2.8%");
    expect(pct1(0)).toBe("0.0%");
    expect(pct1(0.0001)).toBe("<0.1%");
    expect(pct1(0.9999)).toBe(">99.9%");
    expect(pct1(1)).toBe("100.0%");
    expect(cnt(188.61)).toBe("188.61");
    expect(cnt(1.3)).toBe("1.3");
    expect(cnt(1003.79, "en")).toBe("1,003.79");
  });

  it("나라 1급 면 id → aoi_id (한국은 시도 코드 표, 그 밖은 ADM1_)", () => {
    expect(aoiOfFace("KOR-2496")).toBe("SIDO_51");
    expect(aoiOfFace("KOR-5129")).toBe("SIDO_36");
    expect(aoiOfFace("ARG-1299")).toBe("ADM1_ARG-1299");
  });

  it("주소 ↔ 지역 ↔ 본문(사각형·다각형은 스냅숏 본문과 같은 모양)", () => {
    expect(parseRegion(sp("region=SIDO_51"))).toEqual({ kind: "aoi", id: "SIDO_51" });
    const b = parseRegion(sp("bbox=128.6,37.2,129.4,37.9")) as FcRegion;
    expect(queryOf(b)).toEqual({ region: [128.6, 37.2, 129.4, 37.9], horizon_days: 30 });
    const p = parseRegion(sp("poly=128.45,36.25;129.45,36.25;129.45,36.75;128.95,36.85;128.45,36.65")) as FcRegion;
    expect(queryOf(p)).toEqual({ region: { type: "Polygon", coordinates: [[[128.45, 36.25], [129.45, 36.25], [129.45, 36.75], [128.95, 36.85], [128.45, 36.65], [128.45, 36.25]]] }, horizon_days: 30 });
    expect(parseRegion(sp(new URLSearchParams(regionParams(p)).toString()))).toEqual(p);
    expect(parseRegion(sp("bbox=10,5,1,2"))).toBeNull();
    expect(parseRegion(sp("poly=1,2;3,4"))).toBeNull();
    expect(parseRegion(sp("region=<x>"))).toBeNull();
    expect(closeRing([[1, 2], [3, 4], [1, 2]])).toHaveLength(3);
  });
});
