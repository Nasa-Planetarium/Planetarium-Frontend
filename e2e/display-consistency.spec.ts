import { expect, test, type Page } from "@playwright/test";

/**
 * 표시 규칙서(2026-11-15) 회귀 시험 — 사용자 지적 「나라마다 어떤 것은 이전 표시 방식, 어떤 것은 지금 표시 방식」.
 * 잰다: 여러 나라의 같은 화면(캘린더 지도)에서 ① 범례가 같은 부품 하나(MapKey)이고 단계 경계·색 토큰·견본 색이 같다
 *       ② 표현 단계가 나라가 아니라 지도 시야 넓이로 정해진다(> 100 → L1 · ≤ 100 → L2 · ≤ 4 → L3, 처음 열 때는 여유 없음)
 *       ③ 세계 재생 · 공통 지도(경보·출동)의 범례도 같은 단계 경계 · 색 토큰 · 견본 색 · ④ 페이지 오류 0.
 * MSW: /cells·/hotspots 는 503 이라 0.1° 칸·점은 상태 줄(「이 지역 자료 없음」)로 남고, 1° 칸은 정적 묶음으로 그려진다.
 */
/* 나라 칩(c=)으로 연다 — 한국(윤곽 없음 · 기본 시야) · 일본 · 미국(날짜 변경선) · 프랑스 · 인도 · 몰디브(군도) · 경북 사례 달(좁은 시야) */
const AOIS = ["aoi=KR&ym=2024-04&mode=cal", "c=JPN&ym=2024-04&mode=cal", "c=USA&ym=2024-04&mode=cal", "c=FRA&ym=2024-04&mode=cal", "c=IND&ym=2024-04&mode=cal", "c=MDV&ym=2024-04&mode=cal", "aoi=SIDO_47&ym=2025-03&mode=cal"];
const expectLevel = (a: number) => (a > 100 ? "L1" : a > 4 ? "L2" : "L3");

async function keyOf(page: Page, scope: string) {
  const k = page.locator(`${scope} [data-map-key]`).first();
  await expect(k).toBeVisible({ timeout: 30000 });
  return k.evaluate((el) => ({
    steps: el.getAttribute("data-steps"),
    tokens: el.getAttribute("data-tokens"),
    title: el.querySelector("b")?.textContent ?? "",
    colors: [...el.querySelectorAll("i")].map((i) => getComputedStyle(i).backgroundColor).filter((c) => c !== "rgba(0, 0, 0, 0)"),
  }));
}

test.describe("나라와 상관없이 같은 표시 규칙", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, "웹 너비에서만");
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
  });

  test("캘린더 지도: 범례·단계 경계·색이 나라마다 같고, 단계는 시야 넓이로", async ({ page }) => {
    test.setTimeout(120_000);
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    const seen: { aoi: string; key: Awaited<ReturnType<typeof keyOf>>; level: string; area: number }[] = [];
    for (const aoi of AOIS) {
      await page.goto(`/ko/calendar/?${aoi}`);
      const map = page.locator('[data-map][data-level]:not([data-level=""])');
      await expect(map, aoi).toBeVisible({ timeout: 30000 });
      /* 나라 윤곽이 늦게 와서 다시 맞춘다 — 시야 넓이가 1초 동안 그대로일 때까지 기다린다 */
      let prev = "";
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(1000);
        const a = (await map.getAttribute("data-area")) ?? "";
        if (a && a === prev) break;
        prev = a;
      }
      const key = await keyOf(page, "[data-map]");
      const level = (await map.getAttribute("data-level")) ?? "";
      const area = Number(await map.getAttribute("data-area"));
      seen.push({ aoi, key, level, area });
      expect(level, `${aoi} 넓이 ${area}`).toBe(expectLevel(area));
    }
    const cellKey = seen.find((x) => x.level === "L1" || x.level === "L2")!.key;
    for (const s of seen) {
      expect(s.key.steps, s.aoi).toBe("0.1,1,10,100");
      expect(s.key.tokens, s.aoi).toBe("h1,h2,h4,h5,h6");
      expect(s.key.title, s.aoi).toBe(seen[0]!.key.title);
      if (s.level === "L1" || s.level === "L2") expect(s.key.colors, s.aoi).toEqual(cellKey.colors);
    }
    /* 넓은 시야와 좁은 시야가 실제로 둘 다 있었다(한 단계만 보고 통과하지 않게) */
    console.log("[display-consistency]", JSON.stringify(seen.map((s) => [s.aoi, s.level, s.area])));
    expect(new Set(seen.map((s) => s.level)).size, JSON.stringify(seen.map((s) => [s.aoi, s.level, s.area]))).toBeGreaterThan(1);
    expect(errs).toEqual([]);
  });

  test("세계 재생 · 공통 지도(경보·출동 미국)의 범례도 같은 경계·색", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto("/ko/calendar/?aoi=WORLD&ym=2025-03&mode=world");
    const w = await keyOf(page, '[data-testid="calendar"]');
    await page.addInitScript(() => sessionStorage.setItem("em.role", "responder"));
    await page.goto("/ko/ops/?c=USA");
    const o = await keyOf(page, '[data-testid="ops-det-map"]');
    for (const k of [w, o]) {
      expect(k.steps).toBe("0.1,1,10,100");
      expect(k.tokens).toBe("h1,h2,h4,h5,h6");
      expect(k.title).toBe(w.title);
    }
    expect(o.colors.slice(0, 5)).toEqual(w.colors.slice(0, 5));
    expect(errs).toEqual([]);
  });
});
