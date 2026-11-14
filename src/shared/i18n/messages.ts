import { loaders } from "../../../messages";
import extraKo from "../../../messages-extra/ko.json";
import extraEn from "../../../messages-extra/en.json";
import type { Locale } from "@/shared/config";

export type Messages = Record<string, unknown>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** 깊은 합치기. b 가 a 를 덮는다(잎끼리 부딪히면 b). 잎·가지가 부딪히면 잎을 「_」 로 내린다(import-i18n 과 같은 규칙) */
export function deepMerge(a: Messages, b: Messages): Messages {
  const out: Messages = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    if (isObj(cur) && isObj(v)) out[k] = deepMerge(cur, v);
    else if (isObj(cur) && typeof v === "string") out[k] = { ...cur, _: v };
    else if (typeof cur === "string" && isObj(v)) out[k] = { _: cur, ...v };
    else out[k] = v;
  }
  return out;
}

const EXTRA: Record<Locale, Messages> = { ko: extraKo, en: extraEn };

/**
 * 한 언어의 사전 전체(목업 묶음 9개 + 보충 키).
 * 보충 키(messages-extra)는 목업에 없는 키만 채운다 — 목업에 같은 키가 생기면 목업 값이 이긴다.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const parts = await loaders[locale]();
  const { _note: _ignored, ...extra } = EXTRA[locale] as Messages & { _note?: string };
  void _ignored;
  const mock = parts.reduce<Messages>((acc, p) => deepMerge(acc, p), {});
  return deepMerge(extra, mock);
}
