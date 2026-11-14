"use client";

import { LANGS } from "@/shared/i18n";
import { useSwitchLocale } from "../model/use-switch-locale";

/** 머리줄 언어 단추(웹만) — 다른 언어의 자기 이름(「English」 · 「한국어」)을 보여 준다(목업 langBtn, g1fix) */
export function LangButton() {
  const { other, go } = useSwitchLocale();
  const o = LANGS.find((l) => l.id === other);
  return (
    <button
      type="button"
      lang={other}
      aria-label={o?.name}
      title={o?.name}
      onClick={() => go(other)}
      className="relative grid h-(--bar-btn) min-w-(--hit) flex-none place-items-center whitespace-nowrap rounded-sm border border-transparent bg-transparent px-2 font-sans text-fs3 font-medium text-t1 transition-[background-color] duration-(--dur-fast) ease-em hover:bg-s3 hit-after"
    >
      {o?.name}
    </button>
  );
}
