import { describe, expect, it } from "vitest";
import { moveBounds } from "./bounds";

describe("이동 경계(목업 map3d maxBounds 식)", () => {
  it("한국 범위 + 최소 4° 여유", () => {
    const b = moveBounds([124.6, 33.1, 131.9, 38.6])!;
    expect(b[0][0]).toBeLessThan(124.6 - 3.9);
    expect(b[1][1]).toBeGreaterThan(38.6 + 3.9);
  });
  it("가로로 긴 나라는 세로 여유를 가로 길이의 60% 까지", () => {
    const b = moveBounds([95, -11, 141, 6])!;
    expect(6 + (141 - 95) * 0.6).toBeCloseTo(Math.min(85, b[1][1]));
  });
  it("전 세계·빈 범위는 묶지 않는다", () => {
    expect(moveBounds([-180, -90, 180, 90])).toBeNull();
    expect(moveBounds(null)).toBeNull();
  });
  it("위도는 ±85, 경도는 ±180 안", () => {
    const b = moveBounds([-170, 60, -140, 72])!;
    expect(b[0][0]).toBeGreaterThanOrEqual(-180);
    expect(b[1][1]).toBeLessThanOrEqual(85);
  });
  it("날짜 변경선을 넘는 범위(미국 172–293)는 묶지 않는다 — ±180 으로 자르면 캄차카에 갇혔다", () => {
    expect(moveBounds([172.495, 18.964, 293.013, 71.408])).toBeNull();
  });
});
