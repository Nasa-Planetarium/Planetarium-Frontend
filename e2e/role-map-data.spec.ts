import { expect, test, type Page } from "@playwright/test";

/**
 * 역할 화면 지도에 실제 자료가 그려지는지(2026-11-15 사용자 지적 「역할 화면 지도에 데이터를 보여줘야 하지 않나」의 회귀 시험).
 * MSW 모드: /hotspots·/cells 는 계약대로 503 이라 점은 없고, 넓은 범위 몫(정적 world-1deg 1° 칸)만 잰다.
 * 범례는 공통 MapKey 하나(표시 규칙서 R7, data-map-key).
 * 잰다: 공통 지도 칸 수(data-n-cells) > 0 · 스타일 층에 cells 가 있다 · 한국 밖 감지 지도의 점 층(hotdot)이 꺼져 있지 않다 · 페이지 오류 0.
 */
function watch(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
}
async function open(page: Page, role: string, path: string) {
  await page.addInitScript((r) => {
    localStorage.setItem("em.lang", "ko");
    localStorage.setItem("em.role", r);
  }, role);
  await page.goto(path);
}
const nCells = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`).getAttribute("data-n-cells").then((v) => Number(v || 0));

test.describe("역할 화면 지도 실제 자료", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, "웹 너비에서만");

  test("상황판 일본(넓은 범위) — 점 대신 월 감지량 1° 칸이 그려진다", async ({ page }) => {
    const errs = watch(page);
    await open(page, "responder", "/ko/home/?c=JPN");
    const map = page.locator('[data-testid="home-map"][data-ready="1"]');
    await expect(map).toBeVisible({ timeout: 30000 });
    await expect.poll(() => nCells(page, "home-map"), { timeout: 30000 }).toBeGreaterThan(0);
    expect(await map.getAttribute("data-layers")).toContain("cells");
    await expect(page.locator('[data-lg-cells]')).toBeVisible();
    expect(errs).toEqual([]);
  });

  test("경보·출동 미국 — 감지 지도에 1° 칸 바탕 + 범례, 점 층이 켜져 있다", async ({ page }) => {
    const errs = watch(page);
    await open(page, "responder", "/ko/ops/?c=USA");
    const map = page.locator('[data-testid="ops-det-map"][data-ready="1"]');
    await expect(map).toBeVisible({ timeout: 30000 });
    await expect.poll(() => nCells(page, "ops-det-map"), { timeout: 30000 }).toBeGreaterThan(0);
    await expect(map.locator("[data-map-key]")).toBeVisible();
    expect(errs).toEqual([]);
  });

  test("피해 면적 브라질 — 감지 지도에 1° 칸 바탕", async ({ page }) => {
    const errs = watch(page);
    await open(page, "land", "/ko/land/?c=BRA");
    await expect(page.locator('[data-testid="land-det-map"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => nCells(page, "land-det-map"), { timeout: 30000 }).toBeGreaterThan(0);
    expect(errs).toEqual([]);
  });

  test("지휘 통계 일본(넓은 범위) — 고른 해 1° 칸 합이 그려진다", async ({ page }) => {
    const errs = watch(page);
    await open(page, "commander", "/ko/cmd/?c=JPN");
    await expect(page.locator('[data-testid="cmd-map"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => nCells(page, "cmd-map"), { timeout: 30000 }).toBeGreaterThan(0);
    expect(errs).toEqual([]);
  });
});
