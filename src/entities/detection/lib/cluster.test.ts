import { describe, expect, it } from "vitest";
import { detections } from "./cluster";

const NOW = Date.parse("2026-11-14T06:00:00Z");
const p = (lat: number, lon: number, h: number, o: Partial<{ instrument: string; frp: number; confidence: string; adm1: string }> = {}) => ({
  latitude: lat,
  longitude: lon,
  acq_datetime_utc: new Date(NOW - h * 3600e3).toISOString(),
  instrument: o.instrument ?? "VIIRS",
  frp: o.frp ?? 5,
  confidence: o.confidence ?? "n",
  adm1: o.adm1 ?? "A",
});

describe("detections (목업 EM.detections)", () => {
  it("24시간 창 밖 점은 뺀다", () => {
    const d = detections([p(10, 10, 1), p(10, 10, 30)], NOW);
    expect(d.n).toBe(1);
  });
  it("1급 × 0.3° 칸으로 묶고 등급을 매긴다", () => {
    const pts = [...Array.from({ length: 5 }, () => p(10.01, 10.01, 2)), p(20, 20, 2, { adm1: "B", frp: 120, instrument: "MODIS", confidence: "h" })];
    const d = detections(pts, NOW);
    expect(d.clusters.length).toBe(2);
    expect(d.clusters[0]!.level).toBe(3);
    expect(d.clusters[1]!.level).toBe(2);
    expect(d.high).toBe(1);
    expect(d.regions).toBe(2);
    expect(d.modis).toBe(1);
  });
});

describe("tilesOf (실서버 100 제곱도 한도 · 날짜변경선)", () => {
  it("180° 를 넘는 경도는 옮기고 걸치면 자른다", async () => {
    const { tilesOf } = await import("../api/query");
    const t = tilesOf([172.5, 18.9, 293, 71.4]);
    expect(t.every((b) => b[0] >= -180 && b[2] <= 180 && b[0] < b[2])).toBe(true);
    expect(t.every((b) => (b[2] - b[0]) * (b[3] - b[1]) <= 100)).toBe(true);
  });
});

describe("orderTiles", () => {
  it("1급 중심이 든 조각을 먼저", async () => {
    const { orderTiles } = await import("../api/query");
    const t = orderTiles(
      [
        [0, 0, 10, 10],
        [10, 0, 20, 10],
      ],
      [[5, 15]],
    );
    expect(t[0]).toEqual([10, 0, 20, 10]);
  });
});
