import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * 규칙 요지
 * 1. switch/case 금지(결정 E4) — 경우마다 처리기 클래스 + 레지스트리(맵). 예: src/shared/data-cases/registry.ts
 * 2. 목(mock) 격리(결정 F5·F6) — 목 모듈은 조립 지점(src/app/boot/adapters.ts)만 import.
 *    목 모듈은 실제 데이터 모듈(api client·msw·data-cases·entities…)을 import 하지 않는다. 같은 규칙을 scripts/check-isolation.mjs 가 한 번 더 잰다.
 * 3. FSD 층 방향·슬라이스 가로 import 는 steiger(pnpm steiger)가 잰다.
 */
const MOCK_DIRS = ["src/shared/mock/**"];
const MOCK_IMPORTS = ["@/shared/mock", "@/shared/mock/*", "**/shared/mock", "**/shared/mock/*", "../mock", "../mock/*", "../../mock", "../../mock/*"];
const REAL_IMPORTS = [
  "@/entities/*",
  "@/features/*",
  "@/widgets/*",
  "@/pages/*",
  "@/app",
  "@/app/*",
  "@/shared/api",
  "@/shared/api/client",
  "@/shared/api/*",
  "@/shared/msw",
  "@/shared/msw/*",
  "@/shared/data-cases",
  "@/shared/data-cases/*",
  "**/msw/*",
  "**/data-cases",
  "**/data-cases/*",
];

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "out/**", "node_modules/**", "public/**", "src/shared/api/schema.d.ts", "messages/index.ts", "next-env.d.ts", "playwright-report/**", "test-results/**", "shots/**"],
  },
  {
    rules: {
      "no-restricted-syntax": ["error", { selector: "SwitchStatement", message: "switch/case 금지(결정 E4) — 처리기 클래스 + 레지스트리(맵)로 고른다. src/shared/data-cases 참고" }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    ignores: [...MOCK_DIRS, "src/app/boot/adapters.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: MOCK_IMPORTS, message: "목 모듈은 조립 지점(src/app/boot/adapters.ts)만 import 한다(결정 F5). 화면은 useAgency()/useAuth() 포트를 쓴다." }] },
      ],
    },
  },
  {
    files: MOCK_DIRS,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: REAL_IMPORTS, message: "목 모듈은 포트 타입·shared/config·shared/lib 만 import 한다(결정 F5) — 실제 데이터 모듈과 서로 import 금지." }] },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  },
];

export default config;
