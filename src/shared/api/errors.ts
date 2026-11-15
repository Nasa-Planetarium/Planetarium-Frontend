import type { components } from "./schema";

export type Problem = components["schemas"]["Problem"];
export type ErrorCode = components["schemas"]["ErrorCode"];

/**
 * problem+json 오류. 분기는 문자열 code 로만 한다(여러 error_no 가 같은 code 를 공유 — 설계 §5.4).
 * error_no·request_id 는 표시·보고용.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | "network";
  readonly problem: Problem | null;
  /** 429·503 의 Retry-After(초). 없으면 null */
  readonly retryAfter: number | null;
  constructor(status: number, code: ErrorCode | "network", problem: Problem | null, message?: string, retryAfter: number | null = null) {
    super(message ?? problem?.detail ?? code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.problem = problem;
    this.retryAfter = retryAfter;
  }
}

/** 429 를 기다렸다 다시 할 만큼(밀리초) — Retry-After 를 따르되 1–30 초(실서버는 7–24 초를 줬다 — 잰 것 2026-11-15). 429 가 아니면 null */
export function rateWaitMs(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.status !== 429) return null;
  const ra = e.retryAfter ?? Number(/retry after (\d+(?:\.\d+)?)\s*s/i.exec(e.problem?.detail ?? "")?.[1] ?? NaN);
  return Math.min(30000, Math.max(1000, (Number.isFinite(ra) ? ra : 5) * 1000 + 250));
}

/** 화면 처리 방식 표(설계 §5.4). 화면은 switch 대신 이 표를 읽는다 */
export const ERROR_HANDLING: Record<ErrorCode, "field" | "scope" | "banner" | "layer-off" | "toast" | "locked" | "rollback" | "boundary"> = {
  invalid_param: "field",
  range_too_large: "field",
  polygon_too_complex: "field",
  unknown_aoi: "scope",
  data_not_loaded: "banner",
  upstream_unavailable: "layer-off",
  upstream_error: "layer-off",
  rate_limited: "toast",
  unauthorized: "locked",
  forbidden: "locked",
  csrf_rejected: "locked",
  login_failed: "field",
  not_found: "rollback",
  conflict: "rollback",
  cursor_stale: "rollback",
  release_hash_mismatch: "boundary",
  method_not_allowed: "boundary",
  not_acceptable: "boundary",
  overloaded: "boundary",
  internal: "boundary",
};

/**
 * 무거운 요청(/hotspots · /cells — 실서버 heavy 한도, 약 분당 30 토큰)의 Query 재시도: 429 만 Retry-After 만큼 기다려 3번까지.
 * 다른 4xx(range_too_large 등)는 다시 하지 않는다(화면이 다른 길로 그린다).
 */
export const heavyRetry = (n: number, e: unknown) => n < 3 && rateWaitMs(e) != null;
export const heavyRetryDelay = (_n: number, e: unknown) => rateWaitMs(e) ?? 1000;
