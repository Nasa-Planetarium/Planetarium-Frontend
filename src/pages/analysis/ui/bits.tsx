"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/shared/i18n";
import { makeRamp } from "../model/core";
import { cx } from "./cx";

/** 토큰 값 읽기(지도·캔버스·PNG 는 CSS 변수를 못 쓴다) */
export const tok = (name: string) => (typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim());

/**
 * 열 램프. 테마가 바뀌면 다시 읽는다.
 * - "h"(기본): --h0..--h6 — 어두운 셸 위 칸(캘린더 연×월 · 분석 달력), 많을수록 밝게.
 * - "mh": --mh0..--mh6 — 밝은 지도 위(점 지도 · 칸 지도 · 전 세계 재생), 많을수록 진하게(F14). 같은 뜻을 바탕 밝기에 맞춰 뒤집은 것.
 */
export function useRamp(prefix: "h" | "mh" = "h") {
  const [stops, setStops] = useState<string[] | null>(null);
  useEffect(() => {
    const read = () => setStops(Array.from({ length: 7 }, (_, i) => tok(`${prefix}${i}`)));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => mo.disconnect();
  }, [prefix]);
  return useMemo(() => (stops ? makeRamp(stops) : null), [stops]);
}

/** 12px 자료 상태 표지(목업 EM.ST_SHAPES) */
const SHAPES: Record<string, React.ReactNode> = {
  nrt: <path d="M6 1.5 10.75 10.5H1.25Z" />,
  partial: <rect x="1.5" y="1.5" width="9" height="9" strokeDasharray="2 1.5" />,
  missing: (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" />
      <path d="M1.5 6 6 1.5M1.5 10.5l9-9M6 10.5 10.5 6" />
    </>
  ),
  low_sample: <circle cx="6" cy="6" r="4.25" />,
  out_of_range: (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" />
      <path d="M1.5 6h9" />
    </>
  ),
};
export function StIcon({ st }: { st: string }) {
  const sh = SHAPES[st];
  if (!sh) return null;
  return (
    <svg className={cx("dst-ic")} data-st={st} viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1">
      {sh}
    </svg>
  );
}
/** 상태 배지(목업 EM.ui.status): ok 는 기본 표지 없음 */
export function Status({ st, ok, word = true }: { st: string | null | undefined; ok?: boolean; word?: boolean }) {
  const t = useT();
  if (!st || (st === "ok" && !ok)) return null;
  const w = t(`shell.st.${st}`);
  return (
    <span className={cx("dst")} data-st={st} title={t(`shell.st_t.${st}`)}>
      <StIcon st={st} />
      {word ? <span className={cx("dst-w")}>{w}</span> : <span className={cx("sr-only")}>{w}</span>}
    </span>
  );
}
/** 판정 낱말(무채, uncertain = 속 빈 원) */
export function Verdict({ v }: { v: string | null | undefined }) {
  const t = useT();
  if (!v) return null;
  return (
    <span className={cx("vd")} data-vd={v}>
      {v === "uncertain" ? <StIcon st="low_sample" /> : null}
      {t(`shell.verdict.${v}`)}
    </span>
  );
}
