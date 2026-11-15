import { expect, test, type Page } from "@playwright/test";

/**
 * 같은 브라우저를 여러 사람이 쓸 때 앞사람 상태가 남지 않는다(완전 격리 — shared/lib/prefs · app/boot/idle-reset).
 * 잰다: (a) 사용자 A 가 예시 로그인·나라 일본·비교 분석 조건·시계 UTC 를 바꾼 뒤, 같은 저장소 상태(storageState: 쿠키·localStorage)를
 *           이어받고 sessionStorage 는 빈 새 컨텍스트(= 새 창·다음 사람)로 열면 로그아웃·대한민국·분석 1단계 기본.
 *       (b) 같은 탭 새로 고침에는 로그인·나라·분석 조건이 남는다.
 *       (c) 옛 판이 localStorage 에 남긴 em.*(언어·시계 포함)는 열 때 모두 지워지고 기본 상태.
 *       (d) 모든 화면(공개 3 + 역할 5)을 돌며 언어 전환·시계·나라·분석을 바꿔도 localStorage 키가 하나도 생기지 않는다.
 *       (e) 입력 없이 IDLE_RESET_MS(10분)가 지나면 em.* 를 비우고 공개 첫 화면 · 입력이 이어지면 초기화 안 됨.
 *           시간은 Playwright 시계(page.clock.fastForward)로 당긴다 — 앱 상수는 바꾸지 않는다.
 * 안 잰다: 실제 브라우저 창 닫기(Playwright 컨텍스트로 갈음) · 폰 폭(로그인 단추·나라 칩이 웹 머리줄에만 있다) · 실제 10분 벽시계 대기.
 */
const tabs = (page: Page) => page.locator("#topbar nav a[data-tab]");
const analysis = (page: Page) => page.locator('[data-testid="analysis"][data-ready="1"]');
const emKeys = (page: Page, area: "localStorage" | "sessionStorage") =>
  page.evaluate((a) => Object.keys(window[a]).filter((k) => k.startsWith("em.")).sort(), area);
const allLocal = (page: Page) => page.evaluate(() => Object.keys(localStorage));

/** 새 컨텍스트는 프로젝트 use 를 이어받지 않는다 — web 프로젝트와 같은 폭·언어·시간대 */
const CTX = { viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" } as const;
const WEB_ONLY = "로그인 단추·나라 칩은 웹 머리줄에서 잰다";
const IDLE_MS = 10 * 60 * 1000; // = src/app/boot/idle-reset.tsx IDLE_RESET_MS

async function login(page: Page, role: RegExp) {
  await page.locator("#loginBtn").click();
  await page.getByRole("button", { name: role }).click();
  await page.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
}

async function pickCountry(page: Page, iso3: string) {
  await page.locator("#ctryBtn").click();
  await page.getByRole("searchbox").fill(iso3);
  await page.getByRole("option", { name: new RegExp(iso3) }).first().click();
  await expect(page).toHaveURL(new RegExp(`c=${iso3}`));
}

test("(a)(b) 앞사람의 로그인·나라·분석 조건은 같은 탭 새로 고침에만 남고, 다음 사람(새 컨텍스트)에게는 기본", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "web", WEB_ONLY);
  const ctxA = await browser.newContext({ ...CTX, baseURL });
  const a = await ctxA.newPage();

  // A: 예시 로그인(과학자)
  await a.goto("/ko/calendar/");
  await expect(tabs(a)).toHaveCount(3);
  await login(a, /과학자/);
  await expect(a).toHaveURL(/\/ko\/lab\/$/);
  await expect(tabs(a)).toHaveCount(5);

  // A: 비교 분석 조건(2단계 · 2024-04 · VIIRS 원자료)
  await a.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2024-04&view=raw_viirs");
  await expect(analysis(a)).toBeVisible({ timeout: 30000 });
  await expect.poll(() => a.evaluate(() => sessionStorage.getItem("em.an.v3"))).toContain('"month":4');

  // A: 나라 일본
  await a.goto("/ko/calendar/");
  await pickCountry(a, "JPN");
  await expect.poll(() => a.evaluate(() => sessionStorage.getItem("em.country"))).toBe("JPN");

  // 사용자 상태는 localStorage 에 하나도 없다
  expect(await allLocal(a)).toEqual([]);

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
  await b.goto("/ko/analysis/");
  await expect(analysis(b)).toBeVisible({ timeout: 30000 });
  await expect(analysis(b)).toHaveAttribute("data-step", "1");
  expect(new URL(b.url()).search).toBe("");
  expect(await emKeys(b, "sessionStorage")).not.toContain("em.role");
  await ctxB.close();
});

