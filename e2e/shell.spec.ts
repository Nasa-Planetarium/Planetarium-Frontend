import { expect, test } from "@playwright/test";

/**
 * 셸 골격 시험(aibox 전용). 정적 내보내기 out/ 을 서빙해 연다.
 * 잰다: 8개 경로 제목 · 로그인 전 탭(공개 3, 결정 F12) · 역할·상황판 잠금 · 예시 로그인 → 상황판 + 역할 탭 · 로그아웃 → 캘린더
 *       · 머리줄 넘침 단계(탭 수가 바뀌어도 가로 넘침 0) · 언어 전환 · 나라 고르기(경계 지연 로드) · MSW 가 스냅숏 값을 계약 모양으로 응답.
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
    const locked = ["home", "ops", "land", "cmd", "lab"].includes(p);
    if (locked) await expect(page.locator('[data-slot="locked"]')).toBeVisible();
    else await expect(page.locator("h1")).toBeVisible();
  }
});

test("로그인 전 탭 = 캘린더·비교 분석·방법·검증 3개, 예시 로그인하면 상황판 + 역할 탭이 더해진다(F12)", async ({ page }, info) => {
  test.skip(info.project.name !== "web", "로그인 단추는 웹 머리줄에만 있다(목업 규칙)");
  await page.goto("/ko/calendar/");
  const tabs = page.locator("#topbar nav a[data-tab]");
  await expect(tabs).toHaveCount(3);
  expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("data-tab")))).toEqual(["calendar", "analysis", "method"]);
  await page.locator("#loginBtn").click();
  await page.getByRole("button", { name: /과학자/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/ko\/lab\/$/);
  await expect(tabs).toHaveCount(5);
  expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("data-tab")))).toEqual(["calendar", "analysis", "method", "home", "lab"]);
  await expect(page.locator("h1")).toHaveText("예측 분석");
});

test("상황판을 로그인 전 직접 열면 잠긴 화면 → 그 자리에서 로그인하면 상황판이 열린다(F12)", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    localStorage.removeItem("em.role");
  });
  await page.goto("/ko/home/");
  const locked = page.locator('[data-slot="locked"]');
  await expect(locked).toBeVisible();
  await expect(locked.locator("h2")).toHaveText("상황판 화면은 예시 로그인 뒤에 열립니다");
  await expect(page.locator('[data-testid="home"]')).toHaveCount(0);
  await expect(page.locator('#topbar nav a[data-tab="home"]')).toHaveCount(0);
  await locked.getByRole("button", { name: "로그인" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/ko\/home\/$/);
  await expect(page.locator('[data-testid="home"]')).toBeVisible({ timeout: 30000 });
  await expect(locked).toHaveCount(0);
  await expect(page.locator('#topbar nav a[data-tab="home"]')).toHaveCount(1);
});

test("로그아웃하면 캘린더로 가고 탭은 공개 3개로 돌아간다(F12)", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("f12.once")) return;
    sessionStorage.setItem("f12.once", "1");
    localStorage.setItem("em.lang", "ko");
    localStorage.setItem("em.role", "commander");
  });
  await page.goto("/ko/home/");
  const tabs = page.locator("#topbar nav a[data-tab]");
  await expect(tabs).toHaveCount(5);
  await page.locator("#who").click();
  await page.getByRole("dialog").getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/ko\/calendar\/$/);
  await expect(tabs).toHaveCount(3);
  await expect(page.locator('#topbar nav a[data-tab="home"]')).toHaveCount(0);
});

test("머리줄: 탭 3개(로그인 전)·5개(로그인 뒤) 모두 가로 넘침 0, 넘침 단계 값을 남긴다", async ({ page }, info) => {
  const probe = async () =>
    page.evaluate(() => {
      const top = document.getElementById("topbar") as HTMLElement;
      return {
        tabs: top.querySelectorAll("nav a[data-tab]").length,
        tf: Number(top.dataset.tf),
        over: top.scrollWidth - top.clientWidth,
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // 폰 두 줄: 탭 띠(nav)가 상황 구역 아래 줄에 있나
        navBelow: (top.querySelector("nav") as HTMLElement).getBoundingClientRect().top >= (top.querySelector("[role=group]") as HTMLElement).getBoundingClientRect().bottom - 1,
      };
    });
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    if (!sessionStorage.getItem("f12.role")) localStorage.removeItem("em.role");
  });
  await page.goto("/ko/calendar/");
  await expect(page.locator("#topbar nav a[data-tab]")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const pub = await probe();
  await page.evaluate(() => {
    sessionStorage.setItem("f12.role", "1");
    localStorage.setItem("em.role", "scientist");
  });
  await page.goto("/ko/lab/");
  await expect(page.locator("#topbar nav a[data-tab]")).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const signed = await probe();
  info.annotations.push({ type: "fit", description: JSON.stringify({ project: info.project.name, pub, signed }) });
  console.log(`F12-FIT ${info.project.name} ${JSON.stringify({ pub, signed })}`);
  expect(pub.over).toBeLessThanOrEqual(0);
  expect(signed.over).toBeLessThanOrEqual(0);
  expect(pub.doc).toBeLessThanOrEqual(0);
  expect(signed.doc).toBeLessThanOrEqual(0);
  expect(pub.navBelow).toBe(info.project.name === "phone");
  expect(signed.navBelow).toBe(info.project.name === "phone");
  // 탭이 줄었으니 넘침 단계가 늘어나면 안 된다
  expect(pub.tf).toBeLessThanOrEqual(signed.tf);
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
  // controller 만 보면 MSW 처리기가 붙기 전에 fetch 가 정적 서버로 새어 HTML 이 온다(첫 실행에서 1/1 재현).
  // 앱이 MSW 시작을 끝냈다고 단 표시(data-boot.tsx)를 기다린다 — 시간 초과를 삼키지 않는다.
  await expect(page.locator("html")).toHaveAttribute("data-data", "ready", { timeout: 15000 });
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
