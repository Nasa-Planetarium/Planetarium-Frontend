import { expect, test } from "@playwright/test";

/**
 * ② 비교 분석 시험(aibox 전용) — 계약 /api/v1(MSW 스냅숏 또는 실서버)이 3단계 화면에 붙는지 잰다.
 * 잰다: 경북 2025-03 판정(예년보다 많음 · 백분위 100) · 단계 1→2→3 주소 step · 캘린더 「비교 분석」 넘김(aoi·ym·view 유지) · 보기 바꾸기 · 고를 수 없는 달은 비활성.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("비교 분석: S1 → S2 → S3, 판정·문장", async ({ page }) => {
  await page.goto("/ko/analysis/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-step", "1");
  await expect(root.locator('button[data-m="3"]')).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator("table")).toContainText("2025-03");
  await root.locator("button[data-next]").click();
  await expect(page).toHaveURL(/step=2/);
  await expect(root).toHaveAttribute("data-step", "2");
  await expect(root.locator("[data-cnt]")).toHaveCount(3);
  await expect(root).toContainText("백분위 100");
  await expect(root.locator("svg").first()).toBeVisible();
  await root.locator('button[data-view="raw_viirs"]').click();
  await expect(page).toHaveURL(/view=raw_viirs/);
  await root.locator("button[data-s3]").click();
  await expect(page).toHaveURL(/step=3/);
  await expect(root.locator("dl").first()).toContainText("100");
  await root.locator("button[data-s1]").click();
  await expect(page).toHaveURL(/step=1/);
});

test("캘린더 → 비교 분석: 받는 쪽이 그 지역·달·보기로", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2025-03&view=raw_viirs");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-step", "2");
  await expect(root).toHaveAttribute("data-aoi", "SIDO_47");
  await expect(root).toHaveAttribute("data-ym", "2025-03");
  await expect(root.locator('button[data-view="raw_viirs"]')).toHaveAttribute("aria-pressed", "true");
});

test("고를 수 없는 달(진행 중)은 S1 에 머문다", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2026-11");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-step", "1");
  await expect(root.locator("button[data-next]")).toBeDisabled();
});
