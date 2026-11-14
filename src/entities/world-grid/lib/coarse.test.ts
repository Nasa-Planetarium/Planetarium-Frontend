import { describe, expect, it } from "vitest";
import type { WorldMeta } from "../api/world-grid";
import { coarseCells, decodeMonth, monthIdx } from "./coarse";

/* 활성 칸 3개 · 2달: 달0 = 칸0·칸2, 달1 = 칸1 */
function fake() {
  const n = 3;
  const NM = 2;
  const bpm = 1;
  const g = [(10 + 90) * 360 + (20 + 180), (50 + 90) * 360 + (100 + 180), (11 + 90) * 360 + (21 + 180)];
  const buf = new ArrayBuffer(n * 2 + NM * bpm + 3);
  new Uint16Array(buf, 0, n).set(g);
  const u8 = new Uint8Array(buf);
  u8[n * 2] = 0b101;
  u8[n * 2 + 1] = 0b010;
  u8.set([1, 255, 128], n * 2 + NM * bpm);
  const meta = { months: { start: "2000-11", n: NM }, n_active: n, bitmap_bytes_per_month: bpm, quant: { lnmin: 0, lnmax: Math.log(1000) }, counts: [2, 1] } as unknown as WorldMeta;
  return { meta, buf };
}

describe("1° 묶음(world-1deg)", () => {
  it("달 번호는 months.start 기준", () => {
    const { meta } = fake();
    expect(monthIdx(meta, 2000, 11)).toBe(0);
    expect(monthIdx(meta, 2001, 1)).toBe(2);
  });
  it("비트맵·양자화 값을 달마다 따로 읽는다", () => {
    const { meta, buf } = fake();
    const m0 = decodeMonth(meta, buf, 0);
    expect(m0.map((c) => c.g)).toHaveLength(2);
    expect(m0[0]?.v).toBeCloseTo(1, 5);
    expect(m0[1]?.v).toBeCloseTo(1000, 3);
    const m1 = decodeMonth(meta, buf, 1);
    expect(m1).toHaveLength(1);
    expect(decodeMonth(meta, buf, 5)).toEqual([]);
  });
  it("윤곽 null = 전부 · 윤곽 = 겹치는 칸만 · 윤곽도 bbox 도 없으면 빈 목록", () => {
    const { meta, buf } = fake();
    const m0 = decodeMonth(meta, buf, 0);
    expect(coarseCells(m0, null, null)).toHaveLength(2);
    const sq = [[[[19.5, 9.5], [21.5, 9.5], [21.5, 10.9], [19.5, 10.9], [19.5, 9.5]]]];
    const one = coarseCells(m0, sq, null);
    expect(one).toEqual([{ cell_lat: 10.5, cell_lon: 20.5, value: 1 }]);
    expect(coarseCells(m0, [], [21.2, 11.2, 22, 12])).toEqual([{ cell_lat: 11.5, cell_lon: 21.5, value: 1000 }]);
    expect(coarseCells(m0, [], null)).toEqual([]);
  });
});
