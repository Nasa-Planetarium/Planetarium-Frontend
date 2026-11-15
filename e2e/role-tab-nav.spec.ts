import { expect, test, type Page } from "@playwright/test";

/**
 * 로그인 뒤 머리줄 탭 왕복(2026-11-15 사용자 보고 「상황판을 누르면 예측 분석으로 되돌아가지 못한다」의 회귀 시험).
 * 원인: 상황판 지도(home-map)가 /hotspots 결과를 받으면 효과 → setHot(새 객체) → 다시 그림 → 새 범위 배열 → 효과 … 로 끝없이 돌아
 *       Next 탭 이동(전환 렌더)이 계속 밀려 상황판에서 어느 탭으로도 못 갔다. 실서버에서만 — MSW 스냅숏은 /hotspots 가 503 이라 안 돈다.
 * 그래서 이 시험은 /hotspots 만 200(점 하나)으로 바꿔 실서버와 같은 갈래를 탄다(페이지 fetch 를 감싼다 — MSW 워커보다 앞).
 * 잰다: 역할 5개 × (웹·폰) — 예시 로그인 → 역할 탭 → 상황판 → 역할 탭 → 공개 탭(캘린더) → 역할 탭 → 상황판 → 공개 탭(비교 분석) → 역할 탭,
 *       매 이동마다 주소가 그 화면이 되고 탭 수(공개 3 + 상황판 + 역할 탭 = 5)·em.role 이 그대로인지 · 상황판이 가만히 있을 때 다시 그리기가 멎는지 · 페이지 오류 0.
 * 안 잰다: 실서버 /hotspots 의 실제 점 수·모양(점 하나 고정 응답) · 실제 휴대폰 기기(폰 = 390 폭 터치 Chrome).
 */
const ROLES = [
  { role: "responder", nav: "ops", label: /^조기경보·긴급대응/ },
  { role: "firefighter", nav: "ops", label: /^소방 현장지휘/ },
  { role: "land", nav: "land", label: /^토지 관리/ },
  { role: "commander", nav: "cmd", label: /^지휘자/ },
  { role: "scientist", nav: "lab", label: /^과학자/ },
] as const;

/** /hotspots 만 실서버처럼 200 — 나머지는 그대로(MSW) */
async function liveHotspots(page: Page) {
  await page.addInitScript(() => {
    const orig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/\/api\/v1\/hotspots\b/.test(url)) {
        const body = {
          count: 1,
          total: 1,
          truncated: false,
          next_cursor: null,
          hotspots: [{ latitude: 36.4, longitude: 128.6, instrument: "VIIRS", frp: 12.5, confidence: "n", date_local: "2026-11-10", acq_datetime_utc: "2026-11-10T04:30:00Z" }],
        };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return orig(input, init);
    };
  });
}

const tabs = (page: Page) => page.locator("#topbar nav a[data-tab]");

async function login(page: Page, label: RegExp) {
  const btn = page.locator("#loginBtn");
  if (await btn.isVisible()) await btn.click();
  else {
    await page.locator("#who").click();
    await page.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
  }
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: label }).click();
  await dlg.getByRole("button", { name: "로그인" }).click();
}

/** 다시 그리기 수(가만히 ms 동안 DOM 변경 수) — 상황판 시계(1초) 몇 번 말고는 멎어야 한다 */
const idleMutations = (page: Page, ms: number) =>
  page.evaluate(async (t) => {
    let n = 0;
    const mo = new MutationObserver((ms) => {
      n += ms.length;
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    await new Promise((r) => setTimeout(r, t));
    mo.disconnect();
    return n;
  }, ms);

test.describe("로그인 뒤 탭 왕복", () => {
  test.describe.configure({ timeout: 120_000 });
  for (const R of ROLES) {
    test(`${R.role}: 역할 탭 ↔ 상황판 ↔ 공개 탭 왕복, 탭 수 유지`, async ({ page }) => {
      const errs: string[] = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await liveHotspots(page);
      await page.goto("/ko/calendar/");
      await expect(tabs(page)).toHaveCount(3);
      await login(page, R.label);
      await expect(page).toHaveURL(new RegExp(`/ko/${R.nav}/`), { timeout: 15_000 });
      await expect(tabs(page)).toHaveCount(5);

      const go = async (id: string) => {
        await tabs(page).and(page.locator(`[data-tab="${id}"]`)).click();
        await expect(page, `→ ${id}`).toHaveURL(new RegExp(`/ko/${id}/`), { timeout: 10_000 });
        await expect(page.locator(`#topbar a[data-tab="${id}"]`)).toHaveAttribute("aria-current", "page");
        await expect(tabs(page)).toHaveCount(5);
        expect(await page.evaluate(() => sessionStorage.getItem("em.role"))).toBe(R.role);
      };

      await go("home");
      /* 상황판 지도가 점을 받을 때까지 기다린 뒤(그 순간부터 예전엔 돌았다) 다시 그리기가 멎는지 */
      await expect(page.locator('[data-testid="home-map"][data-ready="1"]')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      expect(await idleMutations(page, 2000)).toBeLessThan(40);
      await go(R.nav);
      await go("calendar");
      await go(R.nav);
      await go("home");
      await page.waitForTimeout(1500);
      await go("analysis");
      await go(R.nav);
      expect(errs).toEqual([]);
    });
  }
});
