import { expect, test } from "@playwright/test";

/**
 * 방법·검증(method) 시험(팀 시험 서버 전용) — MSW 스냅숏(release m2v_meta · korea.json)이 화면에 붙는지 잰다.
 * 잰다: 머리 개수 4칸(기간 4 · 검증 범위 11 · NRT 3 · 결측 1) · 절 6개(v1.2 변경점 더함) · 검증 표 채택 모델 MAE 42.1 · v1.1 진행 중인 달 102.3 · 주소 ?sec= 유지.
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
  await expect(root.locator("[data-sec]").filter({ hasText: /./ })).toHaveCount(6);
  await root.locator('button[data-sec="validation"]').click();
  await expect(page).toHaveURL(/sec=validation/);
  await expect(root.locator("table").first()).toContainText("42.1");
  await root.locator('button[data-sec="v11"]').click();
  await expect(root).toContainText("102.3");
  await expect(root).toContainText("2026-11-13");
});

/* 데스크톱 한 화면(사용자 요청: 방법·검증은 스크롤 없이 한눈에) — 절 다섯 개 모두 본문 스크롤 0 · 가로 넘침 0. 긴 원문은 눌러 펼친다 */
for (const [w, h] of [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`방법·검증: ${w}×${h} 에서 절마다 세로 스크롤 없음`, async ({ page }, info) => {
    test.skip(info.project.name !== "web", "데스크톱만 — 태블릿·폰은 쌓기(스크롤 허용)");
    await page.setViewportSize({ width: w, height: h });
    for (const s of ["method", "v11", "v12", "validation", "status", "sources"]) {
      await page.goto(`/ko/method/?sec=${s}`);
      await expect(page.locator('[data-testid="method"][data-ready="1"]')).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const se = document.scrollingElement as Element;
        const over = [...document.querySelectorAll("*")].filter((el) => {
          const cs = getComputedStyle(el);
          return (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 200) || (/(auto|scroll)/.test(cs.overflowX) && el.closest('[data-testid="method"]') && el.scrollWidth > el.clientWidth + 1);
        }).length;
        return { doc: se.scrollHeight - innerHeight, over };
      });
      expect(r, `${s} ${w}×${h}`).toEqual({ doc: 0, over: 0 });
    }
    await page.goto("/ko/method/");
    const clip = page.locator('[data-testid="method"] button[aria-expanded]').first();
    await expect(clip).toHaveAttribute("aria-expanded", "false");
    await clip.click();
    await expect(clip).toHaveAttribute("aria-expanded", "true");
  });
}
