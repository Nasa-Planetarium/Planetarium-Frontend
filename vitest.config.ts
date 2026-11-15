import path from "node:path";
import { defineConfig } from "vitest/config";

// 단위 시험(순수 함수·처리기·변환). 브라우저 시험은 Playwright(e2e/, 팀 시험 서버 전용)
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
  },
});
