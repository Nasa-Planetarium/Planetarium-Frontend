import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * 정적 내보내기(output: "export") — 결과물 `out/` 을 nginx 가 그대로 서빙한다.
 * 정적 내보내기에서 못 쓰는 것: 미들웨어·rewrites·redirects·headers·Server Actions·ISR·기본 이미지 최적화.
 * 언어 협상·보안 헤더는 nginx 몫(설계 frontend-design.md §3.2).
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  typedRoutes: false,
};

// next-intl 요청 설정 위치(FSD: shared/i18n)
const withNextIntl = createNextIntlPlugin("./src/shared/i18n/request.ts");

export default withNextIntl(nextConfig);
