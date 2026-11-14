/**
 * 빌드 때 박히는 설정(NEXT_PUBLIC_*). 어댑터 교체는 이 값 한 줄로 한다 — `.env.example` 참고.
 * 값이 틀리면 기본값으로 떨어지지 않고 빌드 시점에 알 수 있게 에러를 던진다.
 */
const pick = <T extends string>(name: string, raw: string | undefined, allowed: readonly T[], fallback: T): T => {
  const v = (raw ?? "").trim();
  if (!v) return fallback;
  if ((allowed as readonly string[]).includes(v)) return v as T;
  throw new Error(`${name}=${v} — 허용 값: ${allowed.join(" | ")}`);
};

/** 실제 데이터: msw = 브라우저 MSW 가 public/data 스냅숏으로 응답 · http = 실제 백엔드 */
export const DATA_MODE = pick("NEXT_PUBLIC_DATA_MODE", process.env.NEXT_PUBLIC_DATA_MODE, ["msw", "http"] as const, "msw");
/** 실제 백엔드 기준 경로(같은 출처면 /api/v1) */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE?.trim() || "/api/v1";
/** 기관 연동(ops·land·cmd·시나리오) 어댑터: mock = 목 원장 · http = /api/v1/agency/**(예약, 미구현) */
export const AGENCY_ADAPTER = pick("NEXT_PUBLIC_AGENCY_ADAPTER", process.env.NEXT_PUBLIC_AGENCY_ADAPTER, ["mock", "http"] as const, "mock");
/** 로그인 어댑터: mock = 예시 로그인 + 역할 선택 · http = /api/v1/auth/**(미구현) */
export const AUTH_ADAPTER = pick("NEXT_PUBLIC_AUTH_ADAPTER", process.env.NEXT_PUBLIC_AUTH_ADAPTER, ["mock", "http"] as const, "mock");
