import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contrast, over } from "./map-color";
import { areaOf, boundsOf, boxBounds, boxHits, CELLS1_MIN_AREA, density, fitLon, islandMarkers, levelOf, lonInFit, pointBoxes, POINTS_MAX_AREA, radiusExpr, radiusPx, radiusStops, RMAX, RMIN, splitLon, STEP_TOKENS, stepOf, stepOfCell, STEPS, tileKey, tilesOf, type Box, type Level } from "./index";

/** 표시 규칙서(2026-11-15) R1–R10 경계값 고정 */

describe("R3 값 눈금", () => {
  it("경계 0.1 · 1 · 10 · 100 다섯 단계, ≤ 0 · null 은 그리지 않는다", () => {
    expect([...STEPS]).toEqual([0.1, 1, 10, 100]);
    expect(stepOf(0)).toBeNull();
    expect(stepOf(-0.3)).toBeNull();
    expect(stepOf(null)).toBeNull();
    expect(stepOf(Number.NaN)).toBeNull();
    expect([0.05, 0.1, 0.99, 1, 9.9, 10, 99, 100, 5000].map(stepOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("1° 칸은 합 ÷ 100, 여러 달 합은 ÷ 달 수", () => {
    expect(density(1000, 1)).toBeCloseTo(10);
    expect(density(1200, 1, 12)).toBeCloseTo(1);
    expect(density(5, 0.1)).toBe(5);
    expect(stepOfCell(14.8, 1)).toBe(1); // 1° 합 중앙값 14.8 → 0.148 → 2단계(0.1–1)
    expect(stepOfCell(4212, 1)).toBe(3); // 1° 합 p99 → 42 → 4단계
  });
});

describe("R1 표현 단계 — 넓이 하나, 여유는 아래쪽만", () => {
  it("처음 열 때 표의 경계", () => {
    expect(levelOf(100.01, 5)).toBe("L1");
    expect(levelOf(100, 5)).toBe("L2");
    expect(levelOf(4.01, 8)).toBe("L2");
    expect(levelOf(4, 8)).toBe("L3");
    expect(levelOf(0.5, 10.6)).toBe("L4");
  });
  it("L1 → L2 는 90 이하에서, L2 → L1 은 100 초과에서", () => {
    expect(levelOf(95, 5, "L1")).toBe("L1");
    expect(levelOf(90, 5, "L1")).toBe("L2");
    expect(levelOf(100.5, 5, "L2")).toBe("L1");
    expect(levelOf(3.8, 8, "L2")).toBe("L2");
    expect(levelOf(3.6, 8, "L2")).toBe("L3");
    expect(levelOf(3.8, 8, "L3")).toBe("L3");
    expect(levelOf(4.1, 8, "L3")).toBe("L2");
  });
  it("어떤 앞 단계에서도 넓이 > 100 인 L2 는 없다(서버 400)", () => {
    const prevs: (Level | null)[] = [null, "L1", "L2", "L3", "L4"];
    for (const p of prevs) for (let a = 100.001; a < 400; a += 7.3) expect(levelOf(a, 4, p)).toBe("L1");
  });
  it("R13 최근 24시간 · 기간 창: 100 까지 점, 넘으면 fixed(이번 달 칸으로 바꾸지 않음)", () => {
    expect(levelOf(50, 6, null, "recent")).toBe("L3");
    expect(levelOf(100, 6, "L3", "recent")).toBe("L3");
    expect(levelOf(101, 6, "L3", "recent")).toBe("fixed");
    expect(levelOf(101, 6, "L3", "range")).toBe("fixed");
  });
  it("넓이 = 펼친 경도 폭(최대 360) × 위도 폭", () => {
    expect(areaOf([120, 30, 130, 40])).toBe(100);
    expect(areaOf([-200, -80, 200, 80])).toBe(360 * 160);
    expect(areaOf([170, -20, 190, -15])).toBe(100);
  });
});

describe("R2 2.5° 타일 · 점 상자", () => {
  it("타일은 625칸(2.5°)이고 ±180 안, 날짜 변경선 시야는 양쪽 조각으로", () => {
    const ts = tilesOf([170, -20, 190, -15]);
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) {
      expect(t[0]).toBeGreaterThanOrEqual(-180);
      expect(t[2]).toBeLessThanOrEqual(180);
      expect(Math.round(((t[2] - t[0]) * (t[3] - t[1])) / 0.01)).toBeLessThanOrEqual(625);
      expect(Math.abs((t[0] / 2.5) % 1)).toBeLessThan(1e-9);
    }
    expect(ts.some((t) => t[0] < 0)).toBe(true);
    expect(ts.some((t) => t[0] > 0)).toBe(true);
  });
  it("같은 타일은 같은 키(끌어도 다시 받지 않음)", () => {
    const a = tilesOf([126.1, 35.2, 129.4, 37.9]).map(tileKey);
    const b = tilesOf([126.3, 35.4, 129.6, 38.1]).map(tileKey);
    expect(a.filter((k) => b.includes(k)).length).toBeGreaterThan(0);
  });
  it("넓이 100 시야는 타일 최대 25개(5×5)", () => {
    expect(tilesOf([120.3, 30.3, 130.3, 40.3]).length).toBeLessThanOrEqual(25);
  });
  it("점 상자는 0.1° 격자에 바깥쪽으로, 날짜 변경선이면 둘로", () => {
    expect(pointBoxes([129.33, 35.97, 129.43, 36.05])).toEqual([[129.3, 35.9, 129.5, 36.1]]);
    expect(pointBoxes([179, -18, 181, -16]).length).toBe(2);
    expect(splitLon(-190, -170)).toEqual([
      [170, 180],
      [-180, -170],
    ]);
    expect(boxHits([179, -18, 181, -16], [-180, -17, -179.5, -16.5])).toBe(true);
  });
});

describe("R5 원 크기", () => {
  it("어느 줌에서나 단계별 최소·최대 안이고 단계 순서가 지켜진다", () => {
    for (const deg of [0.1, 1])
      for (let z = 0; z <= 14; z += 0.25) {
        let prev = 0;
        for (let k = 0; k < 5; k++) {
          const r = radiusPx(k, deg, z);
          expect(r).toBeGreaterThanOrEqual(RMIN[k] as number);
          expect(r).toBeLessThanOrEqual(RMAX[k] as number);
          expect(r).toBeGreaterThanOrEqual(prev);
          prev = r;
        }
      }
  });
  it("MapLibre 식(합친 정지점 + exponential 2)이 식과 같은 값", () => {
    for (const deg of [0.1, 1]) {
      const zs = radiusStops(deg);
      const e = radiusExpr(deg) as unknown[];
      expect(e[0]).toBe("interpolate");
      const stops: { z: number; out: number[] }[] = [];
      for (let i = 3; i < e.length; i += 2) {
        const m = e[i + 1] as unknown[];
        stops.push({ z: e[i] as number, out: [m[3], m[5], m[7], m[9], m[10]] as number[] });
      }
      expect(stops.map((s) => s.z)).toEqual(zs);
      for (let z = 0; z <= 14; z += 0.25) {
        const j = stops.findIndex((s, i) => i < stops.length - 1 && z >= s.z && z <= (stops[i + 1] as { z: number }).z);
        const a = stops[j] as { z: number; out: number[] };
        const b = stops[j + 1] as { z: number; out: number[] };
        const tt = (2 ** (z - a.z) - 1) / (2 ** (b.z - a.z) - 1);
        for (let k = 0; k < 5; k++) expect((a.out[k] as number) + ((b.out[k] as number) - (a.out[k] as number)) * tt).toBeCloseTo(radiusPx(k, deg, z), 6);
      }
    }
  });
});

describe("R10 맞춤 · 섬", () => {
  it("fitLon: 날짜 변경선 나라(USA·RUS·FJI)는 더 넓은 쪽", () => {
    expect(fitLon(172, 293)).toEqual([-180, -67]); // PR #15: 세계 사본이 없는 지도라 −180 에서 자른다
    expect(fitLon(19, 190)).toEqual([19, 180]);
    expect(fitLon(177, 182)).toEqual([177, 180]);
    expect(boxBounds([172, 18, 293, 72])[0][0]).toBe(-180);
  });
  it("boundsOf: 알류샨 + 본토 고리는 서쪽으로 이어 잰다", () => {
    const b = boundsOf([
      [173, 52],
      [-179, 51],
      [-125, 48],
      [-67, 44],
    ]);
    expect(b?.[0][0]).toBe(-180);
    expect(b?.[1][0]).toBeCloseTo(-67);
    expect(lonInFit(173, b!)).toBe(173);
    expect(lonInFit(173, [[-190, 0], [-60, 10]])).toBe(-187);
    expect(lonInFit(-178, [[170, 0], [185, 10]])).toBe(182);
  });
  it("섬 표지: 본토(4px 이상 고리)가 있으면 0, 군도면 섬마다(8px 안은 하나)", () => {
    const proj = (z: number) => (lon: number, lat: number) => [lon * z, -lat * z] as const;
    const main = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const isl = (x: number) => [
      [x, 0],
      [x + 0.01, 0],
      [x + 0.01, 0.01],
    ];
    expect(islandMarkers([main, isl(20)], proj(10))).toEqual([]);
    expect(islandMarkers([isl(0), isl(5), isl(5.3)], proj(10)).length).toBe(2);
  });
});

describe("R4 단계 색 — base.css 를 읽어 잰다", () => {
  const css = fs.readFileSync(path.join(__dirname, "../../../app/styles/base.css"), "utf8");
  const val = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] as string;
  it("다섯 색은 mh1 · mh2 · mh4 · mh5 · mh6", () => expect([...STEP_TOKENS]).toEqual(["mh1", "mh2", "mh4", "mh5", "mh6"]));
  it("땅 · 바다 모두 대비 ≥ 3:1, 지형 음영 0.35 위에서도", () => {
    const land = val("map-land");
    const sea = val("map-sea");
    const shade = val("map-shade-dark");
    const shaded = over(shade, 0.35, land);
    STEP_TOKENS.forEach((t) => {
      expect(contrast(val(t), land)).toBeGreaterThanOrEqual(3);
      expect(contrast(val(t), sea)).toBeGreaterThanOrEqual(3);
      expect(contrast(val(t), shaded)).toBeGreaterThanOrEqual(3);
    });
  });
  it("넓이 경계 상수", () => {
    expect(CELLS1_MIN_AREA).toBe(100);
    expect(POINTS_MAX_AREA).toBe(4);
  });
});

/** 나라마다 같은 규칙인지: 단계·색·크기를 고르는 공통 함수에는 나라 입력이 없다 — 같은 넓이면 같은 단계 */
describe("나라와 상관없이 같은 넓이 = 같은 단계", () => {
  const boxes: Record<string, Box> = { KOR: [124.6, 33.2, 130.9, 38.6], JPN: [122.9, 24.2, 154, 45.5], USA: [-188, 18.9, -66.9, 71.4], FRA: [-5.1, 41.3, 9.6, 51.1], MDV: [72.6, -0.7, 73.8, 7.1], IND: [68.1, 6.7, 97.4, 35.5] };
  it("시야 넓이만으로 정해진다", () => {
    const got = Object.fromEntries(Object.entries(boxes).map(([k, b]) => [k, levelOf(areaOf(b), 5)]));
    expect(got).toEqual({ KOR: "L2", JPN: "L1", USA: "L1", FRA: "L1", MDV: "L2", IND: "L1" });
    // 같은 넓이로 자른 시야는 나라가 달라도 같은 단계
    const same = Object.values(boxes).map((b) => levelOf(areaOf([b[0], b[1], b[0] + 5, b[1] + 5]), 6));
    expect(new Set(same).size).toBe(1);
  });
});
