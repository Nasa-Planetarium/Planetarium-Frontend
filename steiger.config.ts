import { defineConfig } from "steiger";
import fsd from "@feature-sliced/steiger-plugin";

/**
 * FSD 검사(pnpm steiger). 층: app → pages → widgets → features → entities → shared.
 * Next 경로는 루트 app/ 에, FSD 층은 src/app·src/pages 에 둔다(루트 빈 pages/ 가 있어 Next 가 src/ 아래를 경로로 읽지 않음).
 * 목 격리(결정 F5)는 steiger 가 표현하지 못하는 규칙이라 eslint + scripts/check-isolation.mjs 가 맡는다.
 */
export default defineConfig([
  ...fsd.configs.recommended,
  {
    // 골격 단계: 화면 슬라이스가 아직 한 곳에서만 쓰이는 것은 정상(화면 담당이 채우면 사라짐)
    files: ["./src/**"],
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
]);
