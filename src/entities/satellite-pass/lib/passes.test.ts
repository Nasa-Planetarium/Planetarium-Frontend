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
  it("궤도 창 밖은 근사 행(approx) — 하루 통과 수는 창 안과 같은 무늬(목업 approxPasses)", () => {
    const out = Date.parse("2027-03-01T00:00:00+09:00");
    const p = nextPass(out, [36.5, 127.9]);
    expect(p).not.toBeNull();
    expect(p!.approx).toBe(true);
    const ps = passes(out, out + 86400e3, [36.5, 127.9]);
    expect(ps.length).toBeGreaterThanOrEqual(6);
    expect(ps.every((x) => x.approx)).toBe(true);
    // 과거(2015) — 임무 전 위성(NOAA-20·21)은 빠진다
    const old = Date.parse("2015-07-01T00:00:00+09:00");
    const po = passes(old, old + 86400e3, [36.5, 127.9]);
    expect(po.some((x) => x.sat === "NOAA-20" || x.sat === "NOAA-21")).toBe(false);
    expect(po.length).toBeGreaterThan(0);
  });
  it("창 경계에서 시각이 뛰지 않는다(창 마지막 날과 다음 날 같은 위성 첫 통과 차 < 26시간)", () => {
    const a = passes(Date.parse("2026-12-26T00:00:00+09:00"), Date.parse("2026-12-28T00:00:00+09:00"), [36.5, 127.9]).filter((x) => x.sat === "S-NPP");
    expect(a.some((x) => !x.approx) && a.some((x) => x.approx)).toBe(true);
    for (let i = 1; i < a.length; i++) expect(a[i]!.ms - a[i - 1]!.ms).toBeLessThan(26 * 3600e3);
  });
});
