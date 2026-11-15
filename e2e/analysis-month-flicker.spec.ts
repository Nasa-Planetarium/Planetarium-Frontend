import { expect, test } from "@playwright/test";

/**
 * ② 비교 분석 2단계 — 캘린더에서 달을 눌러도 캘린더 SVG 가 DOM 에서 한 번도 빠지지 않는다(깜빡임 회귀, 2026-11-15).
 * 전: 달마다 /comparison 키가 바뀌어 자리표시 없이 data 가 비고 → ready 0 → 본문 전체가 빠졌다 다시 그려짐(클릭마다 SVG 제거 1·추가 1).
 * 잰다: MutationObserver(캘린더 SVG 를 품은 노드가 빠짐) + rAF 마다 같은 SVG 노드인지·data-ready·본문 섹션 수, 달 3번.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

test("달 클릭: 캘린더 SVG 유지 · 본문이 비지 않음", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="analysis"][data-ready="1"][data-step="2"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  const grid = root.locator("svg[role=grid]");
  await expect(grid.locator("rect[data-v]").first()).toBeVisible({ timeout: 30000 });

  const targets = await grid.evaluate((svg) => {
    const ok = new Set([...svg.querySelectorAll<SVGElement>('rect[data-v][role="gridcell"]')].map((r) => `${r.dataset.y}-${r.dataset.m}`));
    return [
      [2024, 8],
      [2023, 4],
      [2025, 1],
      [2022, 11],
      [2024, 3],
    ]
      .filter(([y, m]) => ok.has(`${y}-${m}`))
      .slice(0, 3);
  });
  expect(targets.length).toBeGreaterThanOrEqual(2);

  for (const [y, m] of targets) {
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const svg0 = document.querySelector('[data-testid="analysis"] svg[role=grid]');
      const log = { removed: 0, frames: 0, otherSvg: 0, notReady: 0, minSections: 99 };
      w.__fk = log;
      const mo = new MutationObserver((ms) => {
        for (const mu of ms) mu.removedNodes.forEach((n) => (n === svg0 || (n as Element).contains?.(svg0)) && log.removed++);
      });
      mo.observe(document.getElementById("view") as Element, { childList: true, subtree: true });
      w.__fkStop = () => mo.disconnect();
      const t0 = performance.now();
      const tick = () => {
        const r = document.querySelector('[data-testid="analysis"]');
        log.frames++;
        if (r?.querySelector("svg[role=grid]") !== svg0) log.otherSvg++;
        if (r?.getAttribute("data-ready") !== "1") log.notReady++;
        log.minSections = Math.min(log.minSections, r?.querySelectorAll("[data-an-body] section").length ?? 0);
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await grid.locator(`rect[data-y="${y}"][data-m="${m}"]`).click();
    await expect(root).toHaveAttribute("data-ym", `${y}-${String(m).padStart(2, "0")}`);
    await page.waitForTimeout(1600);
    const log = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      (w.__fkStop as () => void)();
      return w.__fk as { removed: number; frames: number; otherSvg: number; notReady: number; minSections: number };
    });
    expect(log.frames, "rAF 기록").toBeGreaterThan(10);
    expect(log, `${y}-${m}`).toMatchObject({ removed: 0, otherSvg: 0, notReady: 0 });
    expect(log.minSections).toBeGreaterThan(0);
  }
  await expect(root).not.toHaveAttribute("data-busy", "1", { timeout: 10000 });
});
