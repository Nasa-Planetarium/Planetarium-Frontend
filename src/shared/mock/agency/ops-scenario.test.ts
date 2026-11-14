import { describe, expect, it } from "vitest";
import ledger from "./ledger.json";
import type { Alert, Fire } from "../../agency/port";
import { firePoints, fixedPoints, hash, opsAlerts, opsFires, rng, villagesOf } from "./ops-scenario";

const fires = ledger.fires as unknown as Fire[];
const alerts = ledger.alerts as unknown as Alert[];
const fire = (id: string) => fires.find((f) => f.id === id) as Fire;

describe("ops 목 생성기", () => {
  it("난수는 목업 core.js 와 같은 수열(FNV-1a · mulberry32)", () => {
    expect(hash("a")).toBe(3826002220);
    const r = rng("vil:F-261111-03");
    const xs = [r(), r(), r()];
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(rng("vil:F-261111-03")()).toBe(xs[0]);
  });

  it("길안면 불 반경 2 km 마을 = 묵계리 포함 2곳 108가구(목업 홈 리드 「마을 2곳 108가구」)", () => {
    const vs = villagesOf(fire("F-261111-03"));
    expect(vs).toHaveLength(2);
    expect(vs[0]?.name).toBe("묵계리");
    expect(vs.reduce((s, v) => s + v.homes, 0)).toBe(108);
  });

  it("관측 점 등급 수 = 원장 VIIRS·MODIS 개수(신뢰도 거르기 전 합이 원장과 같다)", () => {
    fires
      .filter((f) => !f.historical)
      .forEach((f) => {
        const p = firePoints(f);
        expect(p.viirs).toHaveLength(f.viirs);
        expect(p.modis).toHaveLength(f.modis);
        expect(p.modis.every((c) => c !== "low")).toBe(true); // MODIS 60–99
      });
  });

  it("고정·해상 열원: 시나리오 3일(11.08–11.11) 경보 시군에서 0개(목업 탐침 「고정 열원 0 · 해상 0」)", () => {
    ["andong", "uiseong", "cheongsong", "yecheon"].forEach((r) => expect(fixedPoints([r], ledger.today)).toHaveLength(0));
  });

  it("어댑터 덧붙임: 경보마다 통과 둘 · 처음 미읽음은 길안면 두 경보 · 과거 재구성 불은 그대로", () => {
    const as = opsAlerts(alerts);
    as.forEach((a) => expect((a.ops as { passes: unknown[] }).passes).toHaveLength(2));
    expect(as.filter((a) => (a.ops as { unread: string[] }).unread.some((r) => r !== "land")).map((a) => a.id)).toEqual(["A-0413", "A-0412"]);
    expect(as.filter((a) => (a.ops as { unread: string[] }).unread.includes("land")).map((a) => a.id)).toEqual(["A-0405"]);
    const fs = opsFires(fires, ledger.today);
    expect(fs.filter((f) => f.historical).every((f) => !("ops" in f))).toBe(true);
    expect(fs.filter((f) => !f.historical).every((f) => "ops" in f)).toBe(true);
  });
});
