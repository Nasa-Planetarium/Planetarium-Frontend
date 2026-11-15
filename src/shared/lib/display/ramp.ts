"use client";

import { useEffect, useState } from "react";

/**
 * 지도 단계 색(표시 규칙서 R4·R6, 2026-11-15). 새 램프 모듈을 만들지 않고 tokens.css 의 열 램프 h 토큰에서 다섯 개만 고른다.
 * 색 값은 #23 이전 체계 그대로다(사용자가 #23 밝은 지도 세부 조정을 되돌림, #34) — 단계 경계 · 범례 · 원 크기만 화면마다 같게 한다.
 * - 모든 지도(점 지도 · 공통 지도 · 세계 재생 · 분석 칸 지도)와 어두운 셸(캘린더 연×월 칸 · 막대 · PNG)이 같은 5색 h1 · h2 · h4 · h5 · h6.
 *   이산 5색이며 보간하지 않는다.
 * - 감지 점: 한 색 h4(= data-viirs, 센서 구분 없음, F10 ④) + map-halo 테두리. 나이는 색이 아니라 불투명도.
 */
export const STEP_TOKENS = ["h1", "h2", "h4", "h5", "h6"] as const;
export const STEP_TOKENS_DARK = STEP_TOKENS;
/** 토큰을 못 읽을 때(서버 렌더 · 시험) 쓰는 값 = tokens.css 의 h 값 */
export const STEP_FALLBACK = ["#512515", "#883429", "#f2742a", "#fbb33a", "#fcf3a8"] as const;
export const DOT_TOKEN = "h4";
export const DOT_EDGE_TOKEN = "map-halo";
/** 산업 열원(합계 제외) 빈 점 · 예측 상시 열원 — 회색(지도 경계선 색) */
export const STATIC_TOKEN = "map-boundary";
/** 칸 원 불투명도 하나(점 유무와 상관없이) */
export const CELL_OPACITY = 0.85;
/** 감지 점 불투명도: 최근 24시간 / 그 앞 */
export const DOT_AGE_OPACITY = [1, 0.55] as const;

/** CSS 변수 값(지도·캔버스는 var() 를 못 쓴다) */
export function tokVal(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/** 지금 테마의 단계 색 5개(밝은 지도용, dark = 어두운 셸용) */
export function readStepColors(dark = false): string[] {
  const toks = dark ? STEP_TOKENS_DARK : STEP_TOKENS;
  return toks.map((n, i) => tokVal(n) || (STEP_FALLBACK[i] as string));
}

/** CSS 에서 쓰는 단계 색(var) */
export const stepVar = (k: number, dark = false) => `var(--${(dark ? STEP_TOKENS_DARK : STEP_TOKENS)[Math.max(0, Math.min(4, k))]})`;

/** 단계 색 5개 — 테마가 바뀌면 다시 읽는다(화면마다 하나씩 두던 useRamp 의 지도 몫) */
export function useStepColors(dark = false): string[] {
  const [c, setC] = useState<string[]>(() => [...STEP_FALLBACK]);
  useEffect(() => {
    const read = () => setC(readStepColors(dark));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => mo.disconnect();
  }, [dark]);
  return c;
}

/** MapLibre 색 식: 속성 k(0–4) → 단계 색 */
export const stepColorExpr = (colors: readonly string[], prop = "k") => ["match", ["get", prop], 0, colors[0], 1, colors[1], 2, colors[2], 3, colors[3], colors[4]] as unknown[];
