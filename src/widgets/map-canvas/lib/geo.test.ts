import { describe, expect, it } from "vitest";
import { aoiBounds, aoiGeometry, approxRegions, inAoi, checkPoint, geomMainBounds, circleRing, clusterUnits, curve, fireMarkOf, heatGain, maskPolygon, niceScale, pixelSquare, placeLabels, tickLabel, tickStep, withAlpha } from "./geo";

describe("그린 영역 → GeoJSON", () => {
  it("사각형은 닫힌 5점 고리(북서에서 시작)", () => {
    const g = aoiGeometry({ type: "bbox", west: 128, south: 36, east: 129, north: 37 });
    expect(g.coordinates[0]).toEqual([[128, 37], [129, 37], [129, 36], [128, 36], [128, 37]]);
  });
  it("다각형은 [위도,경도] 점을 [경도,위도] 로 바꾸고 첫 점으로 닫는다", () => {
    const g = aoiGeometry({ type: "polygon", pts: [[36, 128], [36.5, 128.5], [36, 129]] });
    expect(g.coordinates[0]).toEqual([[128, 36], [128.5, 36.5], [129, 36], [128, 36]]);
  });
  it("반경 원은 65점, 범위는 반경 km 에 맞다(위도 방향 10 km ≈ 0.09°)", () => {
    const b = aoiBounds({ type: "point", lat: 0, lon: 0, radius_km: 10 });
    expect(circleRing(0, 0, 10)).toHaveLength(65);
    expect(b[3]).toBeCloseTo(10 / 111, 4);
    expect(b[2]).toBeCloseTo(10 / 111, 4); // 적도에선 경도도 같은 폭
  });
  it("고위도에서는 경도 폭이 넓어진다(전 지역 — 목업처럼 36.6° 고정이 아님)", () => {
    const b = aoiBounds({ type: "point", lat: 60, lon: 10, radius_km: 10 });
    expect(b[2] - 10).toBeCloseTo((10 / 111) / Math.cos(Math.PI / 3), 3);
  });
});

describe("감지 화소", () => {
  it("VIIRS 375 m · MODIS 1 km 정사각형", () => {
    const v = pixelSquare({ lat: 0, lon: 0, sensor: "VIIRS" })[0]!;
    const m = pixelSquare({ lat: 0, lon: 0, sensor: "MODIS" })[0]!;
    expect((v[2]![1]! - v[0]![1]!) * 111).toBeCloseTo(0.375, 3);
    expect((m[2]![1]! - m[0]![1]!) * 111).toBeCloseTo(1, 3);
  });
  it("열 지도 세기: 점이 몰리면 낮추고(최소 0.03) 드물면 올린다(최대 3)", () => {
    const one = heatGain([{ lat: 36, lon: 128, sensor: "VIIRS", frp: 1 }]);
    const many = heatGain(Array.from({ length: 500 }, () => ({ lat: 36, lon: 128, sensor: "VIIRS", frp: 400 })));
    expect(one).toBe(3);
    expect(many).toBe(0.03);
    expect(heatGain([])).toBe(1);
  });
});

describe("축척·눈금", () => {
  it("110px 안의 가장 긴 깔끔한 길이", () => {
    expect(niceScale(0.1)).toMatchObject({ km: 10, px: 100, text: "10 km" });
    expect(niceScale(0.004).text).toBe("200 m");
    expect(niceScale(30).km).toBe(2000);
  });
  it("눈금 간격은 보이는 범위에 맞춘다", () => {
    expect(tickStep(2).step).toBe(0.5);
    expect(tickStep(40).step).toBe(10);
    expect(tickLabel(128.5, "lon", 0.5)).toBe("128.5°E");
    expect(tickLabel(-3, "lon", 1)).toBe("3°W");
    expect(tickLabel(-33.5, "lat", 0.5)).toBe("33.5°S");
  });
});

describe("좌표 창 검사", () => {
  const B: [number, number, number, number] = [124, 33, 132, 39];
  it("범위 밖 위도·경도·반경은 사전 키와 범위를 돌려준다", () => {
    expect(checkPoint(40, 128, 10, B)).toEqual({ key: "home.pt.err_lat", p: { a: 33, b: 39 } });
    expect(checkPoint(36, 140, 10, B)).toEqual({ key: "home.pt.err_lon", p: { a: 124, b: 132 } });
    expect(checkPoint(36, 128, 0.2, B)).toEqual({ key: "home.pt.err_rad" });
    expect(checkPoint(NaN, 128, 10, B)?.key).toBe("home.pt.err_lat");
    expect(checkPoint(36, 128, 10, B)).toBeNull();
  });
});

describe("바깥 가림", () => {
  it("초점 면이 구멍인 큰 사각형", () => {
    const g = maskPolygon({ type: "Polygon", coordinates: [[[128, 36], [129, 36], [129, 37], [128, 37], [128, 36]]] })!;
    expect(g.coordinates).toHaveLength(2);
    expect(g.coordinates[0]![0]).toEqual([103, 11]);
    expect(maskPolygon({ type: "Point", coordinates: [1, 2] })).toBeNull();
  });
});