test("(c) 옛 판이 localStorage 에 남긴 em.* 는 언어·시계까지 열 때 모두 지우고 기본 상태", async ({ browser, baseURL }, info) => {
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
            { name: "em.lang", value: "en" },
            { name: "em.clockUTC", value: "1" },
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
  await expect.poll(() => allLocal(p)).toEqual([]);
  await p.goto("/ko/analysis/");
  await expect(analysis(p)).toBeVisible({ timeout: 30000 });
  await expect(analysis(p)).toHaveAttribute("data-step", "1");
  expect(new URL(p.url()).search).toBe("");
  await ctx.close();
});

test("(d) 모든 화면을 돌며 언어·시계·나라·분석을 바꿔도 localStorage 키가 하나도 생기지 않는다", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "web", WEB_ONLY);
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ ...CTX, baseURL });
  const p = await ctx.newPage();
  const seen: string[] = [];
  const check = async (where: string) => {
    for (const k of await allLocal(p)) seen.push(`${where}: ${k}`);
  };
  for (const path of ["calendar", "analysis", "method"]) {
    await p.goto(`/ko/${path}/`);
    await expect(p.locator("h1")).toBeVisible({ timeout: 30000 });
    await check(path);
  }
  // 언어 전환(주소 접두사만 바뀐다)
  await p.goto("/ko/method/");
  await p.locator("#topbar button[lang=en]").click();
  await expect(p).toHaveURL(/\/en\/method\/$/);
  await check("lang");
  await p.goto("/ko/calendar/");
  await pickCountry(p, "JPN");
  await check("country");
  await p.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2024-04");
  await expect(analysis(p)).toBeVisible({ timeout: 30000 });
  await check("analysis-step2");
  // 역할 5개 화면(로그인은 UI 로 — 머리줄 계정 창에서 시계 UTC 도 바꾼다)
  await p.goto("/ko/calendar/");
  await login(p, /조기경보/);
  await p.locator("#who").click();
  await p.getByRole("dialog").getByText("UTC", { exact: true }).click();
  await expect.poll(() => p.evaluate(() => sessionStorage.getItem("em.clockUTC"))).toBe("1");
  await p.keyboard.press("Escape");
  for (const [role, path] of [
    ["responder", "home"],
    ["responder", "ops"],
    ["land", "land"],
    ["commander", "cmd"],
    ["scientist", "lab"],
  ] as const) {
    await p.evaluate((r) => sessionStorage.setItem("em.role", r), role);
    await p.goto(`/ko/${path}/`);
    await expect(p.locator('[data-slot="locked"]')).toHaveCount(0);
    await expect(p.locator("main h1")).toBeVisible({ timeout: 30000 }); // 나라가 일본이라 화면 뿌리(data-testid)가 다를 수 있다 — 제목으로 잰다
    await check(path);
  }
  expect(seen).toEqual([]);
  // 사용자 상태는 sessionStorage 에만 있다
  expect(await emKeys(p, "sessionStorage")).toEqual(expect.arrayContaining(["em.an.v3", "em.clockUTC", "em.country", "em.role"]));
  await ctx.close();
});

test("(e) 입력 없이 10분 지나면 조용히 공개 첫 화면(로그인 해제·em.* 비움) · 입력이 이어지면 그대로", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "web", WEB_ONLY);
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ ...CTX, baseURL });
  const p = await ctx.newPage();
  await p.clock.install();
  await p.goto("/ko/calendar/");
  await login(p, /과학자/);
  await expect(p).toHaveURL(/\/ko\/lab\/$/);
  await expect(tabs(p)).toHaveCount(5);
  await p.goto("/ko/lab/?c=JPN");
  await expect(tabs(p)).toHaveCount(5);
  await p.evaluate(() => sessionStorage.setItem("em.country", "JPN"));

  // 입력이 이어지면(6분 · 입력 · 6분 = 12분) 초기화 안 됨
  await p.clock.fastForward(6 * 60 * 1000);
  await p.mouse.move(400, 400);
  await p.mouse.move(420, 410);
  await p.keyboard.press("Shift");
  await p.clock.fastForward(6 * 60 * 1000);
  await p.waitForTimeout(500);
  await expect(p).toHaveURL(/\/ko\/lab\/\?c=JPN$/);
  expect(await p.evaluate(() => sessionStorage.getItem("em.role"))).toBe("scientist");

  // 입력 없이 10분 넘게 → 공개 첫 화면 · 로그인 해제 · em.* 0 · 안내 토스트 없음
  await p.clock.fastForward(IDLE_MS + 10_000);
  await expect(p).toHaveURL(/\/ko\/calendar\/$/, { timeout: 15000 });
  await expect(tabs(p)).toHaveCount(3);
  await expect(p.locator("#ctryBtn")).toHaveAttribute("title", "대한민국");
  expect(await emKeys(p, "sessionStorage")).toEqual([]);
  expect(await allLocal(p)).toEqual([]);
  await expect(p.locator("[data-sonner-toast]")).toHaveCount(0);
  await ctx.close();
});
