import { expect, test } from "@playwright/test";

/**
 * 목업 대조 복원(단위 3 — 지도·범위 밖 나머지) 시험.
 * 잰다: 머리줄 자료 판·자료 상태·다음 위성(공개 화면) + 로그인 전 기상 칸 없음 · 비교 분석 S1 경계 미리보기·위성 연대 띠 ·
 * S3 인쇄 문서(DOM) · 피해 면적 감지 옆 위성 통과 · 알림 서랍 「모두 읽음」.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("머리줄: 자료 판·자료 상태·다음 위성, 로그인 전 기상 없음", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "폰 머리줄은 자료 칩을 줄여 뺀다(목업 규칙)");
  await page.goto("/ko/calendar/");
  const bar = page.locator("#topbar");
  await expect(bar.locator('[data-sc="ver"]')).toContainText("자료 판");
  await expect(bar.locator('[data-sc="ver"]')).not.toContainText("–", { timeout: 20000 });
  await expect(bar.locator('[data-sc="st"]')).toHaveAttribute("data-st", /\w+/, { timeout: 20000 });
  await expect(bar.locator('[data-sc="st"]')).toHaveAttribute("href", /\/ko\/method\/\?.*sec=status/);
  await expect(bar.locator('[data-sc="pass"] [data-pass]')).toHaveText(/(Terra|Aqua|S-NPP|NOAA-20|NOAA-21) \d\d:\d\d/, { timeout: 20000 });
  await expect(bar.locator('[data-sc="wx"]')).toHaveCount(0);
});

test("비교 분석 S1: 경계 미리보기(고른 시도 강조) · 위성 연대 띠", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "폰은 미리보기를 접어 둔다");
  await page.goto("/ko/analysis/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const prev = root.locator("[data-prev] [data-map] svg");
  await expect(prev).toBeVisible({ timeout: 20000 });
  expect(await prev.locator("path").count()).toBeGreaterThanOrEqual(17);
  await expect(prev.locator("text", { hasText: "경북" })).toHaveCount(1);
  const eras = root.locator("[data-eras]");
  await expect(eras).toBeVisible();
  await expect(eras).toContainText("S-NPP");
  await expect(eras).toContainText("NOAA-20");
});

test("비교 분석 S3: 인쇄 전용 6절 문서가 DOM 에 있다", async ({ page }) => {
  await page.goto("/ko/analysis/?step=3&aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const doc = root.locator("[data-printdoc]");
  await expect(doc).toHaveCount(1);
  await expect(doc.locator("section h2")).toHaveText(["1. 지역 · 기간", "2. 결과", "3. 방법", "4. 검증 수치", "5. 한계", "6. 출처"]);
  await page.emulateMedia({ media: "print" });
  await expect(doc).toBeVisible();
  await expect(page.locator('[data-slot="shellhead"]')).toBeHidden();
});

test("피해 면적: 감지 시각 옆 직전 위성 통과 · 레이어/PNG 단추", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "폰은 상세 판 구성이 다르다");
  await page.addInitScript(() => localStorage.setItem("em.role", "land"));
  await page.goto("/ko/land/");
  const root = page.locator('[data-testid="land"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator('[data-mt="layers"]')).toBeVisible();
  await expect(root.locator('[data-mt="png"]')).toBeVisible();
  await expect(root.locator("[data-pass]").first()).toContainText(/통과/, { timeout: 20000 });
});

test("알림 서랍: 모두 읽음 단추", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "폰 종 위치가 다르다");
  await page.addInitScript(() => localStorage.setItem("em.role", "responder"));
  await page.goto("/ko/home/");
  await page.getByRole("button", { name: /알림 미확인/ }).click();
  const all = page.locator("button[data-all]");
  await expect(all).toHaveText("모두 읽음");
  await all.click();
  await expect(all).toHaveCount(0);
});
