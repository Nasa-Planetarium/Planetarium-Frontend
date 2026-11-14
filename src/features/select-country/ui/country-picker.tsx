"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dialog as D } from "radix-ui";
import { useLocale } from "next-intl";
import { CONTINENTS, continentOf, countryName, searchCountries, type CountryInfo } from "@/entities/country";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import type { Device } from "@/shared/lib/use-device";
import { Icon, iconButtonClass } from "@/shared/ui";

/**
 * 나라 고르기 창 — 목업 EM.openCountryPicker 그대로.
 * 웹·태블릿 = 칩 아래 폭 360 창(투명 막) · 폰 = 아래 시트(어두운 막). 검색(이름 ko·en·ISO3·ISO2, 악센트 무시) · 최근 3 · 대륙 묶음.
 * 키보드: ↑↓ 로 행 이동(aria-activedescendant), Enter 고름, Esc 닫음. ISO 코드가 없는 항목 5개는 목록에서 뺀다(목업 g1fix).
 * 포커스 가두기·Esc·바깥 누르기 닫기는 Radix Dialog 가 맡는다.
 */
export interface CountryPickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 칩의 화면 위치(누른 순간 잰 값) — 웹·태블릿 창을 칩 아래에 둔다 */
  anchorRect: { left: number; bottom: number } | null;
  device: Device;
  list: CountryInfo[];
  current: string;
  recent: CountryInfo[];
  onPick: (iso3: string) => void;
}

/** 열릴 때마다 새로 그린다(검색어·활성 행 초기화) */
export function CountryPicker(props: CountryPickerProps) {
  return props.open ? <PickerOpen {...props} /> : null;
}

function PickerOpen({ open, onOpenChange, anchorRect, device, list, current, recent, onPick }: CountryPickerProps) {
  const t = useT();
  const lang = useLocale();
  const phone = device === "phone";
  const [q, setQ] = useState("");
  /** 활성 행(null = 지금 나라 행) */
  const [actSel, setAct] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos] = useState(() =>
    !phone && anchorRect ? { left: Math.max(8, Math.min(window.innerWidth - 368, anchorRect.left)), top: Math.round(anchorRect.bottom + 4) } : null,
  );

  const byName = (a: CountryInfo, b: CountryInfo) => countryName(a, lang).localeCompare(countryName(b, lang), lang === "ko" ? "ko-KR" : "en-US");
  const hasIso = (c: CountryInfo) => !!c.iso2;
  const sections = useMemo(() => {
    const f = q.trim();
    if (f) return [{ key: "hit", title: null as string | null, rows: searchCountries(list, f, lang).filter(hasIso).sort(byName) }];
    const out: { key: string; title: string | null; rows: CountryInfo[] }[] = [];
    if (recent.length) out.push({ key: "recent", title: t("shell.country.recent"), rows: recent });
    for (const k of CONTINENTS) {
      const rows = list.filter((c) => hasIso(c) && continentOf(c) === k).sort(byName);
      if (rows.length) out.push({ key: k, title: t(`shell.cont.${k}`), rows });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, list, lang, recent, t]);
  const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  const act = actSel ?? Math.max(0, rows.findIndex((c) => c.iso3 === current));
  useEffect(() => {
    listRef.current?.querySelector(`#cp-o${act}`)?.scrollIntoView({ block: "nearest" });
  }, [act]);

  const pick = (iso3: string) => {
    onOpenChange(false);
    onPick(iso3);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAct(Math.max(0, Math.min(rows.length - 1, act + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && rows[act]) {
      e.preventDefault();
      pick(rows[act].iso3);
    }
  };

  let i = -1;
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={cn("fixed inset-0 z-95", phone ? "bg-(--scrim)" : "bg-transparent")} />
        <D.Content
          aria-label={t("shell.country.title")}
          onOpenAutoFocus={(e) => {
            if (phone) e.preventDefault();
          }}
          onKeyDown={onKey}
          style={!phone && pos ? { left: pos.left, top: pos.top } : undefined}
          className={cn(
            "fixed z-95 flex flex-col overflow-hidden border border-line-strong bg-s2 focus-visible:outline-none",
            phone
              ? "inset-x-0 bottom-0 max-h-[80vh] w-full rounded-t-sheet pb-[env(safe-area-inset-bottom,0px)]"
              : "w-[min(360px,calc(100vw-16px))] max-h-[min(560px,calc(100vh-80px))] rounded-md",
          )}
        >
          <D.Title className="sr-only">{t("shell.country.title")}</D.Title>
          <D.Description className="sr-only">{t("shell.country.search")}</D.Description>
          <div className="flex items-center gap-2 border-b border-line-soft p-2">
            <input
              type="search"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("shell.country.search")}
              placeholder={t("shell.country.search")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAct(null);
              }}
              className="h-(--hit) min-w-0 flex-1 rounded-sm border border-line-strong bg-s0 px-3 text-fs3 text-t1 transition-[border-color] duration-(--dur-fast) ease-em focus:border-t2 focus-visible:outline-(length:--ring-w) focus-visible:outline-(--focus-ring) focus-visible:outline-offset-0"
            />
            <D.Close className={iconButtonClass} aria-label={t("shell.act.close")}>
              <Icon name="x" size="nav" />
            </D.Close>
          </div>
          <div
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-label={t("shell.country.title")}
            aria-activedescendant={rows[act] ? `cp-o${act}` : undefined}
            className="min-h-0 flex-1 overflow-auto overscroll-contain"
          >
            {rows.length === 0 ? <p className="m-0 p-4 text-fs3 text-t2">{t("shell.country.none")}</p> : null}
            {sections.map((s) => (
              <div key={s.key} role="presentation">
                {s.title ? (
                  <div role="presentation" className="sticky top-0 z-1 flex items-center justify-between gap-2 bg-s2 px-3 py-2">
                    <h3 className="text-fs2 font-strong text-t2">{s.title}</h3>
                    <span className="mono text-fs2 text-t3">{s.rows.length}</span>
                  </div>
                ) : null}
                {s.rows.map((c) => {
                  i++;
                  const idx = i;
                  const sel = c.iso3 === current;
                  return (
                    <button
                      key={`${s.key}-${c.iso3}`}
                      type="button"
                      role="option"
                      id={`cp-o${idx}`}
                      aria-selected={sel}
                      onClick={() => pick(c.iso3)}
                      className={cn(
                        "grid w-full min-h-(--hit) grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-0 border-b border-line-soft bg-transparent px-3 py-1 text-left text-fs3 text-t1 hover:bg-s3",
                        idx === act && "bg-s3",
                      )}
                    >
                      <span className={cn("mono min-w-[3.2em] text-fs2", sel ? "text-t1" : "text-t2")}>{c.iso3}</span>
                      <span className={cn("[overflow-wrap:anywhere]", sel && "font-strong")}>{countryName(c, lang)}</span>
                      <span className="mono text-fs2 text-t2" title={t("data.aoi.country_note", { n: c.n1 })}>
                        {c.n1}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
