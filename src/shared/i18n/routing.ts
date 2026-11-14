import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "@/shared/config";

/** 정적 내보내기: 모든 주소에 언어 접두사(/ko · /en), 서버 언어 협상 없음 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

/** 목업 EM.LANGS 그대로(이름은 그 언어 자기 이름) */
export const LANGS = [
  { id: "ko", name: "한국어", short: "한" },
  { id: "en", name: "English", short: "EN" },
] as const;
