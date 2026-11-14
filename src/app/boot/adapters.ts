/**
 * 조립 지점(composition root) — 어느 어댑터를 쓸지 정하는 유일한 곳.
 * 목 모듈(src/shared/mock/**)을 import 해도 되는 파일은 여기 하나뿐이다(check-isolation).
 *
 * 교체 = .env 한 줄:
 *   NEXT_PUBLIC_AGENCY_ADAPTER=mock|http   기관 연동(ops·land·cmd·시나리오)
 *   NEXT_PUBLIC_AUTH_ADAPTER=mock|http     로그인
 * 새 어댑터 = 파일 하나 + 아래 표 한 줄(기존 코드 수정 없음).
 */
import { HttpAgencyAdapter, type AgencyPort } from "@/shared/agency";
import { HttpAuthAdapter, type AuthPort } from "@/shared/auth";
import { MockAgencyAdapter, MockAuthAdapter } from "@/shared/mock";
import { AGENCY_ADAPTER, API_BASE, AUTH_ADAPTER } from "@/shared/config";

const AGENCY: Record<typeof AGENCY_ADAPTER, () => AgencyPort> = {
  mock: () => new MockAgencyAdapter(),
  http: () => new HttpAgencyAdapter(API_BASE),
};

const AUTH: Record<typeof AUTH_ADAPTER, () => AuthPort> = {
  mock: () => new MockAuthAdapter(),
  http: () => new HttpAuthAdapter(API_BASE),
};

export const createAgencyPort = (): AgencyPort => AGENCY[AGENCY_ADAPTER]();
export const createAuthPort = (): AuthPort => AUTH[AUTH_ADAPTER]();
