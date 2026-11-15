import { expect, test } from "@playwright/test";

/**
 * 지도 불러오는 중 덮개는 처음 한 번만(F14 LF-1·2, aibox 전용 · MSW 스냅숏).
 * 잰다: 캘린더 점 지도가 뜬 뒤 달을 바꿔도 ① 덮개([data-map-loading])가 다시 생기지 않고 ② 지도 칸(MapLibre 캔버스)이 같은 요소로 남는다.
 * 예전에는 CalMap key 에 달이 들어 있어 달마다 지도를 새로 만들며 남색 덮개가 80–160ms 번쩍였다.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("캘린더: 달을 바꿔도 지도 덮개가 다시 뜨지 않고 지도를 새로 만들지 않는다", async ({ page }, info) => {
  await page.goto("/ko/calendar/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="calendar"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const dm = root.locator('[data-ready="1"]:has(canvas.maplibregl-canvas)').first();
  await expect(dm).toBeVisible({ timeout: 30000 });
  await expect(root.locator("[data-map-loading]")).toHaveCount(0, { timeout: 15000 });

  /* 덮개가 붙는 순간을 센다 · 지금 캔버스에 표시를 단다 */
  await page.evaluate(() => {
    const w = window as unknown as { __mlN: number };
    w.__mlN = 0;
    new MutationObserver((ms) => {
      ms.forEach((m) =>
        m.addedNodes.forEach((n) => {
          if (n instanceof Element && (n.matches("[data-map-loading]") || n.querySelector("[data-map-loading]"))) w.__mlN++;
        }),
      );
    }).observe(document.body, { childList: true, subtree: true });
    const c = document.querySelector('[data-testid="calendar"] canvas.maplibregl-canvas');
    if (c) c.setAttribute("data-e2e-keep", "1");
  });

  if (info.project.name === "web") {
    await root.locator('[role="gridcell"][data-y="2022"][data-m="3"]').click();
    await expect(page).toHaveURL(/ym=2022-03/);
  } else {
    await root.locator('button[data-m="4"]').click();
    await expect(page).toHaveURL(/ym=2025-04/);
  }
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __mlN: number }).__mlN)).toBe(0);
  await expect(root.locator('canvas.maplibregl-canvas[data-e2e-keep="1"]')).toHaveCount(1);
});
