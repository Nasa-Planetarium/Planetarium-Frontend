import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 공통 지도(widgets/map-canvas) 시험 — 시험대 /ko/map-lab/(MSW 스냅숏 모드). 작업 단위 W1.
 * 잰다: 바탕 층 묶음(지형 음영 층은 DEM 목록이 있을 때만 · 하천·도로·경계·가림·열 지도·화소·그린 영역·초안 층 id)
 *       · 사각형 끌어 그리기 → 그린 영역이 남고 bbox 결과 · 다각형 4점 + 두 번 누르기 → polygon 결과(꼭짓점 4개)
 *       · Esc 로 그리기 취소 · 좌표 창 범위 오류 문구 → 바른 값이면 point 결과 · 레이어 창 Esc 로 닫힘
 *       · 화면 밖 안내 칩 · 지도 PNG · 다른 나라(ESP)에서도 그리기 단추가 켜져 있음 · 가로 넘침 없음.
 *
 * 한 시험에 다 몰아 두면 GPU 없는 CI 러너(소프트웨어 WebGL)에서 끌기 한 걸음마다 지도를 통째로 다시 그리느라
 * 30초 한도를 넘었다(GitHub run 43673310169 — 같은 시험이 팀 시험 서버 `taskset -c 0` 에서 1.1분). 그래서 기능마다 나눈다.
 * 카메라가 움직인 뒤(전체 보기·영역 맞춤·끌기)에는 지도 움직임 신호 data-moving="0" 을 기다린 뒤 다음 단추를 누른다.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

const open = async (page: Page) => {
  await page.goto("/ko/map-lab/");
  const map = page.locator('[data-testid="map-lab"][data-ready="1"]');
  await expect(map).toBeVisible({ timeout: 30000 });
  await settled(map);
  return map;
};
/** 지도 카메라가 멈췄다(data-moving="0" — 전체 보기·영역 맞춤·끌기가 끝남) */
const settled = (map: Locator) => expect(map).toHaveAttribute("data-moving", "0", { timeout: 20000 });
const aoiOf = async (page: Page) => JSON.parse((await page.locator('[data-testid="map-lab"]').getAttribute("data-aoi")) || "null") as { type: string; pts?: unknown[] } | null;
const center = async (map: Locator) => {
  const box = (await map.boundingBox())!;
  return { box, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
};
const webOnly = (name: string) => test.skip(name !== "web", "끌기·두 번 누르기·지도 창은 넓은 칸에서만");
/** 끌기가 많은 시험의 한도: 끌기 한 걸음 = 지도 한 번 다시 그리기. 소프트웨어 WebGL 1코어(팀 시험 서버 taskset -c 0)에서 23–31초 걸렸다(5회) → 60초 */
const DRAG_BUDGET = 60_000;
/** 좌표·반경 창으로 반경 영역을 정한다(끌기 없이 그린 영역 만들기) */
const applyPoint = async (map: Locator, lat: string, lon: string, r: string) => {
  await map.locator('[data-mt="pt"]').click();
  const form = map.locator('[data-pop="pt"]');
  await expect(form).toBeVisible();
  await form.locator("#mcLat").fill(lat);
  await form.locator("#mcLon").fill(lon);
  await form.locator("#mcRad").fill(r);
  await form.getByRole("button", { name: "영역 적용" }).click();
  return form;
};

test("바탕 층 묶음 · 출처 줄", async ({ page }) => {
  const map = await open(page);
  const ids = ((await map.getAttribute("data-layers")) ?? "").split(",");
  for (const id of ["bg", "land-world", "land", "world-mask", "mask", "reg-hi", "rivers", "roads", "reg-line", "reg-hi-line", "burn-fill", "heat", "hotdot", "hotpx", "hotpx-modis", "aoi-fill", "aoi-line", "route-glow", "route-dash", "draft-fill", "draft-line", "draft-pt"]) expect(ids).toContain(id);
  // 음영 층은 DEM 목록(W0 public/dem/manifest.json)이 있을 때만 — 없으면 출처 줄이 지형을 적지 않는다(틀린 출처 고침)
  const demOn = (await map.getAttribute("data-dem")) === "1";
  await expect.poll(async () => ((await map.getAttribute("data-layers")) ?? "").split(",").includes("hs")).toBe(demOn);
  const attr = await map.locator("[data-attrib]").textContent();
  if (!demOn) expect(attr ?? "").not.toMatch(/Copernicus/);
});

test("사각형 · 다각형 그리기 · Esc 로 그리기 취소", async ({ page }, info) => {
  webOnly(info.project.name);
  test.setTimeout(DRAG_BUDGET);
  const map = await open(page);
  const { cx, cy } = await center(map);
  // 사각형
  await map.locator('[data-mt="bbox"]').click();
  await expect(map).toHaveAttribute("data-draw", "bbox");
  await page.mouse.move(cx - 120, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 3 });
  await page.mouse.move(cx + 100, cy + 70, { steps: 3 });
  await page.mouse.up();
  await expect(map).toHaveAttribute("data-draw", "");
  expect((await aoiOf(page))?.type).toBe("bbox");
  await expect(page.locator("[data-aoi-type=bbox]")).toBeVisible();
  await settled(map);

  // 다각형: 네 점 + 마지막 점에서 두 번 누르기
  await map.locator('[data-mt="polygon"]').click();
  await expect(map).toHaveAttribute("data-draw", "polygon");
  await page.mouse.click(cx - 100, cy - 60);
  await page.mouse.click(cx + 90, cy - 70);
  await page.mouse.click(cx + 110, cy + 60);
  await page.mouse.dblclick(cx - 80, cy + 80);
  await expect(map).toHaveAttribute("data-draw", "");
  const poly = await aoiOf(page);
  expect(poly?.type).toBe("polygon");
  expect(poly?.pts?.length).toBe(4); // 세 점 + 두 번 누른 자리 하나(같은 자리 두 점은 하나로 합친다)
  const pts = poly!.pts as [number, number][];
  pts.forEach((q, i) => i && expect(q).not.toEqual(pts[i - 1]));
  await settled(map);

  // Esc 로 그리기 취소(그린 영역은 그대로)
  await map.locator('[data-mt="polygon"]').click();
  await page.mouse.click(cx, cy);
  await page.keyboard.press("Escape");
  await expect(map).toHaveAttribute("data-draw", "");
  expect((await aoiOf(page))?.type).toBe("polygon");
});

