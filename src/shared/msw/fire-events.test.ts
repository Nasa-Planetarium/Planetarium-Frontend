import fs from "node:fs";
import path from "node:path";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFireEventHandlers, type EventsSnap } from "./fire-events";

/*
 * 기대값은 release fire_events.parquet 를 pandas 로 따로 읽어 센 값이다(2026-11-15 aibox, 스냅숏 스크립트와 다른 코드):
 *   KR 2025-03 겹침 237건(감지 3개 이상 58) — fire_events_meta validation 의 n_events 237 과 같다 · 의성군 30(13) · 경상북도 141
 *   ARG(country) 2025-09 6,967(1,658) · KR 2026-11-05..11-11 20(4)
 *   KR 2016–2025 연소 면적 1위 KR_20220304_0002 131.80 km² · ARG 1위 ARG_20170101_0033 1,365.66 km²
 */
const file = path.resolve(__dirname, "../../../public/data/layers/fire-events.json");
const snap = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as EventsSnap) : null;
const B = "http://t.test/api/v1";
const server = setupServer(...createFireEventHandlers(B, async () => "v1-m2v-2026-11-14", async () => snap as EventsSnap));
const get = async (q: string) => {
  const r = await fetch(`${B}${q}`);
  return { status: r.status, body: (await r.json()) as Record<string, unknown> & { events?: { event_id: string; burned_area_km2: number | null }[]; total?: number | null; coverage?: { available: boolean } } };
};

describe.skipIf(!snap)("MSW /fire-events (public/data/layers/fire-events.json)", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterAll(() => server.close());

  it("한국 달 수 = 파일에서 센 값(나라·시도·시군구)", async () => {
    expect((await get("/fire-events?aoi_id=KR&start=2025-03-01&end=2025-03-31&limit=1")).body.total).toBe(237);
    expect((await get("/fire-events?aoi_id=KR&start=2025-03-01&end=2025-03-31&min_det=3&limit=1")).body.total).toBe(58);
    expect((await get("/fire-events?aoi_id=SGG_47730&start=2025-03-01&end=2025-03-31&limit=1")).body.total).toBe(30);
    expect((await get("/fire-events?aoi_id=SIDO_47&start=2025-03-01&end=2025-03-31&limit=1")).body.total).toBe(141);
    expect((await get("/fire-events?aoi_id=KR&start=2026-11-05&end=2026-11-11&limit=1")).body.total).toBe(20);
  });

  it("아르헨티나: 꼭 한 달 창은 파일에서 센 수, 자른 범위 밖 기간은 total null", async () => {
    const m = await get("/fire-events?aoi_id=ADM0_ARG&start=2025-09-01&end=2025-09-30&limit=3");
    expect(m.body.total).toBe(6967);
    expect(m.body.truncated).toBe(true);
    expect((await get("/fire-events?aoi_id=ADM0_ARG&start=2025-09-01&end=2025-09-30&min_det=3&limit=3")).body.total).toBe(1658);
    expect((await get("/fire-events?aoi_id=ADM0_ARG&start=2025-09-01&end=2025-09-20&limit=3")).body.total).toBeNull();
  });

  it("연소 면적 큰 순(2016–2025) 1위 = 파일 값 그대로", async () => {
    const k = await get("/fire-events?aoi_id=KR&start=2016-01-01&end=2025-12-31&sort=burned_area_km2&limit=3");
    expect(k.body.events?.[0]?.event_id).toBe("KR_20220304_0002");
    expect(k.body.events?.[0]?.burned_area_km2).toBeCloseTo(131.8004, 3);
    const a = await get("/fire-events?aoi_id=ADM0_ARG&start=2016-01-01&end=2025-12-31&sort=burned_area_km2&limit=2");
    expect(a.body.events?.[0]?.event_id).toBe("ARG_20170101_0033");
  });

  it("범위 밖 = 200 + 빈 배열 + coverage.available=false (오류 아님, 0 을 지어내지 않음)", async () => {
    const r = await get("/fire-events?aoi_id=ADM0_USA&start=2025-03-01&end=2025-03-31");
    expect(r.status).toBe(200);
    expect(r.body.events).toEqual([]);
    expect(r.body.coverage?.available).toBe(false);
    const b = await get("/fire-events?bbox=0,0,10,10&start=2025-03-01&end=2025-03-31");
    expect(b.body.coverage?.available).toBe(false);
  });

  it("계약 오류: aoi_id·bbox 둘 다 40003 · 기간 3,700일 넘음 40106 · 없는 사건 40402", async () => {
    expect((await get("/fire-events?aoi_id=KR&bbox=124,33,130,38&start=2025-03-01&end=2025-03-31")).body.error_no).toBe(40003);
    expect((await get("/fire-events?aoi_id=KR&start=2012-01-01&end=2025-12-31")).body.error_no).toBe(40106);
    const nf = await get("/fire-events/KR_20000101_9999");
    expect(nf.status).toBe(404);
    expect(nf.body.error_no).toBe(40402);
    const one = await get("/fire-events/KR_20250323_0006");
    expect((one.body.event as { burned_area_km2: number }).burned_area_km2).toBeCloseTo(97.2404, 3);
  });
});
