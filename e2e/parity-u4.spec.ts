import { expect, test } from "@playwright/test";

/**
 * 화면들이 공통 지도(widgets/map-canvas)로 옮겨 왔는지(작업 단위 u4 — 사용자 지적 ①「지도가 실제 느낌이 없다」 · ③「사각형·다각형 관심범위가 어디 갔나」).
 * 잰다: 상황판·경보·출동·피해 면적·지휘 통계·예측 분석 지도가 공통 지도 바탕 층(하천·도로·경계·가림)을 가진다
 *       · 상황판에서 사각형·다각형을 그리면 도형이 남고(data-aoi) 관심 영역 배지(종류·집계 지역·해제 ×)가 뜨며, ×로 풀린다
 *       · 상황판 내려받기 메뉴에 지도 PNG 가 있다.
 */
const SCREENS = [
  { screen: "home", role: "responder", map: "home-map" },
  { screen: "ops", role: "responder", map: "ops-map" },
  { screen: "land", role: "land", map: "land-map" },
  { screen: "cmd", role: "commander", map: "cmd-map" },
  { screen: "lab", role: "scientist", map: "lab-map" },
];

for (const c of SCREENS) {
  test(`${c.screen}: 공통 지도 바탕 층`, async ({ page }) => {
    await page.addInitScript((role) => {
      localStorage.setItem("em.lang", "ko");
      localStorage.setItem("em.role", role);
    }, c.role);
    await page.goto(`/ko/${c.screen}/`);
    const map = page.locator(`[data-testid="${c.map}"][data-ready="1"]`);
    await expect(map).toBeVisible({ timeout: 30000 });
    const ids = ((await map.getAttribute("data-layers")) ?? "").split(",");
    for (const id of ["world-mask", "mask", "rivers", "roads", "reg-line", "reg-hi-line"]) expect(ids).toContain(id);
  });
}

test("상황판: 사각형·다각형 관심 영역 → 배지 · 해제 · 지도 PNG 메뉴", async ({ page }, info) => {
  test.skip(info.project.name !== "web", "끌기·두 번 누르기는 넓은 칸에서만");
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    localStorage.setItem("em.role", "responder");
  });
  await page.goto("/ko/home/");
  await expect(page.locator('[data-testid="home"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  const map = page.locator('[data-testid="home-map"][data-ready="1"]');
  await expect(map).toBeVisible({ timeout: 30000 });
  await expect(map.locator("[data-pass]")).toBeVisible(); // 오늘 위성 통과 띠(목업 renderTodayPass)
  const box = (await map.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await map.locator('[data-mt="bbox"]').click();
  await expect(map).toHaveAttribute("data-draw", "bbox");
  await page.mouse.move(cx - 140, cy - 90);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 5 });
  await page.mouse.move(cx + 120, cy + 80, { steps: 5 });
  await page.mouse.up();
  await expect(map).toHaveAttribute("data-draw", "");
  const badge = map.locator("[data-aoibadge]");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("data-aoi-type", "bbox");
  await expect(badge).toContainText("사각형 영역");
  await expect(badge).toContainText(/집계 (시군|지역)/);

  await map.locator('[data-mt="polygon"]').click();
  await page.mouse.click(cx - 100, cy - 60);
  await page.mouse.click(cx + 90, cy - 70);
  await page.mouse.click(cx + 110, cy + 60);
  await page.mouse.dblclick(cx - 80, cy + 80);
  await expect(map).toHaveAttribute("data-draw", "");
  await expect(badge).toHaveAttribute("data-aoi-type", "polygon");
  await expect(badge).toContainText("다각형 영역");
  expect(JSON.parse((await map.getAttribute("data-aoi")) || "null")?.type).toBe("polygon");

  await badge.locator("[data-clear]").click();
  await expect(map.locator("[data-aoibadge]")).toHaveCount(0);
  await expect(map).toHaveAttribute("data-aoi", "");

  await page.locator("[data-dl]").click();
  await expect(page.locator('[role="menu"] [data-k="map"]')).toBeVisible();
});

test("상황판 → 비교 분석: 지역·달을 넘기고 「홈에서 가져온 조건」을 보인다", async ({ page }, info) => {
  test.skip(info.project.name !== "web", "폰은 감지 목록 바닥 시트 — 같은 단추는 웹에서 잰다");
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    localStorage.setItem("em.role", "responder");
  });
  await page.goto("/ko/home/");
  await expect(page.locator('[data-testid="home"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  await page.locator("[data-analyze]").click();
  await expect(page).toHaveURL(/\/ko\/analysis\/\?from=home&aoi=KR&ym=\d{4}-\d{2}/);
  const ho = page.locator("[data-handoff]");
  await expect(ho).toContainText("홈에서 가져온 조건");
  await ho.locator("[data-hox]").click();
  await expect(page.locator("[data-handoff]")).toHaveCount(0);
});
