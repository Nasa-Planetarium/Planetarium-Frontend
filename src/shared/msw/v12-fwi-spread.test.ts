import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fwiBody, spreadBody, spreadLevel, type FwiSnap, type SpreadSnap } from "./v12-fwi-spread";

/* 스냅숏은 저장소에 들어 있다(scripts/snap-v12-fwi-spread.py 가 release v1.2 에서 자름) — 없으면 시험이 실패해야 한다(건너뛰지 않음) */
const dir = path.resolve(__dirname, "../../../public/data/snap/v12");
const fwi = JSON.parse(fs.readFileSync(path.join(dir, "fwi.json"), "utf8")) as FwiSnap;
const spread = JSON.parse(fs.readFileSync(path.join(dir, "spread.json"), "utf8")) as SpreadSnap;
type Body = Record<string, unknown> & { coverage: { available: boolean; reason: string | null } };
const body = (o: ReturnType<typeof fwiBody>) => {
  if (o.status !== 200) throw new Error(`status ${o.status}`);
  return o.body as Body;
};

describe("FWI 스냅숏 → 계약 FwiResponse", () => {
  it("295 AOI, 마지막 날 2026-11-11 (release fwi_aoi_day 잰 값)", () => {
    expect(Object.keys(fwi.aois)).toHaveLength(295);
    expect(new Set(Object.values(fwi.aois).map((a) => a.as_of_date))).toEqual(new Set(["2026-11-11"]));
  });
  it("KR · date 없음 → 마지막 날, 상대 등급 below_normal · 절대 low(파일 값)", () => {
    const b = body(fwiBody(fwi, "KR", {})) as Body & { day: { fwi_mean: number; fwi_rel_class: string; fwi_class: string; fwi_pct: null } };
    expect(b.as_of_date).toBe("2026-11-11");
    expect(b.date).toBe("2026-11-11");
    expect(b.day.fwi_rel_class).toBe("below_normal");
    expect(b.day.fwi_class).toBe("low");
    expect(b.day.fwi_mean).toBeCloseTo(2.1409, 4);
    expect(b.day.fwi_pct).toBeNull(); // 2026년 행은 파일에서 null
    expect(b.coverage).toEqual({ available: true, scope: "kr_arg_fwi", reason: null });
  });
  it("ADM0_ARG → normal · very_high", () => {
    const b = body(fwiBody(fwi, "ADM0_ARG", {})) as Body & { day: { fwi_rel_class: string; fwi_class: string } };
    expect(b.day.fwi_rel_class).toBe("normal");
    expect(b.day.fwi_class).toBe("very_high");
  });
  it("기준일 뒤 날짜 → day null(오류 아님), 범위 밖 AOI → coverage false", () => {
    expect((body(fwiBody(fwi, "KR", { date: "2026-11-14" })) as Body).day).toBeNull();
    const out = body(fwiBody(fwi, "ADM0_JPN", {}));
    expect(out.coverage).toEqual({ available: false, scope: "kr_arg_fwi", reason: "out_of_coverage" });
    expect(out.day).toBeNull();
    expect(out.as_of_date).toBeNull();
  });
  it("스냅숏 밖 옛날은 503(지어내지 않음), date+start 는 400", () => {
    expect(fwiBody(fwi, "KR", { date: "2012-01-01" }).status).toBe(503);
    expect(fwiBody(fwi, "KR", { date: "2026-11-10", start: "2026-11-01", end: "2026-11-02" }).status).toBe(400);
  });
});

describe("확산 nowcast 스냅숏 → 계약 SpreadNowcast", () => {
  const all = spread.cells.map((r) => spreadLevel(r[4]));
  it("10,189칸 · 기준일 2026-11-13 → 목표 2026-11-14 · 단계 분포 low 9,708 · moderate 338 · high 143 (계약 잰 값)", () => {
    expect(spread.cells).toHaveLength(10189);
    expect([spread.as_of_date, spread.target_date]).toEqual(["2026-11-13", "2026-11-14"]);
    expect(all.filter((x) => x === "low")).toHaveLength(9708);
    expect(all.filter((x) => x === "moderate")).toHaveLength(338);
    expect(all.filter((x) => x === "high")).toHaveLength(143);
  });
  it("aoi_id=KR → 한국 경계 안 칸만(일본 칸 없음)", () => {
    const b = body(spreadBody(spread, { aoi_id: "KR" })) as Body & { cells: { cand_adm0: string | null }[]; count: number };
    expect(b.count).toBeGreaterThan(0);
    expect(b.count).toBeLessThanOrEqual(98);
    expect(b.cells.every((c) => c.cand_adm0 !== "JPN")).toBe(true);
    expect(b.coverage.available).toBe(true);
  });
  it("범위 밖 AOI(일본) → cells [] + available false", () => {
    const b = body(spreadBody(spread, { aoi_id: "ADM0_JPN" })) as Body & { cells: unknown[] };
    expect(b.cells).toEqual([]);
    expect(b.coverage).toEqual({ available: false, scope: "kr_box_arg_spread", reason: "out_of_coverage" });
  });
  it("계약 예시 bbox(-62,-26.5,-61,-25.5) 첫 칸 = p 0.97484 high", () => {
    const b = body(spreadBody(spread, { bbox: "-62,-26.5,-61,-25.5", min_level: "high" })) as Body & { cells: { p_spread: number; level: string; cell_lat: number; cell_lon: number }[] };
    const top = b.cells.find((c) => c.cell_lat === -25.9125 && c.cell_lon === -61.4625)!;
    expect(top.p_spread).toBe(0.97484);
    expect(top.level).toBe("high");
  });
  it("aoi_id·bbox 둘 다 / 둘 다 없음 → 400", () => {
    expect(spreadBody(spread, {}).status).toBe(400);
    expect(spreadBody(spread, { aoi_id: "KR", bbox: "1,2,3,4" }).status).toBe(400);
  });
});
