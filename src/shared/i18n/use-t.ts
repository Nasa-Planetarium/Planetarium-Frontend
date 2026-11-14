"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

export type TParams = Record<string, string | number>;
export type TFn = (key: string, params?: TParams) => string;

/**
 * 목업 EM.t 와 같은 쓰임: t("shell.top.risk") — 키 문자열은 목업 그대로.
 * 잎이면서 가지인 키(예 shell.top.risk 와 shell.top.risk.short)는 사전에서 「shell.top.risk._」 로 옮겨져 있다.
 * 이 함수가 「x._」 를 먼저 찾아 주므로 화면 코드는 그 사정을 몰라도 된다.
 * 복수형(EM.tp)은 같은 함수에 { n } 을 넘기면 ICU plural 이 고른다.
 */
/**
 * 원장 문자열 번역(목업 EM.tl): 지금 언어 사전 data.<kind>.<id>[.<field>] → 없으면 원문(한국어 원장 값).
 * 예: tl("weather", "station", null, "안동") → en 「Andong」, ko 「안동」(ko 사전에 없으면 원문)
 */
export function useTl() {
  const t = useTranslations();
  return useCallback(
    (kind: string, id: string, field: string | null, fallback: string) => {
      const key = `data.${kind}.${id}${field ? `.${field}` : ""}`;
      if (t.has(`${key}._`)) return t(`${key}._`);
      return t.has(key) ? t(key) : fallback;
    },
    [t],
  );
}

export function useT(): TFn {
  const t = useTranslations();
  return useCallback<TFn>(
    (key, params) => {
      const leaf = `${key}._`;
      if (t.has(leaf)) return t(leaf, params);
      if (t.has(key)) return t(key, params);
      return key;
    },
    [t],
  );
}
