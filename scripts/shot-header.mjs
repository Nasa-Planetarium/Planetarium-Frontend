#!/usr/bin/env node
/**
 * 셸 스크린샷 + 머리줄 픽셀 대조(목업 ↔ Next) — aibox 전용(개인 PC 에서 브라우저 금지).
 *
 * 쓰는 법(정적 내보내기 out/ 이 있어야 함):
 *   node scripts/shot-header.mjs --mockup <목업 폴더> --out <저장 폴더> [--chromium <실행 파일>]
 * 하는 일
 *   1. out/ 과 목업 폴더를 127.0.0.1 의 두 포트에 띄운다(scripts/serve-out.mjs 와 같은 규칙, 이 프로세스 안).
 *   2. 같은 크기(1440×900 · 390×844), 같은 언어(ko), 비로그인으로
 *      - Next:  /ko/calendar/ (전체 화면 → scaffold-ko-<w>.png) · /ko/home/ (머리줄 대조용)
 *      - 목업:  index.html#home (lang=ko)
 *   3. 머리줄 띠(높이 = 각자 --bar-h)를 잘라 pixelmatch(threshold 0.1)로 차이 화소 비율을 잰다.
 *      - full: 머리줄 전체 폭
 *      - right: 오른쪽 정렬 구역(상황 칸 + 나) — 목업 상황 구역 왼쪽 끝부터 오른쪽 끝까지(오른쪽 끝을 맞춰 자름)
 *   4. 나란히 보기 side-ko-<w>.png = [목업 머리줄 · Next 머리줄 · 차이] 세로로.
 *   5. 결과 JSON(header-diff.json).
 * 목업은 읽기만 한다. 서버는 끝나면 닫는다.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outDir = path.resolve(arg("--out", path.join(root, "shots")));
const mockup = path.resolve(arg("--mockup", process.env.MOCKUP_DIR ?? path.join(root, "..", "fe-src", "mockup")));
const executablePath = arg("--chromium", process.env.PW_CHROMIUM) || undefined;
fs.mkdirSync(outDir, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".bin": "application/octet-stream" };
function serve(dir, port) {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://x");
      let p = path.normalize(path.join(dir, decodeURIComponent(u.pathname)));
      if (!p.startsWith(dir)) return res.writeHead(403).end();
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
      if (!fs.existsSync(p)) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream", "Service-Worker-Allowed": "/" });
      fs.createReadStream(p).pipe(res);
    });
    s.listen(port, "127.0.0.1", () => ok(s));
  });
}

const crop = (png, x, y, w, h) => {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, x, y, w, h, 0, 0);
  return out;
};
const diffOf = (a, b) => {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const A = crop(a, 0, 0, w, h);
  const B = crop(b, 0, 0, w, h);
  const D = new PNG({ width: w, height: h });
  const n = pixelmatch(A.data, B.data, D.data, w, h, { threshold: 0.1 });
  return { n, total: w * h, ratio: n / (w * h), D, w, h, A, B };
};
const stack = (imgs, gap = 8) => {
  const w = Math.max(...imgs.map((i) => i.width));
  const h = imgs.reduce((s, i) => s + i.height, 0) + gap * (imgs.length - 1);
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  let y = 0;
  for (const i of imgs) {
    PNG.bitblt(i, out, 0, 0, i.width, i.height, 0, y);
    y += i.height + gap;
  }
  return out;
};
const save = (png, name) => fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));

const NEXT_PORT = Number(arg("--port", 8797));
const MOCK_PORT = NEXT_PORT + 1;
const servers = [await serve(path.join(root, "out"), NEXT_PORT), await serve(mockup, MOCK_PORT)];
const browser = await chromium.launch({ executablePath, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const result = { measured_at: new Date().toISOString(), mockup, threshold: 0.1, sizes: {} };

async function shoot(url, w, h, initLang, headerSel, sitSel) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "ko-KR", timezoneId: "Asia/Seoul", deviceScaleFactor: 1 });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem("em.lang", l);
    } catch {
      /* 저장 안 됨 */
    }
  }, initLang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  const box = await page.locator(headerSel).first().boundingBox();
  const sit = await page.locator(sitSel).first().boundingBox();
  const png = PNG.sync.read(await page.screenshot());
  await ctx.close();
  return { png, box, sit, errors };
}

for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const cal = await shoot(`http://127.0.0.1:${NEXT_PORT}/ko/calendar/`, w, h, "ko", "#topbar", '#topbar [role="group"]');
  save(cal.png, `scaffold-ko-${w}.png`);
  const nx = await shoot(`http://127.0.0.1:${NEXT_PORT}/ko/home/`, w, h, "ko", "#topbar", '#topbar [role="group"]');
  const mk = await shoot(`http://127.0.0.1:${MOCK_PORT}/index.html#home`, w, h, "ko", "#topbar", "#topbar .tb-sit");
  save(mk.png, `mockup-ko-${w}.png`);
  const hh = Math.round(Math.max(nx.box?.height ?? 48, mk.box?.height ?? 48));
  const A = crop(mk.png, 0, 0, w, hh);
  const B = crop(nx.png, 0, 0, w, hh);
  const full = diffOf(A, B);
  const sitLeft = Math.max(0, Math.floor(Math.min(mk.sit?.x ?? w, nx.sit?.x ?? w)));
  const rw = w - sitLeft;
  const right = diffOf(crop(mk.png, sitLeft, 0, rw, hh), crop(nx.png, sitLeft, 0, rw, hh));
  save(stack([A, B, full.D]), `side-ko-${w}.png`);
  result.sizes[w] = {
    header_px: { mockup: mk.box?.height, next: nx.box?.height },
    full: { diff_px: full.n, total_px: full.total, ratio: Number(full.ratio.toFixed(4)) },
    right_zone: { from_x: sitLeft, diff_px: right.n, total_px: right.total, ratio: Number(right.ratio.toFixed(4)) },
    page_errors: { next_calendar: cal.errors, next_home: nx.errors, mockup: mk.errors },
  };
  console.log(`${w}: 머리줄 전체 차이 ${(full.ratio * 100).toFixed(2)}% · 오른쪽 구역(x≥${sitLeft}) ${(right.ratio * 100).toFixed(2)}% · 높이 목업 ${mk.box?.height} / Next ${nx.box?.height}`);
}
fs.writeFileSync(path.join(outDir, "header-diff.json"), JSON.stringify(result, null, 1) + "\n");
await browser.close();
servers.forEach((s) => s.close());
