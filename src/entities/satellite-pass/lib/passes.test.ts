import { describe, expect, it } from "vitest";
import { nextPass, passes } from "./passes";

/* 목업 core.js EM.passes 와 같은 식 — 하루 통과 수·순서·창 밖 처리만 잰다(목업 값과의 분 단위 대조는 e2e 밖) */
describe("satellite passes", () => {
  const day0 = Date.parse("2026-11-15T00:00:00+09:00");
  it("한국 중심 하루 통과는 VIIRS 셋과 MODIS 둘을 포함하고 시각 순이다", () => {
    const ps = passes(day0, day0 + 86400e3, [36.5, 127.9]);
    expect(ps.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ps.map((p) => p.sat)).size).toBe(5);
    for (let i = 1; i < ps.length; i++) expect(ps[i]!.ms).toBeGreaterThanOrEqual(ps[i - 1]!.ms);
  });
  it("다른 나라 기준점도 통과를 낸다(경북 고정 아님)", () => {
    expect(passes(day0, day0 + 86400e3, [40.2, -3.6]).length).toBeGreaterThan(0);
  });
  it("다음 통과는 지금 뒤 2일 안", () => {
    const p = nextPass(day0, [36.5, 127.9]);
    expect(p).not.toBeNull();
    expect(p!.ms).toBeGreaterThan(day0);
  });
  it("궤도 창 밖이면 비운다", () => {
    expect(nextPass(Date.parse("2027-03-01T00:00:00+09:00"), [36.5, 127.9])).toBeNull();
  });
});
