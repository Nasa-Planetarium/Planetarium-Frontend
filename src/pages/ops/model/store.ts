"use client";

import { useSyncExternalStore } from "react";
import { inbox } from "@/shared/agency";
import type { ConfClass, LogRow, OpsAlert, OpsFire, OpsUnit, Role } from "./ops";
import { isClosed, slotFor, stepIdx } from "./ops";

/**
 * 화면을 떠나도 이어지는 경보·출동 세계(목업 ops.js 모듈 단위 OPS 시계 + 원장 갱신 EM.updateFire·updateAlert·updateUnit 몫).
 * 원장 값(포트)은 그대로 두고, 사용자 행동이 만든 바뀜만 덧씌운다(새로 고치면 처음으로 — 목업과 같은 수명).
 * 출동 이동은 데모 속도(ETA 를 10–20초로 압축)로 100ms 시계가 움직인다.
 */
export interface Trip {
  unit: string;
  fire: string;
  kind: "go" | "back";
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  t0: number;
  dur: number;
  eta: number;
  p: number;
}
export interface World {
  alerts: Record<string, Partial<OpsAlert>>;
  fires: Record<string, Partial<OpsFire>>;
  units: Record<string, Partial<OpsUnit>>;
  logs: Record<string, LogRow[]>;
  /** 역할별 미읽음(null = 원장 처음 값) */
  unread: Partial<Record<Role, string[]>>;
  trips: Trip[];
  seq: Record<string, number>;
  seqN: number;
  booted: boolean;
  conf: ConfClass[] | null;
  /** 바뀔 때마다 1 씩(이동 막대·지도 다시 그리기) */
  rev: number;
}
const init = (): World => ({ alerts: {}, fires: {}, units: {}, logs: {}, unread: {}, trips: [], seq: {}, seqN: 0, booted: false, conf: null, rev: 0 });
let state: World = init();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export function setWorld(fn: (s: World) => World) {
  state = { ...fn(state), rev: state.rev + 1 };
  emit();
}
export const opsStore = { get: () => state, reset: () => ((state = init()), emit()) };
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => subs.delete(cb);
};
export function useWorld(): World {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/* ── 덧씌운 원장 ── */
export interface Merged {
  alerts: OpsAlert[];
  fires: OpsFire[];
  units: OpsUnit[];
}
export function merge(base: Merged, w: World): Merged {
  const now = typeof performance === "undefined" ? 0 : performance.now();
  const units = base.units.map((u) => {
    const m: OpsUnit = { ...u, ...w.units[u.id] } as OpsUnit;
    const back = w.trips.find((t) => t.unit === u.id && t.kind === "back");
    if (back) {
      const p = Math.min(1, Math.max(0, (now - back.t0) / back.dur));
      const k = p * p * (3 - 2 * p);
      m.lat = back.from.lat + (back.to.lat - back.from.lat) * k;
      m.lon = back.from.lon + (back.to.lon - back.from.lon) * k;
    }
    return m;
  });
  return {
    alerts: base.alerts.map((a) => ({ ...a, ...w.alerts[a.id], log: [...a.log, ...(w.logs[a.id] ?? [])] }) as OpsAlert),
    fires: base.fires.map((f) => ({ ...f, ...w.fires[f.id] }) as OpsFire),
    units,
  };
}
/** 미읽음은 셸 수신함(shared/agency inbox — 머리줄 종·토스트와 같은 값)에서 읽는다. w.unread 는 옛 자리(비워 둠) */
export const unreadOf = (w: World, role: Role, alerts: OpsAlert[]) => {
  void w;
  const s = inbox.get();
  const r = s.read[role] ?? [];
  const ids = [...alerts.filter((a) => a.unread0.includes(role)).map((a) => a.id), ...(s.added[role] ?? [])];
  return [...new Set(ids)].filter((id) => !r.includes(id) && alerts.some((a) => a.id === id));
};
// 종·토스트가 읽음을 바꾸면 ops 화면도 다시 그린다
inbox.subscribe(() => setWorld((s) => s));

/* ── 원장 갱신(목업 EM.updateAlert · updateFire · updateUnit) ── */
type Log = Omit<LogRow, "at">;
const addLog = (s: World, id: string, at: string, row: Log): World => ({ ...s, logs: { ...s.logs, [id]: [...(s.logs[id] ?? []), { at, ...row }] } });
export function updateAlert(M: Merged, id: string, patch: Partial<OpsAlert>, at: string, log?: Log) {
  setWorld((s) => {
    let n: World = { ...s, alerts: { ...s.alerts, [id]: { ...s.alerts[id], ...patch } } };
    if (log) n = addLog(n, id, at, log);
    return n;
  });
  void M;
}
/** 불 상태가 바뀌면 같은 불의 열린 경보 상태를 따라 맞추고 이력을 남긴다 */
export function updateFire(M: Merged, id: string, patch: Partial<OpsFire>, at: string, log?: Log) {
  const prev = M.fires.find((f) => f.id === id);
  setWorld((s) => {
    let n: World = { ...s, fires: { ...s.fires, [id]: { ...s.fires[id], ...patch } } };
    if (patch.status) {
      M.alerts
        .filter((a) => a.fire_id === id && a.status !== "resolved")
        .forEach((a) => {
          const st = patch.status === "contained" ? "resolved" : patch.status;
          n = { ...n, alerts: { ...n.alerts, [a.id]: { ...n.alerts[a.id], status: st } } };
          if (log) n = addLog(n, a.id, at, log);
        });
    }
    return n;
  });
  // 진화 완료 → 피해 면적 담당에게 「진화 완료 · 피해 면적 산정 대기」 경보(목업 EM.updateFire → EM.raiseAlert, 대상 land). 같은 id 는 수신함이 한 번만 받는다
  if (patch.status === "contained" && prev && prev.status !== "contained") {
    inbox.raise({ id: `A-L${id.slice(-5)}`, fire_id: id, level: (Math.max(1, Number(prev.level) || 1) as 1 | 2 | 3 | 4), title: "", title_key: "data.alert.contained.title", at, status: "new", targets: ["land"] });
  }
}
export function markRead(M: Merged, w: World, role: Role, id: string) {
  const cur = unreadOf(w, role, M.alerts);
  if (!cur.includes(id)) return;
  inbox.markRead(role, id);
}
export function addUnread(M: Merged, w: World, role: Role, id: string) {
  const cur = unreadOf(w, role, M.alerts);
  if (cur.includes(id)) return;
  inbox.addUnread(role, id);
}

/* ── 출동 시계(목업 OPS) ── */
let timer: ReturnType<typeof setInterval> | null = null;
let clockFn: () => string = () => "";
let slotOf: ((id: string) => { lat: number; lon: number } | null) | null = null;
/** 화면이 열려 있을 때 그 화면이 계산한 현장 자리(지도 배치) */
export const setSlotOf = (f: typeof slotOf) => {
  slotOf = f;
};
export const setClock = (f: () => string) => {
  clockFn = f;
};
function startTicker() {
  if (!timer) timer = setInterval(tick, 100);
}
function tick() {
  const now = performance.now();
  const done: Trip[] = [];
  state.trips.forEach((t) => {
    t.p = Math.min(1, Math.max(0, (now - t.t0) / t.dur));
    if (t.p >= 1) done.push(t);
  });
  done.forEach(finish);
  if (!state.trips.length && timer) {
    clearInterval(timer);
    timer = null;
  }
  setWorld((s) => ({ ...s }));
}
function finish(tr: Trip) {
  const s0 = state;
  const trips = s0.trips.filter((t) => t !== tr);
  if (tr.kind === "go") {
    const to = (slotOf && slotOf(tr.unit)) || tr.to;
    let n: World = { ...s0, trips, units: { ...s0.units, [tr.unit]: { ...s0.units[tr.unit], status: "onscene", lat: to.lat, lon: to.lon } } };
    // 자동 위치(AVL) 이력: 그 불의 열린 경보마다
    const ids = openAlertsOf.get(tr.fire) ?? [];
    ids.forEach((aid) => {
      n = addLog(n, aid, clockFn(), { text: { key: "ops.log.arrived", params: { u: `@unit:${tr.unit}`, n: `@crew:${tr.unit}` } }, by: "avl" });
    });
    state = { ...n, rev: s0.rev + 1 };
  } else {
    state = { ...s0, trips, units: { ...s0.units, [tr.unit]: { ...s0.units[tr.unit], status: "standby", lat: tr.to.lat, lon: tr.to.lon, fire_id: null } }, rev: s0.rev + 1 };
  }
}
/** 불 → 열린 경보 id(AVL 이력을 남길 곳). 화면이 그릴 때마다 맞춘다 */
const openAlertsOf = new Map<string, string[]>();
export function syncOpenAlerts(M: Merged) {
  openAlertsOf.clear();
  M.alerts.filter((a) => !isClosed(a.status)).forEach((a) => openAlertsOf.set(a.fire_id, [...(openAlertsOf.get(a.fire_id) ?? []), a.id]));
}

/** 처음 열 때 한 번: 청송 진화 뒤 귀소 중인 펌프차가 귀소를 마저 끝낸다(목업 bootOnce) */
export function bootOnce(M: Merged) {
  if (state.booted) return;
  const u = M.units.find((x) => x.id === "U-07");
  const f = M.fires.find((x) => x.id === "F-261111-01");
  const trips: Trip[] = [];
  if (u && f && u.status === "return") {
    const from = { lat: (f.lat + u.home.lat) / 2, lon: (f.lon + u.home.lon) / 2 };
    trips.push({ unit: u.id, fire: f.id, kind: "back", from, to: u.home, t0: performance.now(), dur: 24000, eta: 0, p: 0 });
  }
  setWorld((s) => ({ ...s, booted: true, trips: [...s.trips, ...trips] }));
  if (trips.length) startTicker();
}

/** 출동 지시(목업 dispatch): 대기 자원만 · 현장 자리 순서 · 이력 한 줄 */
export function dispatch(M: Merged, f: OpsFire, a: OpsAlert, ids: string[], at: string, role: Role, eta: (u: OpsUnit) => number): number {
  const sent: OpsUnit[] = [];
  let best = Infinity;
  let k0 = M.units.filter((u) => u.fire_id === f.id && (u.status === "enroute" || u.status === "onscene")).length;
  const trips: Trip[] = [];
  const seq: Record<string, number> = {};
  let seqN = state.seqN;
  const patch: Record<string, Partial<OpsUnit>> = {};
  ids.forEach((id) => {
    const u = M.units.find((x) => x.id === id);
    if (!u || u.status !== "standby") return;
    const e = eta(u);
    best = Math.min(best, e);
    const to = slotFor(f, k0++);
    seq[id] = ++seqN;
    trips.push({ unit: id, fire: f.id, kind: "go", from: { lat: u.lat, lon: u.lon }, to, t0: performance.now(), dur: Math.max(10, Math.min(20, 8 + e * 0.8)) * 1000, eta: e, p: 0 });
    patch[id] = { status: "enroute", fire_id: f.id };
    sent.push(u);
  });
  if (!sent.length) return 0;
  setWorld((s) => ({
    ...s,
    trips: [...s.trips, ...trips],
    seq: { ...s.seq, ...seq },
    seqN,
    units: Object.fromEntries([...Object.entries(s.units), ...Object.entries(patch).map(([id, p]) => [id, { ...s.units[id], ...p }])]),
  }));
  const more = sent.length - 1;
  const log: Log = { text: { key: more > 0 ? "ops.log.dispatch_n" : "ops.log.dispatch_1", params: { u: `@unit:${sent[0]!.id}`, n: more, eta: best } }, by: role };
  if (stepIdx(f.status) < 2) updateFire(M, f.id, { status: "dispatched" }, at, log);
  else updateAlert(M, a.id, {}, at, log);
  startTicker();
  return sent.length;
}
/** 현장 도착 보고: 이 불로 이동 중인 자원도 도착으로 맞춘다 */
export function arriveAll(fireId: string) {
  state.trips.filter((t) => t.kind === "go" && t.fire === fireId).forEach((t) => {
    t.p = 1;
    finish(t);
  });
  emit();
}
/** 진화 완료 뒤 귀소(목업 recall) */
export function recall(M: Merged, f: OpsFire) {
  const back: Trip[] = [];
  const patch: Record<string, Partial<OpsUnit>> = {};
  M.units
    .filter((u) => u.fire_id === f.id && (u.status === "onscene" || u.status === "enroute"))
    .forEach((u, i) => {
      const at = (slotOf && slotOf(u.id)) || { lat: u.lat, lon: u.lon };
      back.push({ unit: u.id, fire: f.id, kind: "back", from: at, to: u.home, t0: performance.now(), dur: 9000 + (i % 5) * 1000, eta: 0, p: 0 });
      patch[u.id] = { status: "return", lat: at.lat, lon: at.lon };
    });
  setWorld((s) => ({
    ...s,
    trips: [...s.trips.filter((t) => !back.some((b) => b.unit === t.unit)), ...back],
    units: Object.fromEntries([...Object.entries(s.units), ...Object.entries(patch).map(([id, p]) => [id, { ...s.units[id], ...p }])]),
  }));
  startTicker();
}
