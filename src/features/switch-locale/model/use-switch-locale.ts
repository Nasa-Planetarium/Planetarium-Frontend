"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { usePath, useQueryParams } from "@/shared/lib/nav";
import { LOCALES, type Locale } from "@/shared/config";
import { prefs } from "@/shared/lib/prefs";

/**
 * 언어 바꾸기 = 같은 경로·같은 쿼리의 다른 언어 접두사로 이동(/ko/calendar/?c=BRA → /en/calendar/?c=BRA).
 * 고른 언어는 저장값 em.lang 에도 둔다(루트 / 가 다음에 읽는다).
 */
export function useSwitchLocale() {
  const locale = useLocale() as Locale;
  const pathname = usePath();
  const sp = useQueryParams();
  const router = useRouter();
  const other = LOCALES.find((l) => l !== locale) ?? locale;
  const go = useCallback(
    (next: Locale) => {
      prefs.set("lang", next);
      const rest = pathname.replace(/^\/(ko|en)(?=\/|$)/, "");
      const qs = sp.toString();
      router.push(`/${next}${rest || "/"}${qs ? `?${qs}` : ""}`);
    },
    [pathname, sp, router],
  );
  return { locale, other, go };
}
