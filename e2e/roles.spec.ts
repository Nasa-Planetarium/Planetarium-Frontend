import { expect, test, type Page } from "@playwright/test";

/**
 * 역할 화면 통합 시험(aibox 전용) — land·ops·cmd 세 화면을 정본 main 에서 함께 연다.
 * 잰다: 예시 로그인(역할 고르기) → 그 역할 탭 하나가 더해지고 첫 화면으로 간다 → 화면 뿌리가 그려진다 · 페이지 오류 0.
 * 폰 머리줄에는 로그인 단추가 없으므로(목업 규칙) 폰은 고른 역할(localStorage em.role)로 열어 탭·화면만 잰다.
 */
const CASES = [
  { role: "responder", label: /조기경보·긴급대응/, screen: "ops", root: '[data-testid="ops"]' },
  { role: "firefighter", label: /소방 현장지휘/, screen: "ops", root: '[data-testid="ops"]' },
  { role: "land", label: /토지 관리/, screen: "land", root: '[data-testid="land"]' },
  { role: "commander", label: /지휘자/, screen: "cmd", root: '[data-testid="cmd"][data-ready="1"]' },
] as const;

function watchErrors(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
}

for (const c of CASES) {
  test(`예시 로그인 ${c.role} → ${c.screen} 탭이 열리고 화면이 그려진다`, async ({ page }, info) => {
    test.skip(info.project.name !== "web", "로그인 단추는 웹 머리줄에만 있다(목업 규칙)");
    const errs = watchErrors(page);
    await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
    await page.goto("/ko/calendar/");
    const tabs = page.locator("#topbar nav a[data-tab]");
    await expect(tabs).toHaveCount(4);
    await expect(page.locator(`#topbar nav a[data-tab="${c.screen}"]`)).toHaveCount(0);
    await page.locator("#loginBtn").click();
    await page.getByRole("button", { name: c.label }).click();
    await page.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(new RegExp(`/ko/${c.screen}/$`));
    await expect(tabs).toHaveCount(5);
    await expect(page.locator(`#topbar nav a[data-tab="${c.screen}"]`)).toHaveCount(1);
    await expect(page.locator(c.root)).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-slot="locked"]')).toHaveCount(0);
    // 다른 화면으로 갔다가 역할 탭을 눌러 돌아온다
    await page.locator('#topbar nav a[data-tab="calendar"]').click();
    await expect(page).toHaveURL(/\/ko\/calendar\//);
    await page.locator(`#topbar nav a[data-tab="${c.screen}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/ko/${c.screen}/`));
    await expect(page.locator(c.root)).toBeVisible({ timeout: 20000 });
    expect(errs).toEqual([]);
  });
}

for (const c of CASES) {
  test(`역할 ${c.role} 로 ${c.screen} 를 열면 잠기지 않고 화면이 그려진다(폰 포함)`, async ({ page }) => {
    const errs = watchErrors(page);
    await page.addInitScript((role) => {
      localStorage.setItem("em.lang", "ko");
      localStorage.setItem("em.role", role);
    }, c.role);
    await page.goto(`/ko/${c.screen}/`);
    await expect(page.locator(c.root)).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-slot="locked"]')).toHaveCount(0);
    expect(errs).toEqual([]);
  });
}

test("다른 역할로는 세 화면이 잠겨 있다", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    localStorage.setItem("em.role", "scientist");
  });
  for (const s of ["ops", "land", "cmd"]) {
    await page.goto(`/ko/${s}/`);
    await expect(page.locator('[data-slot="locked"]')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.locator(`[data-testid="${s}"]`)).toHaveCount(0);
    await expect(page.locator('[data-slot="locked"]')).toBeVisible();
  }
});
