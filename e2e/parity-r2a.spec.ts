import { expect, test } from "@playwright/test";

/**
 * R2 단위 A(셸·내려받기·알림·토스트·위성 통과 + 공통 지도) 시험(aibox 전용 · MSW 스냅숏 모드).
 * 잰다: 종 미확인 배지(목업 처음 값 긴급대응 2 · 피해 면적 1) · 서랍 행 불 이름 · 모두 읽음 뒤 배지 0 ·
 *       잠긴 화면 목업 문구 + 돌아갈 곳 · 새 역할 탭 반짝 · 계정 창 다음 위성 칸 · 내려받기 토스트(PNG 크기 · CSV n행 + 복사) ·
 *       폰 경보·출동 지도 「다음 위성」 줄.
 */
const role = (r: string | null) => (r ? `localStorage.setItem("em.lang","ko");localStorage.setItem("em.role","${r}")` : `localStorage.setItem("em.lang","ko");localStorage.removeItem("em.role")`);

test("종: 긴급대응 미확인 2(심각 포함) → 서랍 행에 불 이름 → 모두 읽음이면 배지 없음", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "폰 종 위치가 다르다");
  await page.addInitScript(role("responder"));
  await page.goto("/ko/calendar/");
  const bell = page.getByRole("button", { name: /알림 미확인/ });
  await expect(bell).toHaveAttribute("aria-label", "알림 미확인 2건, 심각 포함", { timeout: 20000 });
  await expect(bell).toContainText("2");
  await bell.click();
  await expect(page.locator('[data-alert="A-0413"]')).toContainText("·");
  await page.locator("button[data-all]").click();
  await expect(page.getByRole("button", { name: /알림 미확인/ })).toHaveAttribute("aria-label", "알림 미확인 0건");
});

test("종: 피해 면적 담당은 처음 미확인 1(A-0405)", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "폰 종 위치가 다르다");
  await page.addInitScript(role("land"));
  await page.goto("/ko/calendar/");
  await expect(page.getByRole("button", { name: /알림 미확인/ })).toHaveAttribute("aria-label", "알림 미확인 1건", { timeout: 20000 });
});

test("잠긴 화면: 역할 전용 문구 + [{역할}로 로그인] + 돌아갈 곳(캘린더)", async ({ page }) => {
  await page.addInitScript(role(null));
  await page.goto("/ko/lab/");
  const locked = page.locator('[data-slot="locked"]');
  await expect(locked.locator("h2")).toHaveText("예측 분석 화면은 과학자 역할 전용");
  await expect(locked.locator("[data-login]")).toHaveText("과학자로 로그인");
  await expect(locked.locator('[data-back="calendar"]')).toBeVisible();
});

test("새 역할 탭 반짝: 로그인하면 역할 탭에 data-fresh(목업 .ttab.fresh)", async ({ page }, info) => {
  test.skip(info.project.name !== "web", "로그인 단추는 웹 머리줄에만 있다");
  await page.addInitScript(() => {
    if (sessionStorage.getItem("r2a.once")) return;
    sessionStorage.setItem("r2a.once", "1");
    localStorage.setItem("em.lang", "ko");
    localStorage.removeItem("em.role");
  });
  await page.goto("/ko/calendar/");
  await page.locator("#loginBtn").click();
  await page.getByRole("button", { name: /과학자/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
  await expect(page.locator('#topbar nav a[data-tab="lab"][data-fresh]')).toHaveCount(1);
  await expect(page.locator("#topbar nav a[data-fresh]")).toHaveCount(0, { timeout: 5000 });
});

test("계정 창: 다음 위성 칸(머리줄과 같은 값)", async ({ page }) => {
  await page.addInitScript(role("commander"));
  await page.goto("/ko/calendar/");
  await page.locator("#who").click();
  await expect(page.getByRole("dialog").locator("[data-who-pass]")).toHaveText(/^(Terra|Aqua|S-NPP|NOAA-20|NOAA-21) \d\d:\d\d$/, { timeout: 20000 });
});

test("내려받기 토스트: 캘린더 PNG = 「… 저장」 + 「W × H PNG」", async ({ page }) => {
  /* PR #15 뒤 캘린더 첫 화면이 전 세계 재생이라(PNG 단추 없음) 지역 캘린더로 연다 — main 6879732 에서도 실패하던 것 */
  await page.goto("/ko/calendar/?aoi=KR&mode=cal");
  const btn = page.locator("button[data-png]").first();
  await expect(btn).toBeEnabled({ timeout: 30000 });
  await btn.click();
  const t = page.locator("[data-sonner-toast]").filter({ hasText: "저장" });
  await expect(t).toBeVisible({ timeout: 15000 });
  await expect(t).toContainText(/\d+ × \d+ PNG/);
});

test("내려받기 토스트: 상황판 캘린더 CSV = 「n행」 + [복사]", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "폰 내려받기 메뉴 위치가 다르다");
  await page.addInitScript(role("responder"));
  await page.goto("/ko/home/");
  await expect(page.locator('[data-testid="home"]')).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /내려받기/ }).first().click();
  const item = page.getByRole("menuitem").nth(1);
  await expect(item).toBeEnabled({ timeout: 30000 });
  await item.click();
  const t = page.locator("[data-sonner-toast]").filter({ hasText: ".csv 저장" });
  await expect(t).toBeVisible({ timeout: 15000 });
  await expect(t).toContainText(/\d+행/);
  await expect(t.getByRole("button", { name: "복사" })).toBeVisible();
});

test("폰 경보·출동 지도: 「다음 위성」 줄", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "폰 전용 줄");
  await page.addInitScript(role("responder"));
  await page.goto("/ko/ops/");
  await expect(page.locator("[data-passln]").first()).toContainText(/다음 위성\s*\S+ \d\d:\d\d/, { timeout: 30000 });
});
