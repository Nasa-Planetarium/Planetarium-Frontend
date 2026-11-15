import { expect, test } from "@playwright/test";

/**
 * 상황판(home) 시험(팀 시험 서버 전용 · MSW 스냅숏 모드). 상황판은 예시 로그인 뒤에만 열리므로(결정 F12) responder 로 로그인한 상태로 연다.
 * 잰다: 머리(제목·개수 띠 3칸·역할 화면 4칸) · 감지 목록 경보 5건(원장 목) · 관측 활동 캘린더(실제 API 2001–2026 칸 300개 넘음)
 *       · 칸을 누르면 달 상세가 그 달로 · 원자료 VIIRS 보기 2012 이전 = 운용 전 칸 · 점(/hotspots)은 스냅숏에 없어 「자료 준비 중」 · 가로 넘침 없음.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    sessionStorage.setItem("em.role", "responder");
  });
});

test("상황판: 머리·감지 목록·캘린더·달 상세", async ({ page }, info) => {
  await page.goto("/ko/home/");
  const root = page.locator('[data-testid="home"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator("h1")).toHaveText("상황판");
  await expect(root.locator("[data-cnt]")).toHaveCount(3);
  await expect(root.locator("[data-scr] [class*=hm-scr-i]")).toHaveCount(4);
  await expect(root.locator("[data-alert]")).toHaveCount(5);
  const cal = root.locator('[data-testid="home-cal"] svg');
  await expect(cal).toBeVisible();
  expect(await root.locator('[data-testid="home-cal"] rect[data-y]').count()).toBeGreaterThan(300);
  await expect(root.locator('[data-testid="home-month"]')).toHaveAttribute("data-ym", "2025-03");
  if (info.project.name === "web") {
    await root.locator('[data-testid="home-cal"] rect[data-y="2022"][data-m="3"]').click();
    await expect(root.locator('[data-testid="home-month"]')).toHaveAttribute("data-ym", "2022-03");
    await root.getByRole("tab", { name: "원자료 VIIRS" }).click();
    await expect(root.locator('[data-testid="home-cal"] rect[data-y="2005"][data-m="3"]')).toHaveAttribute("aria-label", /운용 전/);
  }
  await expect(root.locator("[data-hcount]")).toHaveText("자료 준비 중");
  /* 전 지역(2026-11-15): 기본 지역 = 대한민국(KR), 경북 북부 11개 시군 고정 목록 없음 */
  await expect(root).toHaveAttribute("data-aoi", "KR");
  await expect(root.locator("[data-aoi-pick]")).toContainText("대한민국");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test("상황판: 지역 고르기 — 시도·시군구로 내려가면 실제 값 AOI 가 바뀐다", async ({ page }) => {
  await page.goto("/ko/home/?aoi=SIDO_11");
  const root = page.locator('[data-testid="home"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-aoi", "SIDO_11");
  await expect(root.locator("[data-aoi-pick]")).toContainText("서울특별시");
  await root.locator("[data-aoi-pick]").click();
  const dlg = page.getByRole("dialog", { name: "지역 고르기" });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('[data-a="SIDO_11"]')).toBeVisible();
  await dlg.locator('[role="option"][data-a^="SGG_11"]').first().click();
  await expect(page.locator('[data-testid="home"]')).toHaveAttribute("data-aoi", /^SGG_11/);
});
