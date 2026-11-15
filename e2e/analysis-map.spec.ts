import { expect, test } from "@playwright/test";

/**
 * 비교 분석 지도 회귀(2026-11-15 사용자 「비교 분석에서 지도 잘 안 나와」 — XPath = S2 「칸 지도」 칸).
 * 잰다(MSW 스냅숏):
 * - S1 경계 미리보기: 경북(SIDO_47)을 고르면 강조 면은 경북 하나(전에는 「경상」 앞 두 글자 비교라 경남도 같이 켜졌다).
 * - S1 경계 미리보기: 나라 단위(KR)는 강조 0 · 전국 1급 면이 다 그려진다.
 * - S2 칸 지도: 목 /cells 는 계약대로 503 → 「자료 준비 중」(「연결 끊김」 아님). 칸 지도 그림(바다·땅·원)은 단위 시험 ui/cell-dots.test.ts 가 잰다.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("S1 경계 미리보기: 경북을 고르면 경북 하나만 강조", async ({ page }) => {
  await page.goto("/ko/analysis/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const prev = root.locator("[data-prev]");
  await expect(prev.locator("path[data-rg]").first()).toBeAttached({ timeout: 15000 });
  expect(await prev.locator("path[data-rg]").count()).toBeGreaterThanOrEqual(17);
  await expect(prev.locator("path[data-on]")).toHaveCount(1);
  await expect(prev.locator("path[data-on] title")).toHaveText("경상북도");
});

test("S1 경계 미리보기: 나라 단위(KR)는 강조 없음", async ({ page }) => {
  await page.goto("/ko/analysis/?aoi=KR&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const prev = root.locator("[data-prev]");
  await expect(prev.locator("path[data-rg]").first()).toBeAttached({ timeout: 15000 });
  await expect(prev.locator("path[data-on]")).toHaveCount(0);
});

test("S2 칸 지도: 목 503 은 「자료 준비 중」", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-step", "2");
  const panel = root.locator("section", { has: page.getByRole("heading", { name: /칸 지도/ }) });
  await expect(panel).toContainText("자료 준비 중", { timeout: 15000 });
  await expect(panel).not.toContainText("연결 끊김");
});
