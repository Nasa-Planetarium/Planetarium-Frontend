import { expect, test } from "@playwright/test";

/**
 * v1.2 불 유형 배지 · 불 세기 FRP · 위성 일별 상태 · 방법 v1.2 변경점(aibox 전용, MSW 스냅숏 = release data-v1.2-2026-11-15 에서 자른 public/data/snap/v12).
 * 기대값은 스냅숏(= release 파일 값)을 읽어 적었다 — scripts/build-v12-frs-snapshot.py:
 *   SIDO_47 2025-03: large_fire · 사건 141 · 큰 사건 8 · share_large 0.75937 · FRP(S-NPP) Σ 15,537.65 MW · 칸 최대 233.99 · 39칸 · 점 2,253
 *   2026-10 S-NPP: low 2026-10-12 · 10-13 (나머지 ok) — satellite_day_status
 *   방법: FRP 환산 비율 Aqua 낮 1.141 · Terra 밤 2.406, 산업 열원 제거 KR 2012-02 이후 22.7%
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("캘린더 상세: 불 유형 배지 · FRP 요약 · 위성 일별 상태(release 값)", async ({ page }) => {
  await page.goto("/ko/calendar/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="calendar"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const rf = root.locator('[data-testid="cal-regime-frp"][data-ready="1"]');
  await expect(rf).toBeVisible({ timeout: 20000 });
  await expect(rf).toHaveAttribute("data-regime", "large_fire");
  await expect(rf).toContainText("큰 불 위주");
  await expect(rf).toContainText("141");
  await expect(rf).toContainText("76%");
  await expect(rf.locator("[data-frp]")).toContainText("15,538");
  await expect(rf.locator("[data-frp]")).toContainText("234");
  await expect(rf.locator("[data-frp]")).toContainText("2,253");
  const sd = root.locator('[data-testid="cal-sat-days"][data-ready="1"]');
  await expect(sd).toBeVisible();
  await expect(sd.locator('[data-sat="S-NPP"]')).toContainText("정상 31");
});

test("캘린더 상세: 위성 일별 상태 — ok 아닌 날(2026-10 S-NPP 낮음 2일)", async ({ page }) => {
  await page.goto("/ko/calendar/?aoi=KR&ym=2026-10");
  const sd = page.locator('[data-testid="cal-sat-days"][data-ready="1"]');
  await expect(sd).toBeVisible({ timeout: 30000 });
  const snpp = sd.locator('[data-sat="S-NPP"]');
  await expect(snpp).toContainText("낮음 2");
  await expect(snpp).toContainText("10/12 · 10/13");
});

test("자료 없는 지역: 「이 지역 자료 없음」 한 줄(가짜 값 없음)", async ({ page }) => {
  await page.goto("/ko/calendar/?c=USA&mode=cal"); // 첫 화면이 전 세계 재생(PR #15) — 지역 캘린더로
  const root = page.locator('[data-testid="calendar"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const rf = root.locator('[data-testid="cal-regime-frp"][data-ready="1"]');
  await expect(rf).toBeVisible({ timeout: 20000 });
  await expect(rf.locator('[data-coverage="none"]').first()).toHaveText("이 지역 자료 없음");
  await expect(rf.locator("[data-regime]")).toHaveCount(0);
});

test("분석 2단계: 불 유형 · 불 세기 판(같은 release 값)", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2025-03");
  const rf = page.locator('[data-testid="an-regime-frp"][data-ready="1"]');
  await expect(rf).toBeVisible({ timeout: 30000 });
  await expect(rf).toHaveAttribute("data-regime", "large_fire");
  await expect(rf.locator("[data-frp]")).toContainText("15,538");
});

test("방법·검증: v1.2 변경점(FireBridge 이름·성능·FRP 비율·산업 열원) · 자료 상태 위성 5개", async ({ page }) => {
  await page.goto("/ko/method/?sec=v12");
  const root = page.locator('[data-testid="method"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 20000 });
  const names = root.locator('[data-testid="method-v12-names"]');
  await expect(names).toContainText("FireBridge (MODIS-to-VIIRS Harmonizer)");
  await expect(names).toContainText("m2v_xgb");
  await expect(names.locator("[data-perf]")).toHaveText("총량 오차 1~2%, 월별 상관 0.97");
  const frp = root.locator('[data-testid="method-v12-frp"]');
  await expect(frp.locator('[data-sat="Aqua"]')).toContainText("1.141");
  await expect(frp.locator('[data-sat="Terra"]')).toContainText("2.406");
  await expect(root.locator('[data-testid="method-v12-static"] [data-aoi="KR"]')).toContainText("22.7%");
  await root.locator('button[data-sec="method"]').click();
  await expect(root.locator('[data-model="m2v_xgb"]').first()).toContainText("FireBridge");
  await root.locator('button[data-sec="status"]').click();
  const sat = root.locator('[data-testid="method-sat"]');
  await expect(sat.locator("tr[data-sat]")).toHaveCount(5);
  await expect(sat.locator('tr[data-sat="S-NPP"] [data-span]')).toHaveAttribute("data-span", "2012-01-20/2026-11-02");
});
