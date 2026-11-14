"use client";

import { useSyncExternalStore } from "react";
import type { Alert } from "./port";

/**
 * 알림 수신함 상태 — 목업 EM.state.unread · EM.raiseAlert · EM.markRead · bus "alert:new" 몫(mock/agency.js · core.js).
 * 화면을 떠나도 이어진다(새로 고치면 처음으로 — 목업과 같은 수명). 머리줄 종·토스트와 경보·출동 수신함이 같은 값을 읽는다.
 *
 * 미읽음 = (처음 미읽음 ∪ 새로 올라온 것) − 읽음. 처음 미읽음은 원장 경보의 ops.unread(목 어댑터가 붙인다)라
 * 이 상태는 「바뀐 것」만 든다 — 경보 목록이 늦게 와도 순서가 상관없다.
 */
type Role = string;
export interface InboxState {
  /** 역할별 읽음 처리한 경보 id */
  read: Record<Role, string[]>;
  /** 역할별 나중에 미읽음이 된 경보 id(새 경보 · 다시 미읽음) */
  added: Record<Role, string[]>;
  /** 화면에서 새로 올라온 경보(최신 먼저) — 원장 목록 앞에 붙는다 */
  raised: Alert[];
  /** 페이지가 경보를 직접 보여 줄 때(홈 지도 알림 띠) 셸 토스트를 끈다(목업 EM.state.quietAlertToast) */
  quiet: boolean;
  rev: number;
}
let state: InboxState = { read: {}, added: {}, raised: [], quiet: false, rev: 0 };
const subs = new Set<() => void>();
const newSubs = new Set<(a: Alert) => void>();
const set = (fn: (s: InboxState) => InboxState) => {
  state = { ...fn(state), rev: state.rev + 1 };
  subs.forEach((f) => f());
};
const without = (xs: string[] | undefined, id: string) => (xs ?? []).filter((x) => x !== id);
const withId = (xs: string[] | undefined, id: string) => ((xs ?? []).includes(id) ? (xs ?? []) : [...(xs ?? []), id]);

/** 처음 미읽음 역할(목 어댑터 ops.unread) */
export const unread0 = (a: Alert): string[] => {
  const o = a.ops as { unread?: unknown } | undefined;
  return Array.isArray(o?.unread) ? (o.unread as string[]) : [];
};

export const inbox = {
  get: () => state,
  subscribe(cb: () => void) {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
  /** 새 경보(목업 bus "alert:new") 듣기 — 셸 토스트·홈 지도 알림 띠 */
  onNew(cb: (a: Alert) => void) {
    newSubs.add(cb);
    return () => {
      newSubs.delete(cb);
    };
  },
  /** 이 역할의 미읽음 id(경보 목록 = 원장 + 새로 올라온 것) */
  unreadOf(role: Role, alerts: readonly Alert[]): string[] {
    const r = state.read[role] ?? [];
    const base = alerts.filter((a) => a.targets.includes(role) && unread0(a).includes(role)).map((a) => a.id);
    const ids = [...base, ...(state.added[role] ?? [])];
    return [...new Set(ids)].filter((id) => !r.includes(id));
  },
  markRead(role: Role, id: string) {
    if ((state.read[role] ?? []).includes(id) && !(state.added[role] ?? []).includes(id)) return;
    set((s) => ({ ...s, read: { ...s.read, [role]: withId(s.read[role], id) }, added: { ...s.added, [role]: without(s.added[role], id) } }));
  },
  markAllRead(role: Role, ids: readonly string[]) {
    set((s) => ({ ...s, read: { ...s.read, [role]: [...new Set([...(s.read[role] ?? []), ...ids])] }, added: { ...s.added, [role]: [] } }));
  },
  addUnread(role: Role, id: string) {
    set((s) => ({ ...s, read: { ...s.read, [role]: without(s.read[role], id) }, added: { ...s.added, [role]: withId(s.added[role], id) } }));
  },
  /**
   * 새 경보 올리기(목업 EM.raiseAlert): 대상 역할마다 미읽음 + 「alert:new」. 같은 id 는 한 번만(두 화면이 같은 사건을 올려도 하나).
   * 기본값은 목업과 같다 — status new · 대상 긴급대응·소방.
   */
  raise(a: Partial<Alert> & Pick<Alert, "id" | "fire_id" | "level" | "title" | "at">): Alert | null {
    if (state.raised.some((x) => x.id === a.id)) return null;
    const al: Alert = { status: "new", targets: ["responder", "firefighter"], ...a } as Alert;
    set((s) => {
      const added = { ...s.added };
      const read = { ...s.read };
      al.targets.forEach((r) => {
        added[r] = withId(added[r], al.id);
        read[r] = without(read[r], al.id);
      });
      return { ...s, raised: [al, ...s.raised], added, read };
    });
    newSubs.forEach((f) => f(al));
    return al;
  },
  setQuiet(v: boolean) {
    if (state.quiet !== v) set((s) => ({ ...s, quiet: v }));
  },
  /** 시험용 */
  reset() {
    state = { read: {}, added: {}, raised: [], quiet: false, rev: 0 };
    subs.forEach((f) => f());
  },
};

/** 수신함 상태 구독(React) */
export function useInbox(): InboxState {
  return useSyncExternalStore(inbox.subscribe, inbox.get, inbox.get);
}

/** 원장 경보 + 새로 올라온 경보(최신 먼저, id 중복 없음) */
export function withRaised(alerts: readonly Alert[], s: InboxState = state): Alert[] {
  const ids = new Set(alerts.map((a) => a.id));
  return [...s.raised.filter((a) => !ids.has(a.id)), ...alerts];
}
