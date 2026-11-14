import { describe, expect, it } from "vitest";
import type { Parcel } from "@/shared/agency";
import { firstPick, initialUi, lists, readParcels, seedLog, stageAt, stageOf, when, type FireMeta, type LandFire } from "./land";

const fire = (id: string, o: Partial<LandFire> = {}): LandFire => ({
  id,
  name: "청송군 파천면 신기리",
  region: "cheongsong",
  lat: 36.45,
  lon: 129.02,
  detected_at: "2026-11-11 09:05",
  status: "out",
  level: 2,
  viirs: 1,
  modis: 0,
  frp_max: 10,
  burned_ha: 1,
  ...o,
});
const meta = (o: Partial<FireMeta> = {}): FireMeta => ({ stage: 1, queued: false, fresh: false, big: false, total: 3, burn_poly: [], region_names: {}, ...o });

describe("land 화면 모델(목업 land.js 규칙)", () => {
  const A = fire("A", { contained_at: "2026-11-11 12:40", status: "contained" });
  const B = fire("B", { contained_at: "2026-11-08 19:02" });
  const C = fire("C", { contained_at: "2026-11-10 21:10" });
  const H = fire("H", { historical: true, contained_at: "2020-04-26 14:30" });
  const metas = { A: meta({ queued: true, fresh: true, stage: 0 }), B: meta({ stage: 1 }), C: meta({ stage: 2 }), H: meta({ stage: 3 }) };

  it("묶음: 대기 · 단계 · 과거 산불, 첫 선택은 산정 대기", () => {
    const L = lists([A, B, C, H], metas, initialUi());
    expect(L.s0.map((f) => f.id)).toEqual(["A"]);
    expect(L.s1.map((f) => f.id)).toEqual(["B"]);
    expect(L.s2.map((f) => f.id)).toEqual(["C"]);
    expect(L.hist.map((f) => f.id)).toEqual(["H"]);
    expect(firstPick(L)).toBe("A");
  });
  it("요청으로 대기에서 넘기면 현장 확인(1), 사용자 단계가 씨앗을 덮는다", () => {
    const ui = { ...initialUi(), dequeued: ["A"], stage: { A: 1, C: 3 } };
    expect(stageOf(A, metas.A, ui)).toBe(1);
    expect(stageOf(C, metas.C, ui)).toBe(3);
  });
  it("씨앗 이력: 등록 + 단계 수만큼 넘김, 단계 시각은 그 넘김 날짜", () => {
    const logs = seedLog(C, 2, "2026-11-11 14:20");
    expect(logs.map((l) => l.stage)).toEqual([0, 1, 2]);
    expect(logs[0]?.at).toBe("11-10 21:10");
    expect(stageAt(logs, 0)).toBe("11-10");
    expect(stageAt(logs, 2)).toBe("11-11");
  });
  it("시각 표기: 오늘 시:분 · 올해 월-일 · 그 전 연-월-일", () => {
    expect(when("2026-11-11 09:05", "2026-11-11")).toBe("09:05");
    expect(when("2026-11-08 16:44", "2026-11-11")).toBe("11-08");
    expect(when("2020-04-24 15:39", "2026-11-11")).toBe("2020-04-24");
  });
  it("포트 행 읽기: 모르는 값은 기본값으로", () => {
    const rows = [{ id: "x-0", fire_id: "x", place: "p", mtn: true, lot: "1-1", jimok: "??", owner: "public", area: 1.2, dmg: 9, prio: 2, fire_meta: { stage: 2, queued: false } }] as Parcel[];
    const r = readParcels(rows);
    expect(r.rows[0]).toMatchObject({ jimok: "forest", owner: "public", dmg: 3, prio: 2 });
    expect(r.meta).toMatchObject({ stage: 2, queued: false, burn_poly: [] });
  });
});
