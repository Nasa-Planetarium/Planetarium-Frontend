import { expect, test } from "@playwright/test";

/**
 * 예측 분석(lab) 시험(aibox 전용) — 과학자 역할로 열어 전망 스냅숏(outlook.json)이 화면에 붙는지 잰다.
 * 잰다: 권역 예측 17.8 · 시군 표 11행 · 행을 누르면 지도 읽기 띠 · 보정 검증 표 채택 모델 42.1 · 지도 칸.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    localStorage.setItem("em.role", "scientist");
  });
});

test("예측 분석: 권역 예측·시군 표·고르기·보정 검증", async ({ page }) => {
  await page.goto("/ko/lab/");
  const root = page.locator('[data-testid="lab"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  await expect(root.locator('[data-cnt="tot"]')).toContainText("17.8");
  const rows = root.locator("[data-ft] tbody tr");
  await expect(rows).toHaveCount(11);
  await expect(root.locator('[data-testid="lab-map"]')).toBeVisible();
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute("data-r", /.+/);
  await expect(root.locator('[data-testid="lab-map"] [aria-live="polite"]')).toContainText("80%");
  await expect(root.locator("table").filter({ hasText: "m2v_xgb" })).toContainText("42.1");
});
