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
