import { expect, test, type Page } from "@playwright/test";

/**
 * 화재 사건(F15 fire_events) 시험(팀 시험 서버 전용, MSW 스냅숏 public/data/layers/fire-events.json — release v1.2 에서 자른 것).
 * 기대 수는 release 파일을 pandas 로 따로 센 값(2026-11-15): 경북 2025-03 겹침 141 · 의성군 30 · ADM0_ARG 2025-09 6,967 · KR 2026-11-05..11-11 20 ·
 * KR 2016–2025 연소 면적 1위 KR_20220304_0002(131.8 km²) · ARG 1위 ARG_20170101_0033.
 * 잰다: 캘린더·비교 분석 달 사건 수 · 상황판 기간 사건 수 · 피해 면적 위성 확인 연소 목록·상세 · 자료 없는 나라 「이 지역 자료 없음」 · 페이지 오류 0.
 */
function watch(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
}
async function open(page: Page, path: string, role?: string) {
  await page.addInitScript((r) => {
    localStorage.setItem("em.lang", "ko");
    if (r) localStorage.setItem("em.role", r);
  }, role ?? "");
  await page.goto(path);
}

test("캘린더: 고른 달 사건 수(경북 2025-03) · 자료 없는 나라 한 줄", async ({ page }) => {
  const errs = watch(page);
  await open(page, "/ko/calendar/?aoi=SIDO_47&ym=2025-03");
  const ev = page.locator('[data-testid="cal-events"]');
  await expect(ev).toHaveAttribute("data-state", "ok", { timeout: 30000 });
  await expect(ev).toHaveAttribute("data-n", "141");
  await expect(ev).toContainText("141건");
  await expect(ev.locator("[data-ev]")).toHaveCount(3);
  await open(page, "/ko/calendar/?c=USA&aoi=ADM0_USA&ym=2025-03");
  const na = page.locator('[data-testid="cal-events"]');
  await expect(na).toHaveAttribute("data-state", "na", { timeout: 30000 });
  await expect(na).toContainText("이 지역 자료 없음");
  await expect(na.locator("[data-ev]")).toHaveCount(0);
  expect(errs).toEqual([]);
});

test("캘린더: 아르헨티나 2025-09 사건 수(파일에서 센 달 수)", async ({ page }) => {
  await open(page, "/ko/calendar/?c=ARG&aoi=ADM0_ARG&ym=2025-09");
  const ev = page.locator('[data-testid="cal-events"]');
  await expect(ev).toHaveAttribute("data-n", "6967", { timeout: 30000 });
  await expect(ev).toContainText("6,967건");
});

test("비교 분석: 의성군 2025-03 사건 수", async ({ page }) => {
  const errs = watch(page);
  await open(page, "/ko/analysis/?step=2&aoi=SGG_47730&ym=2025-03");
  const ev = page.locator('[data-testid="an-events"]');
  await expect(ev).toHaveAttribute("data-n", "30", { timeout: 30000 });
  expect(errs).toEqual([]);
});

test("상황판: 기간 안 위성 사건(한국, 시나리오 기간 2026-11-05~11-11)", async ({ page }) => {
  const errs = watch(page);
  await open(page, "/ko/home/", "responder");
  const ev = page.locator('[data-testid="home-events"]');
  await expect(ev).toHaveAttribute("data-state", "ok", { timeout: 30000 });
  await expect(ev).toHaveAttribute("data-n", "20");
  const rows = ev.locator("[data-ev]");
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute("aria-pressed", "true");
  expect(errs).toEqual([]);
});

test("피해 면적(한국): 위성 확인 연소 목록 → 상세(연소 면적 하한, 파일 값)", async ({ page }, info) => {
  const errs = watch(page);
  await open(page, "/ko/land/", "land");
  const ev = page.locator('[data-testid="land-events"]');
  await expect(ev).toHaveAttribute("data-state", "ok", { timeout: 30000 });
  const first = ev.locator('[data-ev="KR_20220304_0002"]');
  await expect(first).toBeVisible();
  await first.click();
  const card = page.locator('[data-testid="fev-card"][data-ev="KR_20220304_0002"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText("131.8");
  await expect(card).toContainText("위성 확인 연소 면적(하한)");
  if (info.project.name === "web") await expect(page.locator('[data-testid="land"]')).toContainText("위성 사건에는 필지 자료가 없습니다");
  expect(errs).toEqual([]);
});

test("피해 면적(한국 밖): 아르헨티나 목록 · 미국 「이 지역 자료 없음」", async ({ page }) => {
  const errs = watch(page);
  await open(page, "/ko/land/?c=ARG", "land");
  const ev = page.locator('[data-testid="land-events"]');
  await expect(ev).toHaveAttribute("data-state", "ok", { timeout: 30000 });
  await expect(ev.locator("[data-ev]").first()).toHaveAttribute("data-ev", "ARG_20170101_0033");
  await open(page, "/ko/land/?c=USA", "land");
  const na = page.locator('[data-testid="land-events"]');
  await expect(na).toHaveAttribute("data-state", "na", { timeout: 30000 });
  await expect(na).toContainText("이 지역 자료 없음");
  expect(errs).toEqual([]);
});
