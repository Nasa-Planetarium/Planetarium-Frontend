import type { AgencyPort, Alert, CommandStats, DispatchResult, Fire, Parcel, Situation, Unit } from "./port";

/**
 * 실제 기관 API 어댑터 — 자리만 있다(결정 F5: 백엔드는 /api/v1/agency/** 를 예약만 하고 구현하지 않음).
 * 기관 API 가 생기면 경로·모양을 여기서 맞추고 NEXT_PUBLIC_AGENCY_ADAPTER=http 로 바꾼다. 화면 코드는 그대로.
 * 쓰기 요청은 세션 쿠키 + CSRF 헤더(X-XSRF-TOKEN)를 붙인다(보안 조사 — 백엔드 결정 대기).
 */
export class HttpAgencyAdapter implements AgencyPort {
  readonly kind = "http" as const;
  constructor(private readonly base: string) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const xsrf = typeof document !== "undefined" ? /(?:^|; )XSRF-TOKEN=([^;]+)/.exec(document.cookie)?.[1] : undefined;
    const r = await fetch(`${this.base}/agency${path}`, {
      credentials: "same-origin",
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}), ...init?.headers },
    });
    if (!r.ok) throw new Error(`agency ${path} ${r.status}`);
    return (await r.json()) as T;
  }

  getSituation() {
    return this.req<Situation>("/situation");
  }
  listAlerts() {
    return this.req<Alert[]>("/alerts");
  }
  listFires() {
    return this.req<Fire[]>("/fires");
  }
  listUnits() {
    return this.req<Unit[]>("/units");
  }
  dispatchUnit(unitId: string, fireId: string) {
    return this.req<DispatchResult>(`/units/${encodeURIComponent(unitId)}/dispatch`, { method: "POST", body: JSON.stringify({ fire_id: fireId }) });
  }
  recallUnit(unitId: string) {
    return this.req<Unit>(`/units/${encodeURIComponent(unitId)}/recall`, { method: "POST" });
  }
  listParcels(fireId: string) {
    return this.req<Parcel[]>(`/fires/${encodeURIComponent(fireId)}/parcels`);
  }
  getCommandStats() {
    return this.req<CommandStats>("/command-stats");
  }
}