describe("주 범위", () => {
  it("먼 작은 섬(가장 큰 면의 5% 미만)은 뺀다", () => {
    const g = { type: "MultiPolygon" as const, coordinates: [[[[128, 36], [129, 36], [129, 37], [128, 37], [128, 36]]], [[[130.8, 37.4], [130.9, 37.4], [130.9, 37.5], [130.8, 37.5], [130.8, 37.4]]]] };
    expect(geomMainBounds(g)).toEqual([128, 36, 129, 37]);
  });
});

describe("이름표 비키기", () => {
  it("제자리가 막히면 위로, 다 막히면 숨긴다", () => {
    const it1 = { id: "a", w: 40, h: 14, pts: [{ x: 100, y: 100 }] };
    expect(placeLabels([it1], [], 400, 300)[0]!.at).toEqual([0, 0, 0]);
    const blocked = placeLabels([it1], [{ l: 80, t: 92, r: 120, b: 108 }], 400, 300)[0]!;
    expect(blocked.at).toEqual([0, 0, -22]);
    const all = placeLabels([it1], [{ l: 0, t: 0, r: 400, b: 300 }], 400, 300)[0]!;
    expect(all.at).toBeNull();
  });
  it("두 이름표가 겹치면 뒤의 것이 비킨다(지역 먼저, 강은 나중)", () => {
    const out = placeLabels(
      [
        { id: "river", w: 40, h: 12, pts: [{ x: 100, y: 100 }, { x: 200, y: 100 }], river: true },
        { id: "a", w: 40, h: 14, pts: [{ x: 100, y: 100 }] },
      ],
      [],
      400,
      300,
    );
    expect(out.find((x) => x.id === "a")!.at).toEqual([0, 0, 0]);
    expect(out.find((x) => x.id === "river")!.at).toEqual([1, 0, 0]); // 선 위 다른 점
  });
});

describe("자원 묶음", () => {
  it("44px 안 무리는 하나로, 대표는 현장 > 귀소 > 대기", () => {
    const g = clusterUnits([
      { id: "u1", x: 0, y: 0, status: "standby" },
      { id: "u2", x: 30, y: 0, status: "onscene" },
      { id: "u3", x: 60, y: 0, status: "standby" },
      { id: "u4", x: 300, y: 0, status: "standby" },
      { id: "u5", x: 10, y: 0, status: "enroute", free: true },
    ]);
    expect(g).toEqual([{ rep: "u2", ids: ["u1", "u2", "u3"] }]);
  });
});

describe("불 표지 문법", () => {
  it("상태·크기·대형", () => {
    expect(fireMarkOf({ status: "spreading", level: 4, frp_max: 120, burned_ha: 300 })).toEqual({ level: 4, state: "live", size: "l", major: true });
    expect(fireMarkOf({ status: "onscene", level: 2, frp_max: 30 }).state).toBe("half");
    expect(fireMarkOf({ status: "contained", level: 2, frp_max: 5 })).toMatchObject({ state: "closed", size: "s" });
    expect(fireMarkOf({ status: "out", level: 1, historical: true }).state).toBe("hist");
  });
});

describe("경로·색", () => {
  it("휜 경로는 양 끝을 지나고 41점", () => {
    const c = curve([128, 36], [129, 37]);
    expect(c).toHaveLength(41);
    expect(c[0]).toEqual([128, 36]);
    expect(c[40]![0]).toBeCloseTo(129, 9);
  });
  it("토큰 색 + 투명도", () => {
    expect(withAlpha("#ff7a3c", 0.5)).toBe("rgba(255,122,60,0.5)");
    expect(withAlpha("rgb(1, 2, 3)", 0)).toBe("rgba(1,2,3,0)");
  });
});

describe("그린 영역 안 판정 · 집계 지역(목업 inGeom · approxRegions)", () => {
  const sq = { type: "polygon" as const, pts: [[36, 128], [36, 129], [37, 129], [37, 128]] as [number, number][] };
  it("다각형 안·밖", () => {
    expect(inAoi(sq, 36.5, 128.5)).toBe(true);
    expect(inAoi(sq, 37.5, 128.5)).toBe(false);
  });
  it("사각형·반경", () => {
    expect(inAoi({ type: "bbox", west: 128, south: 36, east: 129, north: 37 }, 36.2, 128.9)).toBe(true);
    expect(inAoi({ type: "point", lat: 36, lon: 128, radius_km: 10 }, 36.05, 128)).toBe(true);
    expect(inAoi({ type: "point", lat: 36, lon: 128, radius_km: 10 }, 36.2, 128)).toBe(false);
  });
  it("안에 든 지역이 없으면 가장 가까운 지역 하나(근사 표시)", () => {
    const R = [
      { id: "A", lat: 36.5, lon: 128.5 },
      { id: "B", lat: 38, lon: 128.5 },
    ];
    expect(approxRegions(sq, R)).toEqual({ ids: ["A"], fallback: false });
    expect(approxRegions({ type: "bbox", west: 128, south: 37.6, east: 129, north: 37.7 }, R)).toEqual({ ids: ["B"], fallback: true });
  });
});
