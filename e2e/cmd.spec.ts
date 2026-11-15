import { expect, test } from "@playwright/test";

/**
 * 지휘 통계(cmd) 시험(aibox 전용). 지휘자 역할로 열어 목 어댑터(getCommandStats 묶음)가 화면에 붙는지 잰다.
 * 잰다: 개수 띠 4칸 · 대응 성과(출동 4건 · 자원 9대 — 목) · 연도 슬라이더 2001–2026 · 지표 바꾸면 눌림 상태 · 이상 달 표 · 한국 밖은 감지 묶음 칸
 *       · 위성 통계 = 실제 자료 전 지역(2026-11-15): 기본 범위 KR · 지역 목록 17 시도 · ?aoi=SIDO_47 이면 23 시군구 · 점(/hotspots)은 스냅숏에 없어 시간대 칸이 상태 문구.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    sessionStorage.setItem("em.role", "commander");
  });
});

test("지휘 통계: 머리·대응 성과·연도 막대·이상 달 표", async ({ page }) => {
  await page.goto("/ko/cmd/");
  const root = page.locator('[data-testid="cmd"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  await expect(root.locator("h1")).toHaveText("지휘 통계");
  await expect(root.locator("[data-cnt]")).toHaveCount(4);
  await expect(root.locator('[data-cnt="ev"]')).toContainText("6");
  await expect(root.locator('[data-scroll="resp"]')).toContainText("4");
  await expect(root.locator('[data-scroll="resp"]')).toContainText("9");
  await expect(root.locator('[data-scroll="time"] input[type="range"]')).toHaveAttribute("max", "2026");
  const viirs = root.getByRole("group", { name: "지표" }).getByRole("button").nth(3);
  await viirs.click();
  await expect(viirs).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator("table").first()).toBeVisible();
  await expect(root).toHaveAttribute("data-aoi", "KR");
  await expect(root.locator("[data-hourly]")).toBeVisible();
});

test("지휘 통계: 지역 범위 = 실제 AOI 아래 단 전부", async ({ page }, info) => {
  await page.goto("/ko/cmd/?aoi=SIDO_47");
  const root = page.locator('[data-testid="cmd"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-aoi", "SIDO_47");
  await expect(root.locator("[data-aoi-pick]")).toContainText("경상북도");
  if (info.project.name === "web") {
    await root.locator("[class*=cm-rgbtn]").click();
    await expect(root.locator('[class*="cm-opt"]')).toHaveCount(24);
  }
});

test("한국 밖: 감지 묶음 칸과 「–」 개수", async ({ page }) => {
  await page.goto("/ko/cmd/?c=USA");
  const root = page.locator('[data-testid="cmd"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator('[data-cnt="det"]')).toContainText("–");
  await expect(root.locator('[data-scroll="resp"] [role="status"]')).toBeVisible();
});
