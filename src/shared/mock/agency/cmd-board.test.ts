import { describe, expect, it } from "vitest";
import type { Alert, Fire, Unit } from "../../agency/port";
import { cmdBoard } from "./cmd-board";
import ledger from "./ledger.json";

const fires = ledger.fires as unknown as Fire[];
const units = ledger.units as unknown as Unit[];
const alerts = ledger.alerts as unknown as Alert[];

describe("cmd-board 목 생성기", () => {
  const b = cmdBoard({ iso3: "KOR" }, ledger, fires, units, alerts);

  it("경북 북부 11개 시군 · 2001-01 ~ 2026-11 칸(311달)", () => {
    expect(b.kor).toBe(true);
    expect(b.regions).toHaveLength(11);
    expect(b.cells.andong?.harm).toHaveLength(311);
  });

  it("2012년 이전 VIIRS 는 null(운용 전), 결측 달은 null + 원장 키", () => {
    const i2005 = (2005 - 2001) * 12;
    expect(b.cells.andong?.viirs[i2005]).toBeNull();
    const i2003_11 = (2003 - 2001) * 12 + 10;
    expect(b.cells.andong?.modis[i2003_11]).toBeNull();
    expect(b.cells.andong?.miss[i2003_11]).toBe("2003-11");
  });

  it("결정적: 같은 질의 → 같은 값", () => {
    const b2 = cmdBoard({ iso3: "KOR" }, ledger, fires, units, alerts);
    expect(b2.cells.uiseong?.harm.slice(280, 300)).toEqual(b.cells.uiseong?.harm.slice(280, 300));
    expect(b2.hourly.days[5000]).toEqual(b.hourly.days[5000]);
  });

  it("2025-03 의성 대형산불 달이 그 시군의 가장 큰 달", () => {
    const h = b.cells.uiseong?.harm ?? [];
    const i = (2025 - 2001) * 12 + 2;
    const max = Math.max(...h.filter((v): v is number => v != null));
    expect(h[i]).toBe(max);
  });

  it("시간대 일 자료: 2001-01-01 부터 오늘까지, 시각 합 = 일 합계", () => {
    const d = b.hourly.days;
    expect(d[0]?.date).toBe("2001-01-01");
    expect(d[d.length - 1]?.date).toBe(ledger.today);
    const ok = d.find((x) => x.total && x.total > 3);
    expect(ok?.v?.reduce((s, v) => s + v, 0)).toBe(ok?.total);
  });

  it("대응 성과: 출동 4건(추정) · 자원 9대 · 해마다 탄 면적", () => {
    expect(b.response?.arr).toHaveLength(4);
    expect(b.response?.arr.every((x) => !x.real)).toBe(true);
    expect(b.response?.total).toBe(9);
    const y2025 = b.response?.burn.find((x) => x.year === 2025);
    expect(y2025).toMatchObject({ ha: 45200, n: 1 });
    expect(b.response?.burn.find((x) => x.year === 2026)?.n).toBe(6);
  });

  it("한국 밖: 넘긴 1급 지역으로 만들고 사건 원장(대응 성과)은 없음", () => {
    const o = cmdBoard({ iso3: "USA", regions: [{ id: "USA-1", lat: 34, lon: -118, area_km2: 400000 }, { id: "USA-2", lat: 45, lon: -100, area_km2: 200000 }] }, ledger, fires, units, alerts);
    expect(o.kor).toBe(false);
    expect(Object.keys(o.cells)).toEqual(["USA-1", "USA-2"]);
    expect(o.response).toBeNull();
    expect(o.shocks).toEqual([]);
  });
});
