import type { RoleId } from "@/shared/config";

/**
 * 인증 포트(AuthPort) — 결정 F6: 로그인은 예시(목)이고 역할을 고를 수 있다. 실제 인증 없음(백엔드 S1 = 공개 읽기만).
 * 지금 구현: 목 어댑터(src/shared/mock/auth). 실제 인증이 생기면 ./http-auth-adapter.ts 를 채우고
 * NEXT_PUBLIC_AUTH_ADAPTER=http 한 줄로 바꾼다(설계: /api/v1/auth/me · /login · /logout, 세션 쿠키 + CSRF).
 * 서버는 화면이 고른 역할을 믿지 않는다 — 역할 잠금은 표시일 뿐, 실제 경계는 백엔드다.
 */
export interface Session {
  /** 로그인 아이디(목: <역할>.01@emberline.kr — 목업과 같음) */
  id: string;
  /** 지금 고른 역할 */
  role: RoleId;
  /** 이 계정이 가진 역할들(목: 전부) */
  roles: RoleId[];
}

export interface AuthPort {
  readonly kind: "mock" | "http";
  /** 로그인 화면이 보여 줄 역할 목록(목: 다섯 역할 전부) */
  listRoles(): Promise<RoleId[]>;
  /** 로그인 화면의 읽기 전용 아이디 미리보기(목) */
  previewId(role: RoleId): string;
  getSession(): Promise<Session | null>;
  login(input: { role: RoleId; id?: string; password?: string }): Promise<Session>;
  switchRole(role: RoleId): Promise<Session>;
  logout(): Promise<void>;
}
