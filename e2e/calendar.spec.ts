import { expect, test } from "@playwright/test";

/**
 * 캘린더(첫 탭) 시험(aibox 전용, MSW 스냅숏). 잰다: 개수 띠 4칸 값 · 칸 누르면 주소 ym · 보기 전환 눌림 · 상세 값(release 그대로) · 전 세계 재생 달 합계.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("캘린더: 개수 띠·상세 값·칸 고르기·보기 전환", async ({ page }, info) => {
  await page.goto("/ko/calendar/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="calendar"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator("h1")).toHaveText("연소 활동 통합 캘린더");
  await expect(root.locator('[data-cnt="ok"]')).toContainText("308");
  await expect(root.locator('[data-cnt="partial"]')).toContainText("1");
  await expect(root.locator("[data-det]")).toContainText("2,353");
  await expect(root.locator("[data-det]")).toContainText("109.1배");
  if (info.project.name === "web") {
    await root.locator('[role="gridcell"][data-y="2022"][data-m="3"]').click();
    await expect(page).toHaveURL(/ym=2022-03/);
  } else {
    await root.locator('button[data-m="4"]').click();
    await expect(page).toHaveURL(/ym=2025-04/);
  }
  const raw = root.locator('[data-view="raw_viirs"]');
  await raw.click();
  await expect(raw).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/view=raw_viirs/);
});

test("전 세계 재생: 달 합계(meta.total)", async ({ page }) => {
  await page.goto("/ko/calendar/?aoi=WORLD&ym=2025-03&mode=world");
  const root = page.locator('[data-testid="calendar"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator('[data-month="2025-03"]')).toContainText("141.2만", { timeout: 20000 });
});
