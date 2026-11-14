"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAgency } from "@/shared/agency";

/**
 * 시나리오 상황(위험지수·기상·시나리오 시계) — 기관 연동 포트에서 받는다(지금은 목, 결정 F4·F5).
 * 머리줄 상황 칸과 계정 메뉴가 같은 값을 읽는다.
 */
export function useSituation() {
  const agency = useAgency();
  return useQuery({ queryKey: ["agency", "situation"], queryFn: () => agency.getSituation(), staleTime: Infinity });
}

/* 30초 간격 경과 시계(목업 paintPass 주기). 렌더 중에 시각을 읽지 않도록 외부 저장소로 둔다 */
const TICK_MS = 30000;
let t0 = 0;
let elapsed = 0;
let timer = 0;
const subs = new Set<() => void>();
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    if (!t0) t0 = performance.now();
    elapsed = performance.now() - t0;
    timer = window.setInterval(() => {
      elapsed = performance.now() - t0;
      subs.forEach((f) => f());
    }, TICK_MS);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
}
const getElapsed = () => elapsed;
const getServerElapsed = () => 0;

/**
 * 화면 시계(epoch ms) = 시나리오 기준점 + 실제 경과(목업 EM.nowMs). 글자는 30초마다 바뀐다.
 * 기준점이 없으면(불러오는 중) null.
 */
export function useNowMs(): number | null {
  const { data } = useSituation();
  const e = useSyncExternalStore(subscribe, getElapsed, getServerElapsed);
  return data ? data.now_ms + e : null;
}
