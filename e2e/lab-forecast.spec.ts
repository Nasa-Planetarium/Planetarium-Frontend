import { expect, test, type Page } from "@playwright/test";

/**
 * 예측 분석(lab) 기본 보기 — FireOutlook Planner 30일 전망(F17, POST /api/v1/forecast) 시험(팀 시험 서버 전용, MSW).
 * 기대값 = public/data/snap/forecast.json(scripts/snap-forecast.py 가 모델팀 함수 planetarium.forecast.forecast 를 직접 불러 담은 응답, today 2026-11-15)에서 옮긴 값:
 *  - SIDO_51 강원: p_any 0.619 · expected_count 1.37 (0.0–3.02) · skill high · count_skill none · value_source model_calibrated · as_of 2026-11-14 · daily 30(lead 1~7 = 7개)
 *  - SGG_47730 의성군: value_source baseline · p_any 0.0283
 *  - ADM1_ARG-1299 코르도바: p_any 1.0 → display_hint 「거의 확실히 탐지됨 — 예상 건수를 보세요」 · expected_count 188.61 (35.15–800.27)
 *  - SGG_31140 울산 남구: suspected_industrial_sgg 에 자기 자신 → 회색 · SIDO_31 울산: 산업 의심 SGG_31140 · 지속 열원 2칸
 *  - 사각형 [128.6, 37.2, 129.4, 37.9]: p_any 0.0769 · 다각형(경북 북부 5점): p_any 0.6706
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    sessionStorage.setItem("em.role", "scientist");
  });
});

const ready = (page: Page) => page.locator('[data-testid="lab-fc"][data-ready="1"]');
const NOTICE = "위성 탐지 기반 확률이며 산불 발생을 보장하지 않습니다";

test("30일 전망(한국 기본 강원 SIDO_51): 머리·확률·skill·건수·30일 띠·구역·필수 문구", async ({ page }) => {
  await page.goto("/ko/lab/");
  const root = ready(page);
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-region", "SIDO_51");
  await expect(root.locator("h1")).toHaveText("예측 분석");
  await expect(root.locator("[data-fc-title]")).toHaveText("FireOutlook 30일 전망 · 관측 기준 11-14");
  await expect(root.locator("[data-scope]")).toContainText("11.15 – 12.14");
  await expect(root).toHaveAttribute("data-mode", "model");
  await expect(root.locator('[data-big="model"] [data-p]')).toHaveText("61.9%");
  await expect(root.locator("[data-skill]")).toHaveText("예측력 높음");
  await expect(root.locator("[data-count]")).toHaveText("1.37");
  await expect(root.locator("[data-sum]")).toContainText("(구간 0–3.02)");
  await expect(root.locator("[data-count-skill]")).toHaveText("건수 예측력 없음");
  await expect(root.locator("[data-fire-days]")).toHaveText("0.94일");
  await expect(root.locator("[data-notice]")).toContainText(NOTICE);
  await expect(root.locator("[data-unit]")).toContainText("산불 개수나 면적이 아닙니다");
  /* 30일 띠: 막대 30 · 1~7일 모델 예측 7 · 8일~ 평년 패턴 기반 23 */
  await expect(root.locator("[data-day]")).toHaveCount(30);
  await expect(root.locator('[data-days] tr[data-kind="model"]')).toHaveCount(7);
  await expect(root.locator('[data-days] tr[data-kind="pattern"]')).toHaveCount(23);
  await expect(root.locator('[data-zone="model"]')).toHaveText("모델 예측");
  await expect(root.locator('[data-zone="pattern"]')).toHaveText("평년 패턴 기반");
  await expect(root.locator('[data-days] tr[data-d="2026-11-15"]')).toContainText("6.3%");
  await expect(root.locator('[data-days] tr[data-d="2026-11-22"]')).toContainText("평년 패턴 기반");
  await root.locator('[data-day="2026-11-21"]').hover();
  await expect(root.locator("[data-read]")).toContainText("11.21 · 모델 예측 · 탐지 확률 4.4%");
  /* 지도 면이 붙고, 목록으로 다른 시도를 고르면 주소·값이 바뀐다 */
  await expect(root.locator('[data-testid="fc-map"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  await root.locator("[data-fc-select]").selectOption("SIDO_47");
  await expect(page).toHaveURL(/region=SIDO_47/);
  await expect(root.locator('[data-big="model"] [data-p]')).toHaveText("87.8%");
});

test("30일 전망: 시군구 SGG_47730 은 「예년 수준(모델 예측력 낮음)」(value_source baseline)", async ({ page }) => {
  await page.goto("/ko/lab/?region=SGG_47730");
  const root = ready(page);
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-mode", "baseline");
  await expect(root.locator("[data-baseline-label]")).toHaveText("예년 수준(모델 예측력 낮음)");
  await expect(root.locator('[data-big="baseline"] [data-p]')).toHaveText("2.8%");
  await expect(root.locator("[data-skill]")).toHaveCount(0);
  await expect(root.locator("[data-notice]")).toContainText(NOTICE);
});

test("30일 전망(아르헨티나 기본 코르도바): p_any ≥ 0.98 → display_hint + 예상 탐지 수가 주 정보", async ({ page }) => {
  await page.goto("/ko/lab/?c=ARG");
  const root = ready(page);
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-region", "ADM1_ARG-1299");
  await expect(root).toHaveAttribute("data-mode", "hint");
  await expect(root.locator("[data-hint]")).toHaveText("거의 확실히 탐지됨 — 예상 건수를 보세요");
  await expect(root.locator('[data-big="hint"] [data-count]')).toHaveText("188.61");
  await expect(root.locator('[data-big="hint"]')).toContainText("(구간 35.15–800.27)");
  await expect(root.locator('[data-big="hint"] [data-count-skill]')).toHaveText("건수 예측력 낮음");
  await expect(root.locator('[data-big="model"]')).toHaveCount(0);
  await expect(root.locator("[data-notice]")).toContainText(NOTICE);
});

