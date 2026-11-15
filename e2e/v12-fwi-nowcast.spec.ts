import { expect, test, type Page } from "@playwright/test";

/**
 * v1.2 새 층(결정 F15) — 산불 기상 위험도 FWI 머리줄 칸 · 확산 nowcast 지도 층(경보·출동 · 상황판). MSW 빌드(public/data/snap/v12 = release v1.2 에서 자른 값).
 * 잰다:
 *  - 기관 역할 · 한국: 머리줄 위험 칸 = 실제 FWI(상대 등급 「평년보다 낮음」 · 「11.11 기준」) — 예전 목 「위험 지수」 값이 아니다
 *  - 아르헨티나: 같은 칸이 「평년」(ADM0_ARG 파일 값) · 그 밖 나라(스페인): FWI 칸 없음(release 배수 칸)
 *  - 경보·출동 지도: nowcast 범례(「11월 13일 감지 → 11월 14일」 · 후보 칸 수 = 한국 경계 안 73칸) · 레이어 메뉴로 끄면 범례가 사라진다
 *  - 상황판 지도: 아르헨티나 9,945칸 · 스페인 「이 지역 자료 없음」 한 줄(가짜 칸 없음)
 *  - 페이지 오류 0
 */
const login = (r: string) => {
  localStorage.setItem("em.lang", "ko");
  sessionStorage.setItem("em.role", r);
};
function watchErrors(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
}

test.describe("v1.2 FWI · 확산 nowcast", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "web", "넓은 화면 한 벌로 잰다(폰 머리줄은 같은 칸을 줄여 그림)");
  });

  test("한국 · 기관 역할: 머리줄 위험 칸 = 실제 FWI 상대 등급 + 기준 날짜", async ({ page }) => {
    const errs = watchErrors(page);
    await page.addInitScript(login, "responder");
    await page.goto("/ko/ops/");
    const chip = page.locator('#topbar [data-sc="risk"]');
    await expect(chip).toHaveAttribute("data-fwi", "below_normal", { timeout: 30000 });
    await expect(chip).toContainText("산불 기상 위험도");
    await expect(chip).toContainText("평년보다 낮음");
    await expect(chip.locator("[data-fwi-asof]")).toHaveText("11.11 기준");
    await expect(chip).toHaveAttribute("title", /캐나다 FWI\) 2\.1 · 평년 대비 평년보다 낮음 · 절대 등급 낮음 · 11\.11 기준/);
    expect(errs).toEqual([]);
  });

  test("아르헨티나는 「평년」, 스페인은 FWI 칸 없음", async ({ page }) => {
    const errs = watchErrors(page);
    await page.addInitScript(login, "responder");
    await page.goto("/ko/home/?c=ARG");
    const chip = page.locator('#topbar [data-sc="risk"]');
    await expect(chip).toHaveAttribute("data-fwi", "normal", { timeout: 30000 });
    await expect(chip).toContainText("평년");
    await page.goto("/ko/home/?c=ESP");
    await expect(page.locator('#topbar [data-sc="risk"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#topbar [data-fwi]")).toHaveCount(0);
    expect(errs).toEqual([]);
  });

  test("경보·출동 지도: nowcast 범례 · 기준일 → 목표일 · 레이어로 끄고 켜기", async ({ page }) => {
    test.setTimeout(120000);
    const errs = watchErrors(page);
    await page.addInitScript(login, "responder");
    await page.goto("/ko/ops/");
    const map = page.locator('[data-testid="ops-map"][data-ready="1"]');
    await expect(map).toBeVisible({ timeout: 90000 });
    const lg = map.locator("[data-nowcast-legend]");
    await expect(lg).toHaveAttribute("data-state", "ok", { timeout: 30000 });
    await expect(lg.locator("[data-nowcast-dates]")).toHaveText("11월 13일 감지 → 11월 14일");
    await expect(lg.locator("[data-nowcast-n]")).toHaveAttribute("data-nowcast-n", "73");
    await expect(lg.locator("[data-nowcast-notice]")).toContainText("물리 시뮬레이션이 아니며");
    await map.locator('[data-mt="layers"]').click();
    const box = map.locator('input[data-k="nowcast"]');
    await expect(box).toBeChecked();
    await box.uncheck();
    await expect(lg).toHaveCount(0);
    await box.check();
    await expect(map.locator("[data-nowcast-legend]")).toHaveAttribute("data-state", "ok");
    expect(errs).toEqual([]);
  });

  test("상황판 지도: 아르헨티나 칸 수 · 스페인 「이 지역 자료 없음」", async ({ page }) => {
    test.setTimeout(120000);
    const errs = watchErrors(page);
    await page.addInitScript(login, "responder");
    await page.goto("/ko/home/?c=ARG");
    const map = page.locator('[data-testid="home-map"][data-ready="1"]');
    await expect(map).toBeVisible({ timeout: 90000 });
    const lg = map.locator("[data-nowcast-legend]");
    await expect(lg).toHaveAttribute("data-state", "ok", { timeout: 30000 });
    await expect(lg.locator("[data-nowcast-n]")).toHaveAttribute("data-nowcast-n", "9945");
    await page.goto("/ko/home/?c=ESP");
    const lg2 = page.locator('[data-testid="home-map"] [data-nowcast-legend]');
    await expect(lg2).toHaveAttribute("data-state", "none", { timeout: 30000 });
    await expect(lg2.locator("[data-nowcast-none]")).toHaveText("이 지역 자료 없음");
    await expect(lg2.locator("[data-nowcast-n]")).toHaveCount(0);
    expect(errs).toEqual([]);
  });
});
