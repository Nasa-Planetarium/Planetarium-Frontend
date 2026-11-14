/**
 * 기관 연동 포트(AgencyPort) — 경보·출동·자원·필지·지휘 통계·시나리오 상황(위험지수·기상·시계).
 *
 * 결정 F4·F5: 소방·응급(ops·land·cmd·경북 실시간 시나리오)은 「정부기관과 협업한다면 이렇게」를 보여 주는 목(mock)이다.
 * 화면은 이 인터페이스만 안다. 지금 구현은 목 어댑터(src/shared/mock/agency) 하나이고,
 * 실제 기관 API 가 생기면 http 어댑터(./http-agency-adapter.ts)를 채우고 NEXT_PUBLIC_AGENCY_ADAPTER=http 한 줄로 바꾼다.
 * 백엔드 자리: /api/v1/agency/** (예약만, 미구현 — 결정 F5).
 *
 * 모양은 목업 data.js 원장(EM.bundle.internal.ledger)의 필드 이름을 그대로 쓴다(이식 비용 0, 실제 API 가 오면 여기를 맞춘다).
 */

export type AlertLevel = 1 | 2 | 3 | 4;
export type AlertStatus = "new" | "ack" | "dispatched" | "onscene" | "contained" | "out" | "resolved";
export type UnitStatus = "standby" | "enroute" | "onscene" | "return";

export interface Fire {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  detected_at: string;
  status: AlertStatus;
  level: AlertLevel | 0;
  viirs: number;
  modis: number;
  frp_max: number;
  historical?: boolean;
  [k: string]: unknown;
}

export interface Alert {
  id: string;
  fire_id: string;
  at: string;
  level: AlertLevel;
  title: string;
  body?: string;
  status: AlertStatus;
  targets: string[];
  [k: string]: unknown;
}

export interface Unit {
  id: string;
  type: string;
  name: string;
  org: string;
  lat: number;
  lon: number;
  status: UnitStatus;
  crew?: number;
  [k: string]: unknown;
}

export interface Parcel {
  id: string;
  fire_id: string;
  [k: string]: unknown;
}

export interface Weather {
  station: string;
  temp_c: number;
  rh: number;
  effective_rh: number;
  wind: string;
  wind_deg: number;
  wind_ms: number;
}

export interface RiskIndex {
  value: number;
  /** 단계 1–4(낮음·보통·높음·매우 높음) — 사전 shell.risk.<level> */
  level: 1 | 2 | 3 | 4;
  label: string;
  basis: string;
}

/** 머리줄 상황 칸·계정 메뉴가 읽는 시나리오 상황 */
export interface Situation {
  /** 시나리오 시계 기준점(epoch ms). 화면 시계 = 이 값 + 실제 경과(목업 EM.nowMs) */
  now_ms: number;
  /** 시나리오 시계 시간대(한국 = Asia/Seoul) */
  tz: string;
  weather: Weather;
  risk_index: RiskIndex;
  season: string;
}

export interface CommandStats {
  fires_live: number;
  alerts_new: number;
  units_busy: number;
  units_ready: number;
}

export interface DispatchResult {
  unit: Unit;
  alert: Alert | null;
}

export interface AgencyPort {
  /** 어댑터 이름(화면 표시 금지 — 개발 확인용) */
  readonly kind: "mock" | "http";
  getSituation(): Promise<Situation>;
  listAlerts(): Promise<Alert[]>;
  listFires(): Promise<Fire[]>;
  listUnits(): Promise<Unit[]>;
  /** 출동: 자원 하나를 불 하나에 보낸다 */
  dispatchUnit(unitId: string, fireId: string): Promise<DispatchResult>;
  /** 귀소 */
  recallUnit(unitId: string): Promise<Unit>;
  /** 피해 면적 필지(land) */
  listParcels(fireId: string): Promise<Parcel[]>;
  /** 지휘 통계(cmd) 요약 */
  getCommandStats(): Promise<CommandStats>;
}
