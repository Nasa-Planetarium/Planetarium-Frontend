"use client";

import { LANGS } from "@/shared/i18n";
import type { Locale } from "@/shared/config";
import { useSwitchLocale } from "../model/use-switch-locale";

/* 머리줄 언어 토글(웹만, 프런트 UI/UX 2026-11-15): [KR | ENG] — 지금 언어 칸이 진하게 채워지고, 다른 칸을 누르면 그 언어로 */
const OPTS: { id: Locale; label: string }[] = [
  { id: "ko", label: "KR" },
  { id: "en", label: "ENG" },
];

export function LangButton() {
  const { locale, go } = useSwitchLocale();
  return (
    <div role="group" aria-label="Language / 언어" className="flex h-(--bar-btn) flex-none items-center rounded-sm border border-line-strong p-0.5">
      {OPTS.map((o, k) => {
        const on = o.id === locale;
        const name = LANGS.find((l) => l.id === o.id)?.name ?? o.label;
        return (
          <span key={o.id} className="flex h-full items-center">
            {k ? <i aria-hidden="true" className="mx-px h-3 w-px bg-line-strong" /> : null}
            <button
              type="button"
              lang={o.id}
              aria-pressed={on}
              aria-label={name}
              title={name}
              onClick={() => (on ? undefined : go(o.id))}
              className={`relative grid h-full min-w-9 place-items-center whitespace-nowrap rounded-xs px-2 font-sans text-fs2 font-semibold tracking-wide transition-[background-color,color] duration-(--dur-fast) ease-em hit-after ${
                on ? "cursor-default bg-t1 text-s1" : "bg-transparent text-t2 hover:bg-s3 hover:text-t1"
              }`}
            >
              {o.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
