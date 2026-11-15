import fs from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";

/**
 * CSV 내보내기 공통 규칙 + 새 층 CSV + 비교 분석 묶음(zip) — 목(MSW) 빌드에서 실제로 눌러 받은 파일을 잰다.
 * 공통: UTF-8 BOM 한 번 · 첫 줄 `# data_version=…; aoi=…; period=…` · 그 다음 머리줄 · 원값.
 * 목은 /cells 가 503(자료 준비 중)이라 묶음의 칸 파일은 머리줄 + 메타 error=data_not_loaded 로 들어간다(실서버 점검은 별도).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("em.lang", "ko"));
});

const BOM = [0xef, 0xbb, 0xbf];

async function save(page: Page, click: () => Promise<void>): Promise<{ name: string; buf: Buffer }> {
  const p = page.waitForEvent("download", { timeout: 20000 });
  await click();
  const d: Download = await p;
  const f = await d.path();
  return { name: d.suggestedFilename(), buf: fs.readFileSync(f) };
}

function csvParts(buf: Buffer) {
  expect([...buf.subarray(0, 3)]).toEqual(BOM);
  const text = buf.subarray(3).toString("utf8");
  expect(text.startsWith("﻿")).toBe(false);
  const lines = text.split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));
  return { meta: lines[0] ?? "", header: lines[1] ?? "", rows: lines.slice(2) };
}

/** STORE zip 읽기(우리 묶음은 압축 없음) */
function unzip(buf: Buffer) {
  const out: { name: string; data: Buffer }[] = [];
  let o = 0;
  while (o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    expect(buf.readUInt16LE(o + 8)).toBe(0);
    const size = buf.readUInt32LE(o + 18);
    const nl = buf.readUInt16LE(o + 26);
    const xl = buf.readUInt16LE(o + 28);
    const name = buf.subarray(o + 30, o + 30 + nl).toString("utf8");
    const s = o + 30 + nl + xl;
    out.push({ name, data: buf.subarray(s, s + size) });
    o = s + size;
  }
  return out;
}

test("비교 분석 3단계: 캘린더·결과 CSV 에 BOM + 메타 첫 줄", async ({ page }) => {
  await page.goto("/ko/analysis/?step=3&aoi=SIDO_47&ym=2025-03");
  await expect(page.locator('[data-testid="analysis"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  const cal = await save(page, () => page.locator("[data-csv]").first().click());
  const c = csvParts(cal.buf);
  expect(c.meta).toMatch(/^# data_version=\S*; aoi=SIDO_47 \(.+\); period=\d{4}-\d{2}\/\d{4}-\d{2}; source=\/api\/v1\/aois\/SIDO_47\/calendar$/);
  expect(c.header.startsWith("aoi_id,year,month,value,value_lo,value_hi")).toBe(true);
  expect(c.rows.length).toBeGreaterThan(100);
  const res = await save(page, () => page.locator("[data-sumcsv]").first().click());
  const r = csvParts(res.buf);
  expect(r.meta).toContain("period=2025-03");
  expect(r.rows.length).toBe(1);
});

test("비교 분석 머리 「분석 자료 내려받기」: zip 하나에 캘린더·비교·추이·칸 CSV", async ({ page }) => {
  await page.goto("/ko/analysis/?step=2&aoi=SIDO_47&ym=2025-03");
  await expect(page.locator('[data-testid="analysis"][data-ready="1"]')).toBeVisible({ timeout: 30000 });
  const b = page.locator("[data-bundle]");
  await expect(b).toBeEnabled({ timeout: 20000 });
  const z = await save(page, () => b.click());
  expect(z.name).toBe("emberline_analysis_SIDO_47_2025-03.zip");
  const files = unzip(z.buf);
  const names = files.map((f) => f.name);
  expect(names.some((n) => n.startsWith("emberline_calendar_SIDO_47_"))).toBe(true);
  expect(names).toContain("emberline_result_SIDO_47_2025-03.csv");
  expect(names.some((n) => /^emberline_summary_SIDO_47_.*_month\.csv$/.test(n))).toBe(true);
  expect(names.some((n) => /^emberline_cells_SIDO_47_2025-03_/.test(n))).toBe(true);
  for (const f of files) {
    const p = csvParts(f.data);
    expect(p.meta.startsWith("# data_version=")).toBe(true);
    expect(p.meta).toContain("aoi=SIDO_47");
    expect(p.header.length).toBeGreaterThan(0);
  }
});

test("캘린더 상세: 불 유형 · 위성 상태 CSV(응답 행 그대로)", async ({ page }) => {
  await page.goto("/ko/calendar/?aoi=SIDO_47&ym=2025-03");
  const root = page.locator('[data-testid="calendar"][data-ready="1"]');
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator('[data-testid="cal-regime-frp"][data-ready="1"]')).toBeVisible({ timeout: 20000 });
  const rg = await save(page, () => root.locator('[data-lcsv="fire-regime"]').first().click());
  expect(rg.name).toBe("emberline_fire-regime_SIDO_47_2025-03.csv");
  const g = csvParts(rg.buf);
  expect(g.meta).toContain("period=2025-03");
  expect(g.header.startsWith("aoi_id,name,year,month,fire_regime")).toBe(true);
  expect(g.rows[0]).toContain("large_fire");
  expect(g.rows[0]).toMatch(/,0\.7593\d*,/);
  await expect(root.locator('[data-testid="cal-sat-days"][data-ready="1"]')).toBeVisible();
  const st = await save(page, () => root.locator('[data-lcsv="satellite-status"]').first().click());
  const s = csvParts(st.buf);
  expect(s.meta).toContain("period=2025-03-01/2025-03-31");
  expect(s.header).toContain("satellite");
  expect(s.header).toContain("date_utc");
  expect(s.rows.length).toBeGreaterThanOrEqual(31);
});
