import { expect, test } from "@playwright/test";

/**
 * R2 단위 C(분석·캘린더·방법·lab) 되살린 기능 — 목업 analysis.js · lab.js 와 같은 동작인지 잰다(MSW 스냅숏).
 * 잰다: S1 전 세계 1° 재생(달 고르기 따라감) · 칸 지도 점 층 단추(목 = 그 달 감지 점) · 1·2단계 인쇄 문서 · 출동 넘김 칩 · em.an.v3 되살리기 · lab 「N개 중 M개 보임」.
 * 안 잰다: 실서버 FIRMS WMS 그림(MSW 에 없음) · 일별 월 추정분 나눔(목 /summary 503) · 방법 월 추정분 합(목 /summary 503).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("분석 S1: 전 세계 1° 월별 재생 — 고른 달로 맞추고 달을 바꾸면 따라간다", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "재생 지도 WebGL 은 web 폭에서만 잰다");
  await page.goto("/ko/analysis/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const wd = root.locator("[data-wd]");
  await expect(wd).toContainText("전 세계 월별 관측 활동");
  await expect(wd.locator("[data-month]")).toHaveAttribute("data-month", "2025-03", { timeout: 20000 });
  await root.locator('button[data-m="4"]').click();
  await expect(wd.locator("[data-month]")).toHaveAttribute("data-month", "2025-04");
});

test("분석 S2: 칸 지도 점 층 단추(목 = 그 달 감지 점)", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const lyr = root.locator("button[data-lyr]");
  await expect(lyr).toHaveAttribute("aria-pressed", "false");
  await expect(lyr).toContainText("감지 점(그 달)");
  await lyr.click();
  await expect(lyr).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator('[data-lyrmeta="month"]')).toBeVisible();
});

test("분석 1·2단계 인쇄: 3단계와 같은 종이 요약", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator("[data-pwrap] [data-printdoc]")).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  await expect(root.locator("[data-printdoc]")).toBeVisible();
  await expect(root.locator("[data-printdoc]")).toContainText("2025-03");
});

test("분석 넘김: 출동에서 온 조건 칩(이름 · 달) · 닫기", async ({ page }) => {
  await page.goto(`/ko/analysis/?from=ops&aoi=SIDO_47&ym=2025-03&label=${encodeURIComponent("안동시 산불")}`);
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const ho = root.locator('[data-handoff="ops"]');
  await expect(ho).toContainText("안동시 산불");
  await expect(ho).toContainText("2025-03");
  await ho.locator("[data-hox]").click();
  await expect(ho).toHaveCount(0);
});

test("분석 상태 em.an.v3: 메뉴로 다시 들어오면 지난 단계·지역·달·보기", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2024-04&view=raw_viirs");
  await expect(page.locator('[data-testid="analysis"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("em.an.v3"))).toContain('"month":4');
  await page.goto("/ko/analysis/");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-step", "2");
  await expect(root).toHaveAttribute("data-ym", "2024-04");
  await expect(root).toHaveAttribute("data-view", "raw_viirs");
});

test("lab: 표가 다 안 보이면 「N개 중 M개 보임」", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "표 칸 높이는 web 폭에서만 잰다");
  await page.addInitScript(() => localStorage.setItem("em.role", "scientist"));
  await page.setViewportSize({ width: 1440, height: 640 });
  await page.goto("/ko/lab/");
  await expect(page.locator('[data-testid="lab"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  const more = page.locator("[data-more]");
  await expect(more).toBeVisible({ timeout: 10000 });
  await expect(more).toContainText("개 보임");
});