test("30일 전망: 산업 열원 의심 회색(SGG_31140 자기 자신) · 시도 안 의심 시군구·지속 열원 안내(SIDO_31)", async ({ page }) => {
  await page.goto("/ko/lab/?region=SGG_31140");
  const root = ready(page);
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator('[data-sum] [data-grey="1"]')).toBeVisible();
  await expect(root.locator("[data-grey-note]")).toContainText("순위·강조에서 뺐고");
  const c = await root.locator('[data-big] [data-p]').evaluate((e) => getComputedStyle(e).color);
  const n = await root.locator("[data-notice]").evaluate((e) => getComputedStyle(e).color);
  expect(c).not.toBe(n);
  await page.goto("/ko/lab/?region=SIDO_31");
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator('[data-sum] [data-grey="1"]')).toHaveCount(0);
  await expect(root.locator('[data-industrial] [data-sgg="SGG_31140"]')).toBeVisible();
  await expect(root.locator("[data-persistent]")).toContainText("2칸");
});

test("30일 전망: 사각형·다각형(주소) = 스냅숏 실값 · 스냅숏에 없는 영역은 가짜 값 없이 안내", async ({ page }) => {
  await page.goto("/ko/lab/?bbox=128.6,37.2,129.4,37.9");
  const root = ready(page);
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-region", "bbox");
  await expect(root.locator("[data-scope]")).toContainText("그린 사각형");
  await expect(root.locator('[data-big] [data-p]')).toHaveText("7.7%");
  await page.goto("/ko/lab/?poly=128.45,36.25;129.45,36.25;129.45,36.75;128.95,36.85;128.45,36.65");
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator("[data-scope]")).toContainText("꼭짓점 5개");
  await expect(root.locator('[data-big] [data-p]')).toHaveText("67.1%");
  await page.goto("/ko/lab/?bbox=128,37,129,38");
  const fc = page.locator('[data-testid="lab-fc"]');
  await expect(fc.locator('[data-err="data_not_loaded"]')).toBeVisible({ timeout: 30000 });
  await expect(fc.locator("[data-p]")).toHaveCount(0);
});

test("30일 전망 ↔ 다음 달 발생 확률 보기 바꾸기 · 영어 사전", async ({ page }) => {
  await page.goto("/ko/lab/");
  await expect(ready(page)).toBeVisible({ timeout: 30000 });
  await page.locator('[data-view="occ"]').click();
  await expect(page).toHaveURL(/view=occ/);
  await expect(page.locator('[data-testid="lab"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  await page.locator('[data-view="fc"]').click();
  await expect(ready(page)).toBeVisible({ timeout: 30000 });
  await page.addInitScript(() => localStorage.setItem("em.lang", "en"));
  await page.goto("/en/lab/");
  const root = ready(page);
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator("h1")).toHaveText("Forecast");
  await expect(root.locator("[data-fc-title]")).toHaveText("FireOutlook 30-day outlook · observed through 11-14");
  await expect(root.locator("[data-notice]")).toContainText("does not guarantee that a wildfire will occur");
});

test("30일 전망: 공통 지도 그리기 도구 — 사각형·다각형을 그리면 그 영역으로 묻는다(주소 bbox·poly)", async ({ page }, info) => {
  test.skip(info.project.name !== "web", "끌기·여러 번 누르기는 넓은 화면에서만 잰다(map-canvas 시험과 같은 규칙)");
  test.setTimeout(90000);
  await page.goto("/ko/lab/");
  const root = ready(page);
  await expect(root).toBeVisible({ timeout: 30000 });
  const fc = page.locator('[data-testid="lab-fc"]');
  const map = fc.locator('[data-testid="fc-map"]');
  await expect(map).toHaveAttribute("data-ready", "1", { timeout: 30000 });
  const b = (await map.boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await fc.locator('[data-fc-draw="bbox"]').click();
  await expect(map).toHaveAttribute("data-draw", "bbox");
  await page.mouse.move(cx - 120, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 3 });
  await page.mouse.move(cx + 100, cy + 70, { steps: 3 });
  await page.mouse.up();
  await expect(page).toHaveURL(/bbox=/);
  await expect(fc).toHaveAttribute("data-region", "bbox");
  /* MSW 스냅숏에 없는 영역 → 가짜 값 없이 안내 */
  await expect(fc.locator('[data-err="data_not_loaded"]')).toBeVisible({ timeout: 20000 });
  await fc.locator('[data-fc-draw="polygon"]').click();
  await expect(map).toHaveAttribute("data-draw", "polygon");
  await page.mouse.click(cx - 100, cy - 60);
  await page.mouse.click(cx + 90, cy - 70);
  await page.mouse.click(cx + 110, cy + 60);
  await page.mouse.dblclick(cx - 80, cy + 80);
  await expect(page).toHaveURL(/poly=/);
  await expect(fc).toHaveAttribute("data-region", "poly");
  await fc.locator('[data-fc-draw="clear"]').click();
  await expect(ready(page)).toHaveAttribute("data-region", "SIDO_51", { timeout: 20000 });
});
