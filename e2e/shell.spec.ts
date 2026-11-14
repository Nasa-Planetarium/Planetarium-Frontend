import { expect, test } from "@playwright/test";

/**
 * 셸 골격 시험(aibox 전용). 정적 내보내기 out/ 을 서빙해 연다.
 * 잰다: 8개 경로 제목 · 로그인 전 탭 · 역할 잠금 · 예시 로그인 → 역할 탭 · 언어 전환 · 나라 고르기(경계 지연 로드) · MSW 가 스냅숏 값을 계약 모양으로 응답.
 */
const PAGES = ["calendar", "analysis", "method", "home", "ops", "land", "cmd", "lab"] as const;

test("루트 / 는 /<언어>/calendar/ 로 간다", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/ko\/calendar\/$/);
});

test("8개 경로가 열리고 제목(h1) 또는 잠긴 화면이 보인다", async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(`/ko/${p}/`);
    const locked = ["ops", "land", "cmd", "lab"].includes(p);
    if (locked) await expect(page.locator('[data-slot="locked"]')).toBeVisible();
    else await expect(page.locator("h1")).toBeVisible();
  }
});

test("로그인 전 탭 = 캘린더·비교 분석·방법·검증·상황판, 예시 로그인하면 역할 탭이 더해진다", async ({ page }, info) => {
  test.skip(info.project.name !== "web", "로그인 단추는 웹 머리줄에만 있다(목업 규칙)");
  await page.goto("/ko/calendar/");
  const tabs = page.locator("#topbar nav a[data-tab]");
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toHaveAttribute("data-tab", "calendar");
  await page.locator("#loginBtn").click();
  await page.getByRole("button", { name: /과학자/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/ko\/lab\/$/);
  await expect(tabs).toHaveCount(5);
  await expect(page.locator("h1")).toHaveText("예측 분석");
});

test("언어 전환은 같은 경로·쿼리의 다른 접두사로 간다", async ({ page }, info) => {
  test.skip(info.project.name !== "web", "언어 단추는 웹에만");
  await page.goto("/ko/method/?c=BRA");
  await page.locator("#topbar button[lang=en]").click();
  await expect(page).toHaveURL(/\/en\/method\/\?c=BRA$/);
});

test("나라 고르기: 검색 → 고르면 주소 ?c= 가 바뀌고 그 나라 경계 하나만 받는다", async ({ page }) => {
  const geo: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/geo/c/")) geo.push(new URL(r.url()).pathname);
  });
  await page.goto("/ko/calendar/");
  await page.locator("#ctryBtn").click();
  await page.getByRole("searchbox").fill("BRA");
  await page.getByRole("option", { name: /BRA/ }).first().click();
  await expect(page).toHaveURL(/c=BRA/);
  expect(geo).toEqual(["/geo/c/BRA.json"]);
});

test("MSW: 계약 경로가 release 스냅숏 값을 그대로 응답한다(결측 달 = null, 0 아님)", async ({ page }) => {
  await page.goto("/ko/calendar/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(async () => {
    const res = await fetch("/api/v1/aois/KR/calendar?start_year=2001&end_year=2001");
    const j = await res.json();
    const jun = j.months.find((m: { month: number }) => m.month === 6);
    return { status: res.status, mv: res.headers.get("X-Method-Version"), n: j.months.length, jun };
  });
  expect(r.status).toBe(200);
  expect(r.mv).toBe("v1-m2v-2026-11-14");
  expect(r.n).toBe(12);
  expect(r.jun.status).toBe("missing");
  expect(r.jun.value).toBeNull();
});
