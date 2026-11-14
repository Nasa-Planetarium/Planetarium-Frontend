import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e — 정적 내보내기 결과를 띄워 연다.
 * 실행: pnpm build && pnpm e2e   (처음 한 번: pnpm exec playwright install chromium)
 * 서버: 정적 내보내기 결과(out/)를 scripts/serve-out.mjs 로 127.0.0.1:PW_PORT(기본 8797)에. 끝나면 Playwright 가 끈다.
 * 브라우저: PW_CHROMIUM 이 있으면 그 실행 파일(이미 받아 둔 다른 판을 쓸 때), 없으면 Playwright 기본.
 */
const port = Number(process.env.PW_PORT ?? 8797);
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    launchOptions: { executablePath, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: `node scripts/serve-out.mjs --dir out --port ${port}`,
    url: `http://127.0.0.1:${port}/ko/calendar/`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
  projects: [
    { name: "web", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false } },
  ],
});
