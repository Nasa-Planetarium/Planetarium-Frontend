import { expect, test } from "@playwright/test";

/**
 * 방법·검증(method) 시험(aibox 전용) — MSW 스냅숏(release m2v_meta · korea.json)이 화면에 붙는지 잰다.
 * 잰다: 머리 개수 4칸(기간 4 · 검증 범위 11 · NRT 3 · 결측 1) · 절 5개 · 검증 표 채택 모델 MAE 42.1 · v1.1 진행 중인 달 102.3 · 주소 ?sec= 유지.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("방법·검증: 머리 개수·절 고르기·검증 수치·진행 중인 달", async ({ page }) => {
  await page.goto("/ko/method/");
  const root = page.locator('[data-testid="method"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  await expect(root.locator("h1")).toHaveText("방법·검증");
  const cnt = root.locator("button[data-cnt]");
  await expect(cnt).toHaveCount(4);
  await expect(cnt.nth(0)).toContainText("4");
  await expect(cnt.nth(1)).toContainText("11");
  await expect(cnt.nth(2)).toContainText("3");
  await expect(cnt.nth(3)).toContainText("1");
  await expect(root.locator("[data-sec]").filter({ hasText: /./ })).toHaveCount(5);
  await root.locator('button[data-sec="validation"]').click();
  await expect(page).toHaveURL(/sec=validation/);
  await expect(root.locator("table").first()).toContainText("42.1");
  await root.locator('button[data-sec="v11"]').click();
  await expect(root).toContainText("102.3");
  await expect(root).toContainText("2026-11-13");
});
