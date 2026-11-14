import type { RoleId } from "@/shared/config";
import type { AuthPort, Session } from "./port";

/**
 * 실제 인증 어댑터 — 자리만 있다(결정 F6: 지금은 예시 로그인). 백엔드가 /api/v1/auth/** 를 만들면 여기를 채운다.
 * 세션 = HttpOnly 쿠키, 변경 요청은 XSRF-TOKEN 쿠키 → X-XSRF-TOKEN 헤더(설계 §3.3).
 */
export class HttpAuthAdapter implements AuthPort {
  readonly kind = "http" as const;
  constructor(private readonly base: string) {}

  private xsrf(): Record<string, string> {
    const v = typeof document !== "undefined" ? /(?:^|; )XSRF-TOKEN=([^;]+)/.exec(document.cookie)?.[1] : undefined;
    return v ? { "X-XSRF-TOKEN": decodeURIComponent(v) } : {};
  }

  async listRoles(): Promise<RoleId[]> {
    return (await this.getSession())?.roles ?? [];
  }
  previewId(): string {
    return "";
  }
  async getSession(): Promise<Session | null> {
    const r = await fetch(`${this.base}/auth/me`, { credentials: "same-origin" });
    if (r.status === 401) return null;
    if (!r.ok) throw new Error(`auth/me ${r.status}`);
    return (await r.json()) as Session;
  }
  async login(input: { role: RoleId; id?: string; password?: string }): Promise<Session> {
    const r = await fetch(`${this.base}/auth/login`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...this.xsrf() },
      body: JSON.stringify({ id: input.id, password: input.password }),
    });
    if (!r.ok) throw new Error(`auth/login ${r.status}`);
    const s = (await r.json()) as Session;
    return s.roles.includes(input.role) ? { ...s, role: input.role } : s;
  }
  async switchRole(role: RoleId): Promise<Session> {
    const s = await this.getSession();
    if (!s || !s.roles.includes(role)) throw new Error("role not granted");
    return { ...s, role };
  }
  async logout(): Promise<void> {
    await fetch(`${this.base}/auth/logout`, { method: "POST", credentials: "same-origin", headers: this.xsrf() });
  }
}
