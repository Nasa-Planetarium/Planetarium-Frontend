"use client";

import { useSyncExternalStore } from "react";
import { initialUi, type LandUi } from "./land";

/**
 * 화면을 떠나도 남는 피해 면적 화면 상태(목업 land.js 모듈 안 S 와 같은 수명 — 새로 고치면 처음으로).
 * 원장 값이 아니라 사용자 행동(단계 넘김·필지 고르기·우선순위·요청)만 둔다.
 */
let state: LandUi = initialUi();
const subs = new Set<() => void>();

export const landStore = {
  get: () => state,
  set(fn: (s: LandUi) => LandUi) {
    state = fn(state);
    subs.forEach((f) => f());
  },
  reset() {
    state = initialUi();
    subs.forEach((f) => f());
  },
};

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => subs.delete(cb);
};
const getServer = () => state;

export function useLandUi(): LandUi {
  return useSyncExternalStore(subscribe, landStore.get, getServer);
}
