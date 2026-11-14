"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import { fitLevel } from "./fit-level";

/**
 * 머리줄 요소에 data-tf="k" 를 단다. React 상태를 쓰지 않고 DOM 속성만 바꾼다(재는 동안 다시 그리기 없음 — 목업과 같은 방식).
 * 넘침 판정 = 상황 구역(sit)이 제 폭을 넘거나, 머리줄 전체가 넘침.
 */
export function applyFit(el: HTMLElement | null, sit: HTMLElement | null) {
  if (!el) return;
  el.dataset.tf = "0";
  if (!sit || !el.getClientRects().length) return;
  const over = () => sit.scrollWidth > sit.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1;
  const k = fitLevel((lv) => {
    el.dataset.tf = String(lv);
    return over();
  });
  el.dataset.tf = String(k);
}

/** 렌더마다 · 창 크기 · 글꼴 로드 뒤 다시 잰다 */
export function useFitLevel(top: RefObject<HTMLElement | null>, sit: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => applyFit(top.current, sit.current));
  useEffect(() => {
    const fit = () => applyFit(top.current, sit.current);
    let t = 0;
    const on = () => {
      window.clearTimeout(t);
      t = window.setTimeout(fit, 140);
    };
    window.addEventListener("resize", on);
    void document.fonts?.ready.then(fit);
    document.fonts?.addEventListener?.("loadingdone", fit);
    return () => {
      window.removeEventListener("resize", on);
      document.fonts?.removeEventListener?.("loadingdone", fit);
      window.clearTimeout(t);
    };
  }, [top, sit]);
}
