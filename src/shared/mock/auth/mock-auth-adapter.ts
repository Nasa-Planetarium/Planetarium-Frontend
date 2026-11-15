/**
 * 예시 로그인 목 어댑터(결정 F6). 비밀번호·서버 없음 — 역할만 고르면 그 역할 탭이 열린다(목업 EM.login 그대로).
 * 고른 역할은 브라우저 sessionStorage 「em.role」 에만 둔다(목업과 같은 키 · shared/lib/prefs) — 탭을 닫으면 로그아웃, 다음 사람에게 남지 않는다. 실제 권한이 아니다.
 *
 * ⚠ 격리 규칙(F5·F6): 조립 지점(src/app/boot/adapters.ts)만 이 폴더를 import 한다.
 */
import { ROLE_IDS, type RoleId } from "@/shared/config";
import { prefs } from "@/shared/lib/prefs";
import type { AuthPort, Session } from "../../auth/port";

const isRole = (v: unknown): v is RoleId => typeof v === "string" && (ROLE_IDS as readonly string[]).includes(v);

const read = (): RoleId | null => {
  const v = prefs.get("role");
  return isRole(v) ? v : null;
};
/** 저장이 막히면 새로 고칠 때 로그아웃 상태(prefs 가 삼킨다) */
const write = (v: RoleId | null) => prefs.set("role", v);

export class MockAuthAdapter implements AuthPort {
  readonly kind = "mock" as const;
  private session = (role: RoleId): Session => ({ id: this.previewId(role), role, roles: [...ROLE_IDS] });

  listRoles() {
    return Promise.resolve([...ROLE_IDS]);
  }
  previewId(role: RoleId) {
    return `${role}.01@emberline.kr`;
  }
  getSession() {
    const r = read();
    return Promise.resolve(r ? this.session(r) : null);
  }
  login({ role }: { role: RoleId }) {
    write(role);
    return Promise.resolve(this.session(role));
  }
  switchRole(role: RoleId) {
    write(role);
    return Promise.resolve(this.session(role));
  }
  logout() {
    write(null);
    return Promise.resolve();
  }
}