test("좌표·반경 창 오류 문구 → 반경 영역 · 레이어 창 Esc 로 닫힘", async ({ page }, info) => {
  webOnly(info.project.name);
  const map = await open(page);
  // 범위 밖 → 오류 문구, 바른 값 → 반경 영역
  const form = await applyPoint(map, "95", "128.7", "12");
  await expect(form.locator("[data-pterr]")).toContainText("위도는");
  await form.locator("#mcLat").fill("36.4");
  await form.locator("#mcRad").fill("80");
  await form.getByRole("button", { name: "영역 적용" }).click();
  await expect(form.locator("[data-pterr]")).toContainText("반경은");
  await form.locator("#mcRad").fill("12");
  await form.getByRole("button", { name: "영역 적용" }).click();
  await expect(form).toHaveCount(0);
  expect((await aoiOf(page))?.type).toBe("point");

  // 영역에 맞춰 카메라가 옮겨 간다 — 멈춘 뒤 레이어 창(Esc 로 닫힌다)
  await settled(map);
  await map.locator('[data-mt="layers"]').click();
  await expect(map.locator('[data-pop="layers"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(map.locator('[data-pop="layers"]')).toHaveCount(0);
});

test("화면 밖 안내: 그린 영역이 화면 밖으로 나가면 칩 → 「영역으로 이동」 누르면 사라진다", async ({ page }, info) => {
  webOnly(info.project.name);
  test.setTimeout(DRAG_BUDGET);
  const map = await open(page);
  await applyPoint(map, "36.4", "128.7", "12");
  await expect(map.locator('[data-pop="pt"]')).toHaveCount(0);
  await settled(map);
  await expect(map.locator("[data-offv]")).toHaveCount(0);
  const { cx, cy } = await center(map);
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(cx - 550, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 550, cy, { steps: 3 });
    await page.mouse.up();
    await settled(map);
  }
  await expect(map.locator("[data-offv]")).toBeVisible();
  await map.locator("[data-offv] button").click();
  await expect(map.locator("[data-offv]")).toHaveCount(0, { timeout: 5000 });
});

test("지도 PNG: 제목 띠(44px) 붙인 스냅숏이 내려받힌다", async ({ page }, info) => {
  webOnly(info.project.name);
  const map = await open(page);
  const { box } = await center(map);
  const dl = page.waitForEvent("download");
  await page.locator("[data-png]").click();
  const file = await (await dl).path();
  const buf = (await import("node:fs")).readFileSync(file!);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  const h = buf.readUInt32BE(20);
  expect(h).toBeGreaterThan(box.height); // 지도 높이 + 제목 띠
});

test("다른 나라(ESP)에서도 그리기 단추가 켜져 있다 · 가로 넘침 없음", async ({ page }, info) => {
  webOnly(info.project.name);
  const map = await open(page);
  await page.locator("[data-preset=ESP]").click();
  await expect(map.locator('[data-mt="bbox"]')).toBeEnabled();
  await expect(map.locator('[data-mt="polygon"]')).toBeEnabled();

  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
