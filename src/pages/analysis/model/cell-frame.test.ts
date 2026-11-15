import { describe, expect, it } from "vitest";
import { cellFrame, circMeanLon, wrapLon, type LandPart } from "./cell-frame";

const sq = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n], [w, s]] as [number, number][];

describe("cell-frame (칸 지도 틀)", () => {
  it("경도 접기: 중심 -100 이면 172°E 는 -188", () => {
    expect(wrapLon(-100)(172)).toBe(-188);
    expect(wrapLon(127)(128)).toBe(128);
  });
  it("원형 평균: 179 와 -179 의 가운데는 ±180", () => {
    expect(Math.abs(circMeanLon([179, -179]))).toBeCloseTo(180, 5);
  });
  it("칸 없으면 틀 없음", () => {
    expect(cellFrame({ cells: [], land: [], cellDeg: 0.1, width: 560, maxH: 520 })).toBeNull();
  });
  it("시야 = 칸 ∪ 칸이 든 땅 면 ∪ 고른 면 — 칸 없는 먼 면은 넓히지 않는다", () => {
    const land: LandPart[] = [
      { rings: [sq(126, 34, 130, 38)] }, // 칸이 든 면
      { rings: [sq(140, 20, 141, 21)] }, // 칸 없는 먼 섬
      { rings: [sq(124, 33, 125, 34)], on: true }, // 고른 면(칸 없어도 넣음)
    ];
    const f = cellFrame({ cells: [{ lat: 36, lon: 128 }], land, cellDeg: 0.1, width: 560, maxH: 520 });
    expect(f).not.toBeNull();
    expect(f!.bbox).toEqual([124, 33, 130, 38]);
  });
  it("날짜 변경선 너머 칸은 중심 쪽으로 접혀 시야가 지구 한 바퀴로 늘지 않는다", () => {
    const f = cellFrame({ cells: [{ lat: 52, lon: 178 }, { lat: 40, lon: -100 }], land: [], c0: -98, cellDeg: 1, width: 560, maxH: 520 });
    expect(f!.bbox[2] - f!.bbox[0]).toBeLessThan(100);
  });
  it("높이 상한: 남북으로 긴 범위는 maxH 로 줄이고 가로 가운데", () => {
    const f = cellFrame({ cells: [{ lat: 30, lon: 127 }, { lat: 40, lon: 127.5 }], land: [], cellDeg: 0.1, width: 560, maxH: 400 });
    expect(f!.H).toBeLessThanOrEqual(400);
    const mid = (f!.X(126.95) + f!.X(127.55)) / 2;
    expect(Math.abs(mid - 280)).toBeLessThan(1);
  });
});
