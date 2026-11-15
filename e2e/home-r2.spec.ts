import { expect, test } from "@playwright/test";

/**
 * 상황판 r2-B 복원 시험(aibox · MSW 스냅숏 모드 · 웹 폭만). 잰다:
 *  기간 창 — 날짜 직접 입력(달력 팝오버) · 범위 달력 올리면 미리 칠함 · 화살표 이동 · 전년 대비 스위치 → 지표 머리 「전년 대비」 · 확인 줄(role=status)
 *  지도 — 검색 후보에 불·지명·자원 · 지난 기간이면 「기간 밖 진행 중」 안내 · 캘린더 칸 툴팁 「(평가 연도 제외)」
 * 스냅숏 모드는 /summary·/hotspots 가 503 이라 전년 대비 수는 「–」(자료 준비 중) — 값 비교는 실서버 스크린숏으로 본다.
 */
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "web", "웹 폭만");
  await page.addInitScript(() => {
    localStorage.setItem("em.lang", "ko");
    sessionStorage.setItem("em.role", "responder");
  });
});

const ready = async (page: import("@playwright/test").Page) => {
  await page.goto("/ko/home/");
  const root = page.locator('[data-testid="home"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  return root;
};

test("상황판 r2: 기간 창 — 날짜 직접 입력·미리 칠함·키보드·전년 대비·확인 줄", async ({ page }) => {
  const root = await ready(page);
  await root.locator('[data-pd="open"]').first().click();
  const pop = page.locator("[data-pdpop]");
  await expect(pop).toBeVisible();
  /* 범위 달력: 첫 누름 뒤 마우스를 올리면 그 날까지 미리 칠한다 */
  await pop.locator('[data-rd="2026-11-02"]').click();
  await pop.locator('[data-rd="2026-11-06"]').hover();
  await expect(pop.locator('[data-rd="2026-11-04"]')).toHaveAttribute("aria-pressed", "true");
  /* 화살표: 2일에서 → 이면 3일로 초점 */
  await pop.locator('[data-rd="2026-11-02"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(pop.locator('[data-rd="2026-11-03"]')).toBeFocused();
  await pop.locator('[data-rd="2026-11-06"]').click();
  await expect(root.locator('[data-pd="open"]').first()).toContainText("2026-11-02 – 11-06");
  const st = root.locator("[data-status]");
  await expect(st).toContainText("기간 2026-11-02 – 2026-11-06");
  /* 날짜 직접 입력: 시작 날짜 단추 → 달력 팝오버 → 1일 */
  await pop.locator('[data-dpick="start"]').click();
  const dp = page.locator("[data-dp]");
  await expect(dp).toBeVisible();
  await dp.locator('[data-d="2026-11-01"]').click();
  await expect(root.locator('[data-pd="open"]').first()).toContainText("2026-11-01 – 11-06");
  /* 전년 대비 */
  await pop.locator("[data-yoy]").click();
  await expect(pop.locator("[data-yoy]")).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator("[data-kpih]")).toHaveText("전년 대비");
  await expect(root.locator("[data-kpiaoi]")).toHaveText("26.11.01–11.06 vs 25.11.01–11.06");
  await expect(root.locator('[data-kpis][data-yoy] [data-yk]')).toHaveCount(4);
  await expect(st).toContainText("전년 대비 켬");
  await expect(root.locator(".hm-kpis-h, [data-pulse]").first()).toHaveAttribute("data-pulse", /[1-9]/);
  await pop.locator("[data-yoy]").click();
  await expect(root.locator("[data-kpih]")).toHaveText("과거 같은 달 대비");
});

test("상황판 r2: 검색 후보 — 불·지명·자원 · 기간 밖 진행 중 안내 · 칸 툴팁", async ({ page }) => {
  const root = await ready(page);
  /* 붙은 불 벌리기: 첫 화면(전국 보기)에서 길안면 세 불이 겹친다 → 한 줄로 올리거나 대표 고리 + 개수 */
  await expect(root.locator('[data-spread="spread"], [data-spread="rep"]').first()).toBeAttached({ timeout: 15000 });
  const q = root.locator("[data-search]");
  await q.fill("길안");
  await expect(root.locator("[data-sugg] [data-place]").first()).toContainText("길안면");
  await q.fill("펌프차");
  await expect(root.locator('[data-sugg] [data-place^="u:"]').first()).toBeVisible();
  await q.fill("없는지명가나다");
  await expect(root.locator("[data-sugg]")).toContainText("검색 결과 없음");
  await q.fill("");
  /* 지난달로 옮기면 지금 진행 중인 불이 기간 밖 → 안내 */
  await root.locator('[data-pd="prev"]').first().click();
  await root.locator('[data-pd="prev"]').first().click();
  await expect(root.locator("[data-outv]")).toContainText("진행 중");
  const t = await root.locator('[data-testid="home-cal"] rect[data-y="2022"][data-m="3"]').getAttribute("aria-label");
  expect(t ?? "").toMatch(/평가 연도 제외|판단 정보 부족|자료 부족/);
});

test("상황판 r2: 한국 밖 감지 목록 = 실제 /hotspots 24시간 묶음(스냅숏은 자료 준비 중)", async ({ page }) => {
  await page.goto("/ko/home/?c=TWN");
  const root = page.locator('[data-testid="home"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator("[data-alert]")).toHaveCount(0);
  /* MSW 스냅숏 모드: /hotspots 503 → 행 대신 「자료 준비 중」(값을 지어내지 않는다) · 실서버는 묶음 행(data-det) */
  await expect(root.locator("[data-feed]")).toContainText(/자료 준비 중|미확인 감지|감지 없음|확대하면/);
});
