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
 * 시나리오 시계(epoch ms) = 시나리오 기준점 + 실제 경과(목업 EM.nowMs). 글자는 30초마다 바뀐다.
 * 경보·출동 한국 시나리오(목)에서만 쓴다 — 실제 자료 화면에 시나리오 날짜·시각이 「실시간」으로 보이면 안 된다.
 * 기준점이 없으면(불러오는 중) null.
 */
export function useScenarioNowMs(): number | null {
  const { data } = useSituation();
  const e = useSyncExternalStore(subscribe, getElapsed, getServerElapsed);
  return data ? data.now_ms + e : null;
}

/* 벽시계: 구독할 때와 30초마다 Date.now() 를 읽는다(렌더 중에는 읽지 않는다). 서버 렌더·구독 전은 null */
let wall = 0;
function subscribeWall(cb: () => void) {
  wall = Date.now();
  const id = window.setInterval(() => {
    wall = Date.now();
    cb();
  }, TICK_MS);
  return () => window.clearInterval(id);
}
const getWall = () => (wall ? wall : null);
const getServerWall = () => null;

/** 실제 시계(epoch ms) — 실제 /api/v1 자료 화면(머리줄 시계·지난 24시간 감지)이 쓴다. 30초마다 바뀐다 */
export function useNowMs(): number | null {
  return useSyncExternalStore(subscribeWall, getWall, getServerWall);
}

/** 시나리오 화면이면 시나리오 시계, 아니면 실제 시계 */
export function useClockMs(scenario: boolean): number | null {
  const s = useScenarioNowMs();
  const w = useNowMs();
  return scenario ? s : w;
}
