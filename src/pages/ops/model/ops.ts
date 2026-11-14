/**
 * 경보·출동(ops) 화면 모델 — 목업 pages/ops.js · mock/agency.js 의 수신함·단계·출동·근거 규칙을 순수 함수로.
 * 데이터는 AgencyPort(listAlerts · listFires · listUnits)에서만 온다. 원장 값 위에 사용자 행동(확인·단계·출동…)을 덧씌운 「세계」를 읽는다.
 * 분기는 맵·처리기(switch 금지).
 */
import type { Alert, AlertLevel, AlertStatus, Fire, Unit, UnitStatus } from "@/shared/agency";

export type Role = "responder" | "firefighter";
export type ConfClass = "low" | "nominal" | "high";
export const CONF_CLASSES: ConfClass[] = ["low", "nominal", "high"];

export interface PassRow {
  sat: string;
  sensor: "VIIRS" | "MODIS";
  at: string;
}
export interface Village {
  name: string;
  homes: number;
  lat: number;
  lon: number;
}
export interface LogRow {
  at: string;
  /** 사전 키(지금 언어로 그릴 때 읽는다) 또는 원장 경보 제목 */
  text: { key: string; params?: Record<string, string | number> } | { title: string };
  /** 누가: 위성 · 역할 · 자동(AVL) */
  by: "satellite" | "avl" | Role | "system";
}

