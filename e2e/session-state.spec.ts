import { expect, test, type Page } from "@playwright/test";

/**
 * 같은 브라우저를 여러 사람이 쓸 때 앞사람 상태가 남지 않는다(shared/lib/prefs).
 * 잰다: (a) 사용자 A 가 예시 로그인·나라 일본·비교 분석 조건을 바꾼 뒤, 같은 저장소 상태(storageState: 쿠키·localStorage)를 이어받고
 *           sessionStorage 는 빈 새 컨텍스트(= 새 창·다음 사람)로 열면 로그아웃·대한민국·분석 1단계 기본 — 언어(em.lang)만 남는다.
 *       (b) 같은 탭 새로 고침에는 로그인·나라·분석 조건이 남는다.
 *       (c) 옛 판이 localStorage 에 남긴 em.role·em.country·em.sensor·em.recentCountries·em.an.v3 는 열 때 지워지고 기본 상태.
 * 안 잰다: 실제 브라우저 창 닫기(Playwright 컨텍스트로 갈음) · 폰 폭(로그인 단추가 웹 머리줄에만 있다).
 */
const tabs = (page: Page) => page.locator("#topbar nav a[data-tab]");
const analysis = (page: Page) => page.locator('[data-testid="analysis"][data-ready="1"]');
const LEGACY = ["em.role", "em.country", "em.sensor", "em.recentCountries", "em.an.v3"];

/** 새 컨텍스트는 프로젝트 use 를 이어받지 않는다 — web 프로젝트와 같은 폭·언어·시간대 */
const CTX = { viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" } as const;
const WEB_ONLY = "로그인 단추·나라 칩은 웹 머리줄에서 잰다";

test("(a)(b) 앞사람의 로그인·나라·분석 조건은 같은 탭 새로 고침에만 남고, 다음 사람(새 컨텍스트)에게는 기본", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "web", WEB_ONLY);
  const ctxA = await browser.newContext({ ...CTX, baseURL });
  await ctxA.addInitScript(() => localStorage.setItem("em.lang", "ko"));
  const a = await ctxA.newPage();

  // A: 예시 로그인(과학자)
  await a.goto("/ko/calendar/");
  await expect(tabs(a)).toHaveCount(3);
  await a.locator("#loginBtn").click();
  await a.getByRole("button", { name: /과학자/ }).click();
  await a.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
  await expect(a).toHaveURL(/\/ko\/lab\/$/);
  await expect(tabs(a)).toHaveCount(5);

  // A: 비교 분석 조건(2단계 · 2024-04 · VIIRS 원자료)
  await a.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2024-04&view=raw_viirs");
  await expect(analysis(a)).toBeVisible({ timeout: 30000 });
  await expect.poll(() => a.evaluate(() => sessionStorage.getItem("em.an.v3"))).toContain('"month":4');

  // A: 나라 일본
  await a.goto("/ko/calendar/");
  await a.locator("#ctryBtn").click();
  await a.getByRole("searchbox").fill("JPN");
  await a.getByRole("option", { name: /JPN/ }).first().click();
  await expect(a).toHaveURL(/c=JPN/);
  await expect.poll(() => a.evaluate(() => sessionStorage.getItem("em.country"))).toBe("JPN");

  // 사용자 상태는 localStorage 에 하나도 없다
  expect(await a.evaluate((keys) => keys.filter((k) => localStorage.getItem(k) != null), LEGACY)).toEqual([]);

  // (b) 같은 탭: 주소에 조건이 없어도 이 탭 안에서는 이어진다 · 새로 고침에도 남는다
  await a.goto("/ko/calendar/");
  await a.reload();
  await expect(tabs(a)).toHaveCount(5);
  await expect(a.locator("#ctryBtn")).toHaveAttribute("title", "일본");
  expect(await a.evaluate(() => sessionStorage.getItem("em.role"))).toBe("scientist");
  expect(await a.evaluate(() => sessionStorage.getItem("em.an.v3"))).toContain('"month":4');

  // (a) 다음 사람: 같은 저장소 상태(쿠키·localStorage)를 이어받되 sessionStorage 는 빈 새 컨텍스트
  const state = await ctxA.storageState();
  await ctxA.close();
  const ctxB = await browser.newContext({ ...CTX, baseURL, storageState: state });
  const b = await ctxB.newPage();
  await b.goto("/ko/calendar/");
  await expect(tabs(b)).toHaveCount(3);
  await expect(b.locator("#loginBtn")).toBeVisible();
  await expect(b.locator("#ctryBtn")).toHaveAttribute("title", "대한민국");
  expect(await b.evaluate(() => localStorage.getItem("em.lang"))).toBe("ko");
  await b.goto("/ko/analysis/");
  await expect(analysis(b)).toBeVisible({ timeout: 30000 });
  await expect(analysis(b)).toHaveAttribute("data-step", "1");
  expect(new URL(b.url()).search).toBe("");
  await ctxB.close();
});

test("(c) 옛 판이 localStorage 에 남긴 사용자 상태는 열 때 지우고 기본 상태(언어는 남긴다)", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "web", WEB_ONLY);
  const origin = new URL(baseURL ?? "http://127.0.0.1").origin;
  const ctx = await browser.newContext({
    ...CTX,
    baseURL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [
            { name: "em.lang", value: "ko" },
            { name: "em.role", value: "scientist" },
            { name: "em.country", value: "JPN" },
            { name: "em.sensor", value: "modis" },
            { name: "em.recentCountries", value: '["JPN"]' },
            { name: "em.an.v3", value: JSON.stringify({ step: 2, aoi: "SIDO_47", year: 2024, month: 4, view: "raw_viirs" }) },
          ],
        },
      ],
    },
  });
  const p = await ctx.newPage();
  await p.goto("/ko/calendar/");
  await expect(tabs(p)).toHaveCount(3);
  await expect(p.locator("#ctryBtn")).toHaveAttribute("title", "대한민국");
  await expect.poll(() => p.evaluate((keys) => keys.filter((k) => localStorage.getItem(k) != null), LEGACY)).toEqual([]);
  expect(await p.evaluate(() => localStorage.getItem("em.lang"))).toBe("ko");
  await p.goto("/ko/analysis/");
  await expect(analysis(p)).toBeVisible({ timeout: 30000 });
  await expect(analysis(p)).toHaveAttribute("data-step", "1");
  expect(new URL(p.url()).search).toBe("");
  await ctx.close();
});
