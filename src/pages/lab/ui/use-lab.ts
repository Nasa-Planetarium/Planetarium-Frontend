"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useT, type TParams } from "@/shared/i18n";

/** 숫자·날짜 표기(목업 EM.fmt · lab.js n1·ymS·md) */
export function useFmt(kor: boolean) {
  const lang = useLocale();
  return useMemo(() => {
    const nfs = [0, 1, 2, 3].map((d) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d }));
    const cmp = new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 });
    const num = (n: number, d = 0) => (nfs[Math.min(3, Math.max(0, d))] as Intl.NumberFormat).format(n);
    const monthName = (m: number) => new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2023, m - 1, 1)));
    /* 예측·평년·구간 = 소수 한 자리 · 다른 나라의 100 이상은 정수(짝 w 와 같은 자리수) */
    const n1 = (v: number | null | undefined, w?: number | null) => (v == null ? "–" : !kor && Math.max(Math.abs(v), w == null ? 0 : Math.abs(w)) >= 100 ? num(v) : num(v, 1));
    const ymS = (ym: string) => (lang === "ko" ? `${ym.slice(0, 4)}.${ym.slice(5, 7)}` : `${monthName(+ym.slice(5, 7))} ${ym.slice(0, 4)}`);
    const md = (iso: string) => (lang === "ko" ? `${+iso.slice(5, 7)}.${+iso.slice(8, 10)}` : `${monthName(+iso.slice(5, 7))} ${+iso.slice(8, 10)}`);
    const axis = (v: number, lim = 1e4) => (Math.abs(v) < lim ? num(v) : cmp.format(v));
    const month = (m: number) => (lang === "ko" ? `${m}월` : monthName(m));
    return { lang, num, n1, ymS, md, axis, month };
  }, [lang, kor]);
}
export type Fmt = ReturnType<typeof useFmt>;

/** 화면 변수({rw}·{rw1}·{Rw1}·{aoi}·{tz})를 늘 넣어 주는 사전(목업 lab.js T_) */
export function useTv(vars: TParams) {
  const t = useT();
  const key = JSON.stringify(vars);
  return useMemo(() => {
    const v = JSON.parse(key) as TParams;
    return (k: string, p?: TParams) => t(k, p ? { ...v, ...p } : v);
  }, [t, key]);
}

const TOKS = ["text-1", "text-2", "text-3", "line-soft", "line-strong", "surface-0", "data-harm", "data-viirs", "map-void", "map-halo", "cosmo-star", "hatch-bg", "lv-low", "lv-normal", "lv-high", "map-lv-na", "map-lv-low", "map-lv-normal", "map-lv-high", "map-sel", "map-boundary", "fs-1", "fs-2"] as const;
export type Tok = Record<(typeof TOKS)[number], string>;
/** CSS 토큰 값(차트·지도 색). 서버 그리기에서는 null */
export function useTok(): Tok | null {
  const [tok] = useState<Tok | null>(() => {
    if (typeof window === "undefined") return null;
    const cs = getComputedStyle(document.documentElement);
    const o = {} as Tok;
    TOKS.forEach((k) => (o[k] = cs.getPropertyValue(`--${k}`).trim()));
    return o;
  });
  return tok;
}

/** 요소 폭(ResizeObserver) */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

/** 파일 내려받기 — 셸 공용(저장 토스트 「n행」 + 복사) */
export { downloadText } from "@/shared/ui/download";
export function toCSV<T>(rows: T[], cols: { label: string; get: (r: T) => string | number | null | undefined }[]) {
  const q = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(","))].join("\n");
}
