import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

/**
 * 지역·나라 고르기 창에서 다른 나라를 실제로 고를 수 있는가(사용자 보고 2026-11-15 「나라 고르려는데 안 되네」).
 * 원인이었던 것: 창(.cpick)이 가림막(.cpick-scrim, z 95) 형제로 그려지는데 창에 z-index 가 없어 가림막 아래에 깔렸다
 *   → 웹은 행을 누르면 가림막이 받아 창이 닫히고(고름 없음), 폰은 아래 시트 규칙(.cpick-scrim.is-sheet .cpick)이 맞지 않아 시트가 화면 밖에 그려졌다.
 * 잰다: 웹 = 마우스 클릭, 폰(390 · 344) = 터치 탭으로 행을 눌러 창이 닫히고 주소 c·화면 data-aoi 가 그 나라로 바뀐다.
 * click/tap 은 Playwright 행동 검사(다른 요소가 가로채면 실패)를 거치므로 창이 가림막 아래로 가면 이 시험이 깨진다.
 */
const SURF = [
  { name: "캘린더", path: "/ko/calendar/", root: '[data-testid="calendar"]', btn: '[data-testid="calendar"] button[aria-haspopup="dialog"]', role: null },
  { name: "비교 분석", path: "/ko/analysis/", root: '[data-testid="analysis"]', btn: "[data-aoimore]", role: null },
  { name: "상황판", path: "/ko/home/", root: '[data-testid="home"]', btn: "[data-aoi-pick]", role: "responder" },
  { name: "지휘 통계", path: "/ko/cmd/", root: '[data-testid="cmd"]', btn: "[data-aoi-pick]", role: "commander" },
] as const;

const press = async (l: Locator, info: TestInfo) => (info.project.name === "phone" ? l.tap() : l.click());

async function openPicker(page: Page, s: (typeof SURF)[number], info: TestInfo) {
  await page.addInitScript((role) => {
    localStorage.setItem("em.lang", "ko");
    if (role) localStorage.setItem("em.role", role);
    else localStorage.removeItem("em.role");
  }, s.role);
  await page.goto(s.path);
  const btn = page.locator(s.btn).first();
  await expect(btn).toBeEnabled({ timeout: 30000 });
  await press(btn, info);
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  return dlg;
}

async function expectInViewport(page: Page, l: Locator) {
  const b = await l.boundingBox();
  const vp = page.viewportSize();
  expect(b && vp).toBeTruthy();
  if (!b || !vp) return;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1);
}

function cases(label: string) {
  for (const s of SURF) {
    test(`${label}${s.name}: 지역 고르기 창에서 몽골을 고르면 몽골로 바뀐다`, async ({ page }, info) => {
      const dlg = await openPicker(page, s, info);
      /* 폰은 아래 시트 — 창 전체가 화면 안 */
      await expectInViewport(page, dlg);
      /* 상황판·지휘 통계는 지금 나라(한국) 안에서 열린다 — 위 단으로 올라가 나라 목록 */
      const row = dlg.locator('[role="option"][data-a="ADM0_MNG"]').first();
      for (let k = 0; k < 3 && !(await row.count()); k++) await press(dlg.getByRole("button", { name: "위 단으로" }), info);
      await press(row, info);
      /* 아래 단이 있는 나라면 「나라 전체」 행을 한 번 더 */
      if (await dlg.isVisible()) await press(dlg.locator('[role="option"][data-a="ADM0_MNG"]').first(), info);
      await expect(dlg).toBeHidden();
      await expect(page).toHaveURL(/[?&]c=MNG/);
      await expect(page.locator(s.root).first()).toHaveAttribute("data-aoi", "ADM0_MNG", { timeout: 20000 });
      await expect(page.locator("#ctryBtn")).toHaveAttribute("title", "몽골");
    });
  }

  test(`${label}상황판: 아래 단으로 들어가면 「○○ 전체」 행이 목록 맨 위에 보인다`, async ({ page }, info) => {
    /* 실서버에서 잰 것: 몽골(1급 22)로 들어가면 앞 목록 스크롤(248px)이 남아 「몽골 전체」가 목록 위로 가려졌다. 스냅숏(MSW)에는 외국 1급이 없어 한국 시도 → 경북(시군구 22)으로 같은 모양을 잰다 */
    const dlg = await openPicker(page, SURF[2], info);
    const row = dlg.locator('[role="option"][data-a="SIDO_47"]').first();
    /* 목록을 내려 둔 채(사용자가 쓸어내린 것처럼) 들어간다 */
    await row.evaluate((e) => {
      const l = e.closest('[role="listbox"]') as HTMLElement;
      l.scrollTop = l.scrollHeight;
    });
    await press(row, info);
    const whole = dlg.locator('[role="option"][data-a="SIDO_47"]').first();
    await expect(whole).toContainText("전체");
    const lb = await dlg.getByRole("listbox").boundingBox();
    const wb = await whole.boundingBox();
    expect(lb && wb ? wb.y - lb.y : -1).toBeGreaterThanOrEqual(-1);
    await press(whole, info);
    await expect(dlg).toBeHidden();
    await expect(page.locator(SURF[2].root).first()).toHaveAttribute("data-aoi", "SIDO_47", { timeout: 20000 });
  });

  test(`${label}머리줄 나라 칩: 목록에서 미국을 고르면 미국으로 바뀐다`, async ({ page }, info) => {
    await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
    await page.goto("/ko/calendar/");
    await expect(page.locator('[data-testid="calendar"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
    await press(page.locator("#ctryBtn"), info);
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible();
    await expectInViewport(page, dlg);
    const row = dlg.locator('[role="option"]').filter({ has: page.locator("span", { hasText: /^USA$/ }) }).first();
    await press(row, info);
    await expect(dlg).toBeHidden();
    await expect(page).toHaveURL(/[?&]c=USA/);
    await expect(page.locator("#ctryBtn")).toHaveAttribute("title", "미국");
  });
}

cases("");

/* 사용자 화면 폭(344×740, 터치) — 폰 프로젝트에서만 */
test.describe("폰 폭 344", () => {
  test.skip(({ isMobile, hasTouch }) => !hasTouch && !isMobile, "폰 프로젝트에서만");
  test.use({ viewport: { width: 344, height: 740 } });
  cases("344 · ");
});
