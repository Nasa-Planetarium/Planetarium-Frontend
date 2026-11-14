import { describe, expect, it } from "vitest";
import type { Alert, Fire } from "../../agency/port";
import ledger from "./ledger.json";
import { burnShape, landParcels } from "./land-parcels";

const fires = ledger.fires as unknown as Fire[];
const alerts = ledger.alerts as unknown as Alert[];
const byId = (id: string) => fires.find((f) => f.id === id) as Fire;

describe("land-parcels 목 생성기(목업 land.js parcels 이식)", () => {
  it("소실 면적이 없으면 필지 0", () => {
    expect(landParcels(byId("F-261111-03"), alerts)).toEqual([]);
  });
  it("작은 불: 필지 합 = 소실 면적(0.01 ha 단위, 최대 나머지)", () => {
    for (const id of ["F-261111-01", "F-261110-02", "F-261110-01", "F-261108-01"]) {
      const f = byId(id);
      const rows = landParcels(f, alerts);
      const sum = Math.round(rows.reduce((s, p) => s + p.area * 100, 0));
      expect(sum).toBe(Math.round((f.burned_ha as number) * 100));
      expect(rows.every((p) => p.area >= 0.01)).toBe(true);
    }
  });
  it("결정적: 같은 불 → 같은 필지", () => {
    const a = landParcels(byId("F-261111-01"), alerts);
    const b = landParcels(byId("F-261111-01"), alerts);
    expect(a).toEqual(b);
    // 목업 화면(g2 crit-land-ko-KOR-web) 첫 줄: 파천면 신기리 산 155-5 · 공유 · 1.56 ha · 심함
    expect(a.length).toBe(7);
    expect(a[0]).toMatchObject({ place: "파천면 신기리", mtn: true, lot: "155-5", owner: "public", area: 1.56, dmg: 3 });
  });
  it("대형 산불: 대표 14필지, 합 ≤ 총면적 12%, 전체 추정 = ha/3.1", () => {
    const f = byId("H-2503-UI");
    const rows = landParcels(f, alerts, ledger.regions);
    expect(rows.length).toBe(14);
    expect(rows.reduce((s, p) => s + p.area, 0)).toBeLessThanOrEqual(45200 * 0.12 + 1e-6);
    expect(rows[0]?.fire_meta).toMatchObject({ big: true, total: Math.round(45200 / 3.1), stage: 3, queued: false });
  });
  it("대기열·새로 들어옴: 오늘 진화 끝난 불 + 토지 담당 경보", () => {
    expect(landParcels(byId("F-261111-01"), alerts)[0]?.fire_meta).toMatchObject({ queued: true, fresh: true, stage: 0 });
    expect(landParcels(byId("F-261108-01"), alerts)[0]?.fire_meta).toMatchObject({ queued: false, fresh: false, stage: 1 });
  });
  it("소실 다각형 넓이 ≈ 소실 면적(±2%)", () => {
    const f = byId("F-261110-02");
    const P = burnShape(f as Fire & { burned_ha: number });
    const kx = Math.cos((f.lat * Math.PI) / 180);
    let A = 0;
    for (let i = 0; i < P.length; i++) {
      const [la1, lo1] = P[i] as [number, number];
      const [la2, lo2] = P[(i + 1) % P.length] as [number, number];
      A += (lo1 * kx * 111 * la2 * 111 - lo2 * kx * 111 * la1 * 111) / 2;
    }
    expect(Math.abs(Math.abs(A) * 100 - 12.6) / 12.6).toBeLessThan(0.02);
  });
});
