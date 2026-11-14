import { describe, expect, it } from "vitest";
import { MockAgencyAdapter } from "./mock-agency-adapter";
import { firePointsXY } from "./ops-scenario";

describe("목 기관 어댑터 — 화면 사이 반영(진화 완료 → 피해 면적 · 현장 확인 요청 → 경보 기록)", () => {
  it("진화 완료하면 불이 contained · 추정 소실 면적 · 토지 관리 「산정 대기」 경보가 생긴다(목업 mock/agency.js)", async () => {
    const ag = new MockAgencyAdapter();
    const f = await ag.containFire("F-261111-02", "2026-11-11 14:30");
    expect(f.status).toBe("contained");
    const fires = await ag.listFires();
    const g = fires.find((x) => x.id === "F-261111-02") as Record<string, unknown>;
    expect(typeof g.burned_ha).toBe("number");
    expect(g.contained_at).toBe("2026-11-11 14:30");
    const alerts = await ag.listAlerts();
    const la = alerts.find((a) => a.id === "A-L11-02");
    expect(la?.targets).toEqual(["land"]);
    expect(la?.status).toBe("new");
    /* 필지 생성기가 이 불을 산정 대기(queued)로 본다 */
    const parcels = await ag.listParcels("F-261111-02");
    expect(parcels.length).toBeGreaterThan(0);
    expect((parcels[0]?.fire_meta as { queued?: boolean } | undefined)?.queued).toBe(true);
  });

  it("현장 확인 요청은 토지 관리 새 경보를 확인으로 돌리고 「현장 확인 요청 {n}필지」 기록을 남긴다(목업 land.js requestCheck)", async () => {
    const ag = new MockAgencyAdapter();
    await ag.containFire("F-261111-02", "2026-11-11 14:30");
    const hit = await ag.requestFieldCheck("F-261111-02", 3, "14:35");
    expect(hit.map((a) => a.id)).toEqual(["A-L11-02"]);
    const a = (await ag.listAlerts()).find((x) => x.id === "A-L11-02")!;
    expect(a.status).toBe("ack");
    const log = (a.ops as { log: { key?: string; params?: { n: number }; by: string }[] }).log;
    expect(log.at(-1)).toEqual({ at: "14:35", by: "land", key: "land.log.req_short", params: { n: 3 } });
  });

  it("지금 불 관측 점 자리 수 = 원장 VIIRS + MODIS(목업 EM.hotspots 현재 불)", async () => {
    const ag = new MockAgencyAdapter();
    const fires = await ag.listFires();
    fires
      .filter((f) => !f.historical)
      .forEach((f) => {
        const xy = firePointsXY(f);
        expect(xy.length).toBe(f.viirs + f.modis);
        xy.forEach((p) => {
          expect(Math.abs(p.lat - f.lat)).toBeLessThan(0.1);
          expect(Math.abs(p.lon - f.lon)).toBeLessThan(0.1);
        });
      });
  });
});
