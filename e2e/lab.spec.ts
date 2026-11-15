import { expect, test } from "@playwright/test";

/**
 * 예측 분석(lab) 시험(팀 시험 서버 전용, MSW) — 모델팀 「다음 달 발생 확률」(F15, release data-v1.2-2026-11-15).
 * 숫자는 MSW 스냅숏(scripts/snap-occurrence.py 가 release 파일에서 자른 것)에서 잰 값:
 *  - 한국 시군구 252 · 산업 열원 의심 4(남구·포항시남구·제주시·함안군) · 예년보다 높음 7곳 · 대상 달 2026-12 · 자료 기준 2026-11-14
 *  - 경북(SIDO_47) 시군구 23 · 1위 김천시 16%
 *  - 아르헨티나 격자 1,087칸 · 지속 열원 7칸 · 최고 칸 100%(0.99579 → 「>99%」)
 *  - 바레인(ADM0_BHR) 칸 중심이 경계 안인 칸 0 → 「이 지역 자료 없음」
 *  - 검증: 시군구 모델 PR-AUC 0.422 / 기준선 0.404 (aoi_occurrence_meta.json)
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    sessionStorage.setItem("em.role", "scientist");
  });
});

test("예측 분석(한국): 시군구 252 확률·산업 열원 회색·고르기·검증·한계", async ({ page }) => {
  await page.goto("/ko/lab/?view=occ");
  const root = page.locator('[data-testid="lab"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  await expect(root.locator('[data-cnt="tot"]')).toContainText("252");
  await expect(root.locator('[data-cnt="higher"]')).toContainText("7");
  const rows = root.locator("[data-ft] tbody tr");
  await expect(rows).toHaveCount(252);
  /* 산업 열원 의심 4곳은 정렬과 상관없이 맨 아래 */
  await expect(root.locator('[data-ft] tbody tr[data-grey="1"]')).toHaveCount(4);
  await expect(rows.last()).toHaveAttribute("data-grey", "1");
  await expect(rows.first()).not.toHaveAttribute("data-grey", "1");
  /* 「예년보다 높음」 거르기 */
  await root.locator('[data-cnt="higher"]').click();
  await expect(rows).toHaveCount(7);
  await root.locator('[data-cnt="higher"]').click();
  await expect(rows).toHaveCount(252);
  /* 지도: 시군구 면이 붙고 칸이 다 뜬 뒤 읽기 줄 */
  await expect(root.locator('[data-testid="lab-map"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  await root.locator('[data-ft] tbody tr[data-r="SGG_47111"]').dispatchEvent("click");
  await expect(root.locator('[data-testid="lab-map"] [data-mread]')).toContainText("포항시남구");
  await expect(root.locator('[data-sum="sel"] [data-grey]')).toBeVisible();
  /* 검증 표(release meta 값) · 한계 한 줄 */
  await expect(root.locator('[data-vt] tr[data-g="KR_SGG"]')).toContainText("0.422");
  await expect(root.locator('[data-vt] tr[data-g="KR_SGG"]')).toContainText("0.404");
  await expect(root.locator('[data-vt] tr[data-g="ALL"]')).toBeVisible();
  await expect(root.locator("[data-limit]")).toContainText("날씨 예보가 아닙니다");
});

test("예측 분석(한국): 시도를 고르면 그 시도의 시군구 · 격자 요약", async ({ page }) => {
  await page.goto("/ko/lab/?view=occ&aoi=SIDO_47");
  const root = page.locator('[data-testid="lab"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  const rows = root.locator("[data-ft] tbody tr");
  await expect(rows).toHaveCount(23);
  await expect(rows.first()).toContainText("김천시");
  await expect(rows.first()).toContainText("16%");
  await expect(root.locator('[data-sum="area"]')).toBeVisible();
  await page.goto("/ko/lab/?view=occ&aoi=SGG_47150");
  await expect(root.locator('[data-ft] tbody tr[data-r="SGG_47150"]')).toHaveClass(/on/);
  await expect(root.locator('[data-sum="sel"]')).toContainText("김천시");
});

test("예측 분석(아르헨티나): 0.5° 격자 요약·상위 칸·칸 고르기", async ({ page }) => {
  await page.goto("/ko/lab/?view=occ&c=ARG");
  const root = page.locator('[data-testid="lab"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator('[data-cnt="tot"]')).toContainText("1,087");
  await expect(root.locator('[data-cnt="ps"]')).toContainText("7");
  const rows = root.locator("[data-ft] tbody tr");
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText(">99%");
  await expect(root.locator('[data-vt] tr[data-g="ARG"]')).toBeVisible();
  await expect(root.locator('[data-testid="lab-map"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  await rows.first().dispatchEvent("click");
  await expect(root.locator('[data-testid="lab-map"] [data-mread]')).toContainText(">99%");
});

test("예측 분석: 칸이 없는 나라는 「이 지역 자료 없음」 한 줄(가짜 값 없음)", async ({ page }) => {
  await page.goto("/ko/lab/?view=occ&c=BHR");
  const root = page.locator('[data-testid="lab"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator("[data-nodata]")).toHaveCount(1);
  await expect(root.locator("[data-nodata]")).toHaveText("이 지역 자료 없음");
  await expect(root.locator("[data-ft]")).toHaveCount(0);
});

test("예측 분석(영어): 문구가 영어 사전에서", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "en"));
  await page.goto("/en/lab/?view=occ");
  const root = page.locator('[data-testid="lab"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  await expect(root.locator("h1")).toHaveText("Forecast");
  await expect(root.locator("[data-limit]")).toContainText("Not a weather forecast");
});
