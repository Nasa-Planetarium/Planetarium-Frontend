import type { Level } from "./level";

/**
 * 지도 문구 키(표시 규칙서 R7·R8·R11, 2026-11-15). 화면별 문구 · 시험대 문구 대신 단계마다 하나.
 * 사전: messages-extra/{ko,en}.json 의 map.level.* · map.key.* · map.status.*
 */
export const LEVEL_KEY: Record<Level | "fixed", string> = {
  L1: "map.level.L1",
  L2: "map.level.L2",
  L3: "map.level.L3",
  L4: "map.level.L3",
  fixed: "map.level.fixed",
};
/** 범례 「지금 단계」 줄 */
export const KEY_LEVEL: Record<Level, string> = {
  L1: "map.key.lv.L1",
  L2: "map.key.lv.L2",
  L3: "map.key.lv.L3",
  L4: "map.key.lv.L4",
};
export type MapStatusKind = "loading" | "empty" | "no_data" | "error" | "mismatch" | "fixed";
export const STATUS_KEY: Record<MapStatusKind, string> = {
  loading: "map.status.loading",
  empty: "map.status.empty",
  no_data: "map.status.no_data",
  error: "map.status.error",
  mismatch: "map.status.mismatch",
  fixed: "map.level.fixed",
};
/** 달 상태 꼬리(month_status) */
export const TAIL_KEY: Record<string, string | undefined> = {
  partial: "map.status.partial",
  nrt: "map.status.nrt",
};
