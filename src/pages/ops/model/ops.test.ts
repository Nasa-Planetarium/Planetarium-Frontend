import { describe, expect, it } from "vitest";
import type { Alert, Fire, Unit } from "@/shared/agency";
import {
  alertSnap,
  bodyNote,
  confToggle,
  counts,
  etaMin,
  evidenceCounts,
  firstPick,
  hmOf,
  minsSince,
  readAlert,
  readFire,
  readUnit,
  stepIdx,
  tabOf,
  units4,
} from "./ops";

const A = (id: string, fire_id: string, status: Alert["status"], extra: Partial<Alert> = {}) =>
  readAlert({ id, fire_id, at: "14:20", level: 3, title: id, status, targets: ["responder", "firefighter"], ops: { log: [{ at: "14:20" }], unread: [], passes: [] }, ...extra });
const F = (id: string, extra: Partial<Fire> = {}) =>
  readFire({ id, name: id, region: "andong", lat: 36.468, lon: 128.935, detected_at: "2026-11-11 13:52", status: "new", level: 4, viirs: 20, modis: 3, frp_max: 132.5, ...extra });
const U = (id: string, status: Unit["status"], lat: number, lon: number, type = "engine") => readUnit({ id, type, name: id, org: "o", lat, lon, status, crew: 3 });

describe("ops 화면 모델", () => {
  it("상태 → 묶음·단계(목업 TABS · stepIdx)", () => {
    expect(tabOf({ status: "new" })).toBe("open");
    expect(tabOf({ status: "dispatched" })).toBe("active");
    expect(tabOf({ status: "resolved" })).toBe("closed");
    expect([stepIdx("new"), stepIdx("ack"), stepIdx("dispatched"), stepIdx("onscene"), stepIdx("contained")]).toEqual([0, 1, 2, 3, 4]);
  });

  it("경과 분: 원장 시계 기준, 「어제」·미래는 없음", () => {
    expect(minsSince("13:54", "14:20")).toBe(26);
    expect(minsSince("어제 10:14", "14:20")).toBeNull();
    expect(minsSince("15:00", "14:20")).toBeNull();
    expect(hmOf(Date.UTC(2026, 10, 11, 5, 20), 540)).toBe("14:20");
  });

  it("도착 예상(목업 EM.etaMin): 최소 2분, 헬기는 직선 200 km/h + 6분", () => {
    const f = { lat: 36.468, lon: 128.935 };
    expect(etaMin({ type: "engine", lat: f.lat, lon: f.lon }, f)).toBe(2);
    expect(etaMin({ type: "heli", lat: f.lat, lon: f.lon }, f)).toBe(6);
    const us = [U("far", "standby", 36.6, 128.6), U("near", "standby", 36.46, 128.91), U("busy", "onscene", 36.47, 128.93)];
    expect(units4(us, f).map((r) => r.u.id)).toEqual(["near", "far"]);
  });

  it("경보 시점 관측 점(EM.alertSnap): 경보 값 → 대체된 경보 → 불 값", () => {
    const f = F("F1", { viirs: 6, modis: 1 });
    const newer = A("A2", "F1", "new", { viirs: 20, modis: 3 });
    const older = A("A1", "F1", "new");
    const all = [newer, older];
    expect(alertSnap(newer, all, f).pts).toBe(23);
    expect(alertSnap(older, all, f).pts).toBeNull();
    expect(alertSnap(older, [older], f).pts).toBe(7);
  });

  it("개수 띠: 미처리·진행 중·출동·대기 + 미처리 최고 단계 점", () => {
    const c = counts([A("A1", "F1", "new", { level: 4 }), A("A2", "F2", "dispatched")], [U("u1", "onscene", 0, 0), U("u2", "standby", 0, 0), U("u3", "standby", 0, 0)]);
    expect(c.map((x) => [x.key, x.value, x.lv])).toEqual([
      ["new", 1, 4],
      ["work", 1, 0],
      ["busy", 1, 0],
      ["ready", 2, 0],
    ]);
  });

  it("신뢰도 거르기: 전체 = 원장 수, 거르면 관측 점 등급으로 센다 · 마지막 하나는 못 끈다", () => {
    const f = { ...F("F1", { viirs: 3, modis: 1 }), points: { viirs: ["nominal", "high", "nominal"] as const, modis: ["high"] as const } } as unknown as ReturnType<typeof F>;
    expect(evidenceCounts(f, null)).toMatchObject({ nV: 3, nM: 1 });
    expect(evidenceCounts(f, ["high"])).toMatchObject({ nV: 1, nM: 1 });
    expect(confToggle(null, "low")).toEqual(["nominal", "high"]);
    expect(confToggle(["high"], "high")).toBe(false);
  });

  it("경보 본문은 수치 문장을 빼고 판단 문장만", () => {
    expect(bodyNote("VIIRS 14, MODIS 3, 열 세기(FRP) 최대 86.4 MW. 119 신고 접수 전 위성 선감지.")).toBe("119 신고 접수 전 위성 선감지.");
  });

  it("첫 선택: 미읽음 → 열린 경보 → 첫 줄", () => {
    const xs = [A("A1", "F1", "resolved"), A("A2", "F2", "dispatched"), A("A3", "F3", "new")];
    expect(firstPick(xs, ["A3"])).toBe("A3");
    expect(firstPick(xs, [])).toBe("A2");
  });
});
