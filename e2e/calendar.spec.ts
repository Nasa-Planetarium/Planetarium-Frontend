import { expect, test } from "@playwright/test";

/**
 * 캘린더(첫 탭) 시험(팀 시험 서버 전용, MSW 스냅숏). 잰다: 개수 띠 4칸 값 · 칸 누르면 주소 ym · 보기 전환 눌림 · 상세 값(release 그대로) · 전 세계 재생 달 합계.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("캘린더: 개수 띠·상세 값·칸 고르기·보기 전환", async ({ page }, info) => {
  await page.goto("/ko/calendar/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="calendar"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator("h1")).toHaveText("연소 활동 통합 모니터링");
  await expect(root.locator('[data-cnt="ok"]')).toContainText("308");
  await expect(root.locator('[data-cnt="partial"]')).toContainText("1");
  await expect(root.locator("[data-det]")).toContainText("2,353");
  await expect(root.locator("[data-det]")).toContainText("184.7배");
  /* v1.2 비교 기준 기간(aoi_month_compare 새 판): 경북(SIDO_47)은 2012–2025 · 기준 연수 = 응답 n_baseline_years(13) */
  await expect(root.locator("[data-det] [data-baseline]")).toHaveAttribute("data-baseline", "2012-2025");
  await expect(root.locator("[data-det] [data-baseline]")).toHaveText("13년 · 2012–2025");
  await expect(root.locator("[data-det] [data-baseline]")).toHaveAttribute("title", /연속성 점검.*비율 0\.47/);
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

/* 나라 칩으로 고른 나라가 지역 목록에 없다고 전 세계로 돌아가지 않는다: 숨김 섬나라(몰디브) · 색인과 release 코드가 다른 나라(남수단 SSD → ADM0_SDS) */
for (const [c, aoi] of [
  ["MDV", "ADM0_MDV"],
  ["SSD", "ADM0_SDS"],
] as const) {
  test(`나라 ${c}: 캘린더가 그 나라 단위(${aoi})로 열린다`, async ({ page }) => {
    await page.goto(`/ko/calendar/?c=${c}`);
    const root = page.locator('[data-testid="calendar"][data-ready="1"]');
    await expect(root).toBeVisible({ timeout: 30000 });
    await expect(root).toHaveAttribute("data-aoi", aoi);
  });
}