export interface OpsAlert extends Alert {
  dispatch_req?: string;
  evac_at?: string;
  level_at?: string;
  ack_at?: string;
  viirs?: number;
  modis?: number;
  frp_max?: number;
  log: LogRow[];
  passes: PassRow[];
  unread0: string[];
}
export interface OpsFire extends Fire {
  spread?: string;
  reported?: boolean;
  contained_at?: string;
  burned_ha?: number | null;
  current?: boolean;
  by_region?: Record<string, number>;
  villages: Village[];
  points: { viirs: ConfClass[]; modis: ConfClass[] };
  fixed: { type: 2 | 3; conf: ConfClass; date: string }[];
}
export interface OpsUnit extends Unit {
  crew: number;
  fire_id?: string | null;
  home: { lat: number; lon: number };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** 포트 행(자유 필드 ops) → 화면 행. 모르는 모양이면 빈 값 */
export function readAlert(a: Alert): OpsAlert {
  const o = obj(a.ops);
  return {
    ...a,
    log: arr<{ at: string }>(o.log).map((l) => ({ at: l.at, text: { title: a.title }, by: "satellite" as const })),
    passes: arr<PassRow>(o.passes),
    unread0: arr<string>(o.unread),
  };
}
export function readFire(f: Fire): OpsFire {
  const o = obj(f.ops);
  const pts = obj(o.points);
  return {
    ...f,
    villages: arr<Village>(o.villages),
    points: { viirs: arr<ConfClass>(pts.viirs), modis: arr<ConfClass>(pts.modis) },
    fixed: arr(o.fixed),
  } as OpsFire;
}
export function readUnit(u: Unit): OpsUnit {
  const h = obj(u.home);
  return {
    ...u,
    crew: typeof u.crew === "number" ? u.crew : 0,
    fire_id: typeof u.fire_id === "string" ? u.fire_id : null,
    home: typeof h.lat === "number" && typeof h.lon === "number" ? { lat: h.lat, lon: h.lon } : { lat: u.lat, lon: u.lon },
  };
}

/* ── 상태 ── */
const CLOSED: AlertStatus[] = ["contained", "out", "resolved"];
export const isClosed = (s: string) => (CLOSED as string[]).includes(s);
export type TabId = "open" | "active" | "closed";
export const TABS: { id: TabId; label: string; has: (s: string) => boolean }[] = [
  { id: "open", label: "ops.is_closed.unhandled", has: (s) => s === "new" },
  { id: "active", label: "ops.is_closed.active", has: (s) => s === "ack" || s === "dispatched" || s === "onscene" },
  { id: "closed", label: "ops.tab.closed", has: isClosed },
];
export const tabOf = (a: Pick<Alert, "status">): TabId => (TABS.find((t) => t.has(a.status)) ?? TABS[2]!).id;
export const STEPS = ["ops.tab_of.new", "ops.step.ack", "ops.off.k.dispatched", "ops.tab_of.on_scene", "ops.contain.verb"] as const;
const STEP_IDX: Record<string, number> = { new: 0, ack: 1, dispatched: 2, onscene: 3 };
export const stepIdx = (s: string) => STEP_IDX[s] ?? 4;

/** 원장 방위 → 각도 */
export const DIRS: Record<string, number> = { 북: 0, 북동: 45, 동: 90, 남동: 135, 남: 180, 남서: 225, 서: 270, 북서: 315 };
export const UNIT_ICON: Record<string, "heli" | "users" | "command" | "truck"> = { heli: "heli", crew: "users", command: "command" };

/* ── 시각 ── */
/** 원장 시계 "HH:MM" 와 경보 시각 "HH:MM" 사이 분(「어제 …」·미래는 null) */
export function minsSince(at: string, clock: string): number | null {
  if (!/^\d\d:\d\d$/.test(at || "")) return null;
  const [h, m] = at.split(":").map(Number) as [number, number];
  const [ch, cm] = clock.split(":").map(Number) as [number, number];
  const d = ch * 60 + cm - (h * 60 + m);
  return d < 0 ? null : d;
}
/** 시나리오 시계(epoch ms) → 그 시간대 "HH:MM" */
export function hmOf(ms: number, offsetMin: number): string {
  const d = new Date(ms + offsetMin * 60000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
export const utcHM = (ms: number) => `${new Date(ms).toISOString().slice(11, 16)}Z`;
export const YDAY = "어제 ";

/* ── 거리·도착 예상(목업 mock/agency.js EM.distanceKm · EM.etaMin) ── */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const SPEED: Record<string, number> = { heli: 200, crew: 35 };
export function etaMin(u: Pick<Unit, "type" | "lat" | "lon">, f: { lat: number; lon: number }): number {
  const d = distanceKm(u, f);
  const heli = u.type === "heli";
  const v = SPEED[u.type] ?? 45;
  return Math.max(2, Math.round(((d * (heli ? 1 : 1.35)) / v) * 60 + (heli ? 6 : 2)));
}
export const kmBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180));

/** 대기 자원을 가까운 순으로(목업 units4) */
export function units4(units: OpsUnit[], f: { lat: number; lon: number }) {
  return units
    .filter((u) => u.status === "standby")
    .map((u) => ({ u, d: distanceKm(u, f), eta: etaMin(u, f) }))
    .sort((x, y) => x.d - y.d);
}
/** 불에 지금 투입된 자원 수(이동 중 + 현장) */
export const deployed = (units: OpsUnit[], f: { id: string } | undefined) =>
  f ? units.filter((u) => u.fire_id === f.id && (u.status === "enroute" || u.status === "onscene")).length : 0;

/** 경보 시점 관측 점(목업 EM.alertSnap): 경보 값 → 대체된 경보면 없음 → 불의 지금 값. alerts = 원장 순(앞이 새것) */
export function alertSnap(a: OpsAlert, alerts: OpsAlert[], f: OpsFire | undefined): { pts: number | null } {
  if (a.viirs != null || a.modis != null) return { pts: (a.viirs ?? 0) + (a.modis ?? 0) };
  const i = alerts.findIndex((x) => x.id === a.id);
  const newer = alerts.some((x, j) => x.id !== a.id && x.fire_id === a.fire_id && i >= 0 && j < i);
  if (newer) return { pts: null };
  return { pts: f ? (f.viirs ?? 0) + (f.modis ?? 0) : null };
}

/** 머리 개수 띠(목업 EM.counts("ops")) — 원장 전체 경보·자원에서 센다 */
export function counts(alerts: OpsAlert[], units: OpsUnit[]) {
  const fresh = alerts.filter((a) => a.status === "new");
  const work = alerts.filter((a) => a.status === "ack" || a.status === "dispatched" || a.status === "onscene");
  return [
    { key: "new", label: "shell.count.new", value: fresh.length, lv: fresh.reduce((m, a) => Math.max(m, a.level || 0), 0) },
    { key: "work", label: "shell.count.work", value: work.length, lv: 0 },
    { key: "busy", label: "shell.count.busy", value: units.filter((u) => u.status === "enroute" || u.status === "onscene").length, lv: 0 },
    { key: "ready", label: "shell.count.ready", value: units.filter((u) => u.status === "standby").length, lv: 0 },
  ];
}
export const CNT_GRP: Record<string, TabId> = { new: "open", work: "active" };

/** 감지 근거 개수(신뢰도 거르기): 전체면 원장 값, 거르면 그 불 관측 점을 등급으로 센다 */
export function evidenceCounts(f: OpsFire, conf: ConfClass[] | null) {
  const allPts = f.points.viirs.length + f.points.modis.length;
  const keep = (c: ConfClass) => !conf || conf.includes(c);
  const nV = conf && allPts ? f.points.viirs.filter(keep).length : f.viirs;
  const nM = conf && allPts ? f.points.modis.filter(keep).length : f.modis;
  const fx = f.fixed.filter((p) => keep(p.conf));
  return { nV, nM, fixed: fx.filter((p) => p.type === 2).length, sea: fx.filter((p) => p.type === 3).length };
}
/** 신뢰도 고르기 정규화(목업 EM.confSel): 비었거나 셋 다면 전체(null) */
export function confSel(v: ConfClass[] | null): ConfClass[] | null {
  if (!v || !v.length) return null;
  const s = CONF_CLASSES.filter((k) => v.includes(k));
  return !s.length || s.length === CONF_CLASSES.length ? null : s;
}
export function confToggle(cur: ConfClass[] | null, k: ConfClass): ConfClass[] | null | false {
  const c = cur ?? CONF_CLASSES.slice();
  const next = c.includes(k) ? c.filter((x) => x !== k) : [...c, k];
  if (!next.length) return false;
  return confSel(next);
}

/** 경보 본문에서 위 표가 이미 보인 수치 문장은 빼고 판단 문장만(목업 bodyNote) */
const BODY_SKIP = /VIIRS|MODIS|FRP|확산 방향|풍속|마을|spread|wind|village/i;
export const bodyNote = (body: string) =>
  body
    .split(/(?<=\.)\s+/)
    .filter((s) => s && !BODY_SKIP.test(s) && !s.includes("m/s"))
    .join(" ");

/** 자원 이름 「펌프차 A-1 · 관할 안전센터 A」 → 이름 · 소속 */
export const unitShort = (name: string) => String(name).split(" · ")[0] ?? name;
export const unitBase = (name: string, org: string) => {
  const i = name.indexOf(" · ");
  return i >= 0 ? name.slice(i + 3) : org;
};
/** 낱말 안 가운뎃점에서 줄을 바꾸지 않는다(줄바꿈은 「 · 」 사이에서만) */
export const nbDot = (t: string) => String(t).replace(/(\S)·(\S)/g, "$1\u2060·\u2060$2");

/** 원장에 남길 현장 자리(목업 slotFor) */
export function slotFor(f: { lat: number; lon: number }, k: number) {
  const ang = (k + 1) * 2.2;
  return { lat: f.lat - Math.abs(Math.sin(ang)) * 0.006, lon: f.lon + Math.cos(ang) * 0.0075 };
}

/** 첫 고를 경보(목업): 미읽음 → 열린 것 → 첫 줄 */
export function firstPick(inbox: OpsAlert[], unread: string[]): string | null {
  return (inbox.find((a) => unread.includes(a.id)) ?? inbox.find((a) => !isClosed(a.status)) ?? inbox[0])?.id ?? null;
}

export type { AlertLevel, UnitStatus };
