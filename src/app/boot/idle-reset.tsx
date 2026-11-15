"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { clearUserState } from "@/shared/lib/prefs";

/**
 * 무조작 자동 초기화 시간(한 곳). 같은 탭을 다음 사람이 이어 쓰는 경우 대비(발표장·심사장).
 * 시험은 이 값을 바꾸지 않고 Playwright 시계(page.clock)로 시간을 당긴다 — e2e/session-state.spec.ts.
 */
export const IDLE_RESET_MS = 10 * 60 * 1000;
/** 검사 주기 — 초기화가 IDLE_RESET_MS 보다 최대 이만큼 늦을 수 있다 */
const CHECK_MS = 5000;
/**
 * 「입력」으로 세는 것: 사람의 포인터·키·터치·휠(스크롤)만. scroll 이벤트는 넣지 않는다 —
 * 자동 갱신·지도 재생이 일으키는 프로그램 스크롤까지 입력으로 세지 않게(사람 스크롤은 wheel·touchmove·키·스크롤바 pointerdown 으로 잡힌다).
 */
const INPUT = ["pointerdown", "pointermove", "keydown", "touchstart", "touchmove", "wheel"] as const;

/**
 * 입력 없이 IDLE_RESET_MS 가 지나면 이 탭의 em.* 를 지우고 공개 첫 화면(/<언어>/calendar/, 로그인 해제)으로 조용히 돌린다(안내 없음).
 * 이미 첫 화면·빈 상태면 아무것도 하지 않는다(10분마다 다시 불러오지 않게). 전체 다시 불러오기라 메모리 상태(조회 캐시 등)도 비워진다.
 */
export function IdleReset() {
  const locale = useLocale();
  useEffect(() => {
    let last = Date.now();
    const mark = () => {
      last = Date.now();
    };
    const opts = { capture: true, passive: true } as const;
    for (const e of INPUT) window.addEventListener(e, mark, opts);
    const id = window.setInterval(() => {
      if (Date.now() - last < IDLE_RESET_MS) return;
      last = Date.now();
      const home = `/${locale}/calendar/`;
      const removed = clearUserState();
      if (removed === 0 && window.location.pathname === home && !window.location.search && !window.location.hash) return;
      window.location.replace(home);
    }, CHECK_MS);
    return () => {
      window.clearInterval(id);
      for (const e of INPUT) window.removeEventListener(e, mark, opts);
    };
  }, [locale]);
  return null;
}
