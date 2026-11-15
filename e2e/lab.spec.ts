import { expect, test } from "@playwright/test";

/**
 * 예측 분석(lab) 시험(aibox 전용) — 과학자 역할로 열어 전망 스냅숏(outlook.json)이 화면에 붙는지 잰다.
 * 잰다: 전국 예측 82.1 · 시도 표 17행(2026-11-15 전 지역 — 경북 북부 11 시군 고정 제거) · 행을 누르면 지도 읽기 띠 · 보정 검증 표 채택 모델 42.1 · 지도 칸
 *       · ?aoi=SIDO_47 이면 경상북도 17.8 · 시군구 23행.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    sessionStorage.setItem("em.role", "scientist");
  });
});

test("예측 분석: 권역 예측·시군 표·고르기·보정 검증", async ({ page }) => {
  await page.goto("/ko/lab/");
  const root = page.locator('[data-testid="lab"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  await expect(root.locator('[data-cnt="tot"]')).toContainText("82.1");
  const rows = root.locator("[data-ft] tbody tr");
  await expect(rows).toHaveCount(17);
  await expect(root.locator("[data-aoi-pick]")).toContainText("대한민국");
  // 지도 칸이 다 뜬 뒤(불러오는 중 덮개 MapLoading 도 aria-live 라 그 전에는 읽기 줄이 둘로 잡힌다)
  await expect(root.locator('[data-testid="lab-map"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  /* 17행이면 표가 스크롤되어 첫 행이 고정 머리 밑에 걸린다 — 행 누름 이벤트만 보낸다(동작 같음) */
  await rows.first().dispatchEvent("click");
  await expect(rows.first()).toHaveAttribute("data-r", /.+/);
  await expect(root.locator('[data-testid="lab-map"] [aria-live="polite"]:not([data-map-loading])')).toContainText("80%");
  await expect(root.locator("table").filter({ hasText: "m2v_xgb" })).toContainText("42.1");
});

test("예측 분석: 시도를 고르면 그 시도의 시군구 전부", async ({ page }) => {
  await page.goto("/ko/lab/?aoi=SIDO_47");
  const root = page.locator('[data-testid="lab"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  await expect(root.locator('[data-cnt="tot"]')).toContainText("17.8");
  await expect(root.locator("[data-ft] tbody tr")).toHaveCount(23);
  await page.goto("/ko/lab/?aoi=SGG_47170");
  await expect(root.locator("[data-ft] tbody tr")).toHaveCount(23);
  await expect(root.locator('[data-ft] tbody tr[data-r="SGG_47170"]')).toHaveClass(/on/);
});
