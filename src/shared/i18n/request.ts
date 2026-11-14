import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { loadMessages } from "./messages";

/** next-intl 요청 설정(정적 내보내기: 빌드 때 [locale] 마다 한 번 불린다) */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: "UTC",
    // 없는 키는 목업 EM.t 처럼 키 문자열을 그대로 보여 준다(빌드를 멈추지 않음)
    onError: () => {},
    getMessageFallback: ({ namespace, key }) => (namespace ? `${namespace}.${key}` : key),
  };
});
