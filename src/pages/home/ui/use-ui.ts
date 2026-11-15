"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { shellRamp } from "@/shared/lib/display";

/** 숫자·날짜 표기(목업 EM.fmt) */
export function useFmt() {
  const lang = useLocale();
  return useMemo(() => {
    const nfs = new Map<number, Intl.NumberFormat>();
    const nf = (d: number) => {
      let f = nfs.get(d);
      if (!f) nfs.set(d, (f = new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })));
      return f;
    };
    const cmp = new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 });
    const num = (n: number, d = 0) => nf(d).format(n);
    const axis = (v: number, lim = 1e4) => (Math.abs(v) < lim ? num(v) : cmp.format(v));
    const monthName = (m: number, style: "short" | "long" | "narrow" = "short") =>
      new Intl.DateTimeFormat(lang, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2023, m - 1, 1)));
    const month = (m: number) => (lang === "ko" ? `${m}월` : monthName(m, "short"));
    const ym = (y: number, m: number) => (lang === "ko" ? `${y}년 ${m}월` : `${monthName(m, "short")} ${y}`);
    const md = (m: number, d: number) => (lang === "ko" ? `${m}월 ${d}일` : `${monthName(m, "short")} ${d}`);
    /** 배수 「290.9배」(목업 EM.fmt.ratio) */
    const ratio = (r: number) => (lang === "ko" ? `${num(r, 1)}배` : `${num(r, 1)}×`);
    return { lang, num, axis, month, monthName, ym, md, ratio };
  }, [lang]);
}
export type Fmt = ReturnType<typeof useFmt>;

const TOKS = [
  "text-1",
  "text-2",
  "text-3",
  "line-soft",
  "line-strong",
  "surface-0",
  "accent",
  "data-modis",
  "data-viirs",
  "data-harm",
  "data-base",
  "data-zero",
  "on-warm",
  "hatch-bg",
  "h0",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "cosmo-tick",
  "cosmo-label",
  "cosmo-orbit",
  "map-void",
  "map-halo",
  "surface-1",
  "alert-1",
  "alert-2",
  "alert-3",
  "alert-4",
  "data-unit-standby",
  "data-unit-return",
] as const;
export type Tok = Record<(typeof TOKS)[number], string>;

/** CSS 토큰 값(차트 색 · 열 램프). 서버 그리기에서는 null → 붙은 뒤 다시 그린다 */
export function useTok() {
  /* 화면 본문은 주소를 읽는 경계(Suspense) 안에서 브라우저에서만 그려지므로 처음 읽기로 충분하다(서버 그리기에서는 null) */
  const [tok] = useState<Tok | null>(() => {
    if (typeof window === "undefined") return null;
    const cs = getComputedStyle(document.documentElement);
    const o = {} as Tok;
    TOKS.forEach((k) => (o[k] = cs.getPropertyValue(`--${k}`).trim()));
    return o;
  });
  const ramp = useMemo(() => (tok ? shellRamp([tok.h0, tok.h1, tok.h2, tok.h3, tok.h4, tok.h5, tok.h6]) : () => "#000"), [tok]);
  return { tok, ramp };
}

/** 요소 폭·높이(ResizeObserver) */
export function useSize<T extends HTMLElement>(): [(el: T | null) => void, number, number] {
  const [el, setEl] = useState<T | null>(null);
  const [wh, setWh] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWh([Math.round(el.clientWidth), Math.round(el.clientHeight)]));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, wh[0], wh[1]];
}

/** 파일 내려받기 — 셸 공용(저장 토스트: CSV 「n행」 + 복사 · PNG 「W × H PNG」) */
export { downloadBlob as download } from "@/shared/ui/download";
export function toCSV<T>(rows: T[], cols: { label: string; get: (r: T) => string | number | null | undefined }[]) {
  const q = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(","))].join("\n");
}
