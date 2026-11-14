import { expect, test } from "@playwright/test";

/**
 * r2-D 경보·출동 복원(목업 ops.js) — 잰다:
 * 접힌 레일 자식(종 · 상태 탭 셋 · 구분 · 열린 경보) · 목록 ↓ 로 다음 경보 고름 + 초점 이동 · 자원 묶음 배지(목업 첫 화면 「2」「3」) ·
 * 확대하면 화면 밖 칩이 생기고 누르면 전체 보기로 사라짐.
 * (지휘 시간대 표 정렬은 실제 자료(http) 빌드에서만 표가 그려져 탐침 r2d-probe 로 잰다.)
 */
const login = (r: string) => {
  localStorage.setItem("em.lang", "ko");
  localStorage.setItem("em.role", r);
};

test("경보·출동: 레일 · 목록 ↓ · 자원 묶음 · 화면 밖 칩", async ({ page }, info) => {
  test.skip(info.project.name !== "web", "넓은 칸 배치");
  test.setTimeout(120000);
  await page.addInitScript(login, "responder");
  await page.goto("/ko/ops/");
  const map = page.locator('[data-testid="ops-map"][data-ready="1"]');
  await expect(map).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-testid="ops-rail"] > *')).not.toHaveCount(0);

  const first = page.locator("[role=listbox] [data-id]").first();
  await first.focus();
  const id0 = await first.getAttribute("data-id");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[role=listbox] [aria-selected=true]")).not.toHaveAttribute("data-id", id0 ?? "");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-id"))).not.toBe(id0);

  await expect(map.locator("[data-cl]")).not.toHaveCount(0);

  for (let i = 0; i < 3; i++) {
    await map.locator("[data-z='1']").click();
    await page.waitForTimeout(400);
  }
  const chips = page.locator('[data-testid="ops-off"] [data-side]');
  await expect(chips.first()).toBeVisible({ timeout: 5000 });
  await chips.first().click();
  await expect(chips).toHaveCount(0, { timeout: 5000 });
});
