"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { Bell, Check, X } from "lucide-react";
import { useScenarioNowMs, useSituation } from "@/entities/situation";
import { useAgency } from "@/shared/agency";
import { useT, useTl } from "@/shared/i18n";
import { useDevice } from "@/shared/lib/use-device";
import { useQueryParams } from "@/shared/lib/nav";
import { Dialog } from "@/shared/ui/dialog";
import { toast } from "@/shared/ui/toast";
import {
  alertSnap,
  bodyNote,
  CNT_GRP,
  confToggle,
  counts,
  deployed,
  DIRS,
  etaMin,
  evidenceCounts,
  firstPick,
  hmOf,
  isClosed,
  minsSince,
  nbDot,
  readAlert,
  readFire,
  readUnit,
  stepIdx,
  STEPS,
  TABS,
  tabOf,
  unitBase,
  unitShort,
  units4,
  utcHM,
  YDAY,
  CONF_CLASSES,
  type LogRow,
  type OpsAlert,
  type OpsFire,
  type OpsUnit,
  type Role,
  type TabId,
} from "../model/ops";
import {
  addUnread,
  arriveAll,
  bootOnce,
  dispatch,
  markRead,
  merge,
  recall,
  setClock,
  setWorld,
  syncOpenAlerts,
  unreadOf,
  updateAlert,
  updateFire,
  useWorld,
  type Merged,
} from "../model/store";
import { cx } from "./cx";
import { OpsMap, UnitIcon } from "./ops-map";

const KST_MIN = 9 * 60;
/** 추천 목록에 펼쳐 둘 대수(목업 RES_SHOW) */
const RES_SHOW = 3;

interface Ui {
  sel: string | null;
  cnt: string | null;
  level: number | null;
  pick: string[];
  evac: boolean;
  more: boolean;
  layers: { heat: boolean; spread: boolean; units: boolean; routes: boolean; nowcast: boolean };
}

function useFmt() {
  const lang = useLocale();
  return useMemo(() => {
    const num = (n: number, d = 0) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
    return { num, ha: (n: number) => (n >= 100 ? `${num(n)} ha` : `${num(n, 1)} ha`) };
  }, [lang]);
}

export function OpsScreen({ role }: { role: Role }) {
  const t = useT();
  const tl = useTl();
  const F = useFmt();
  const agency = useAgency();
  const qc = useQueryClient();
  const device = useDevice();
  const sp = useQueryParams();
  const phone = device === "phone";
  const isFF = role === "firefighter";
  const w = useWorld();
  const { data: situation } = useSituation();
  const nowMs = useScenarioNowMs();
  const clock = nowMs != null ? hmOf(nowMs, KST_MIN) : "14:20";
  const clockRef = useRef(clock);
  useEffect(() => {
    clockRef.current = clock;
    setClock(() => clockRef.current);
  }, [clock]);

  const aQ = useQuery({ queryKey: ["agency", "alerts"], queryFn: () => agency.listAlerts(), staleTime: Infinity });
  const fQ = useQuery({ queryKey: ["agency", "fires"], queryFn: () => agency.listFires(), staleTime: Infinity });
  const uQ = useQuery({ queryKey: ["agency", "units"], queryFn: () => agency.listUnits(), staleTime: Infinity });
  const base = useMemo<Merged | null>(
    () => (aQ.data && fQ.data && uQ.data ? { alerts: aQ.data.map(readAlert), fires: fQ.data.map(readFire), units: uQ.data.map(readUnit) } : null),
    [aQ.data, fQ.data, uQ.data],
  );
  const M = useMemo(() => (base ? merge(base, w) : null), [base, w]);
  const ready = !!M && !!situation;
  const [ui, setUi] = useState<Ui>({ sel: null, cnt: null, level: null, pick: [], evac: false, more: false, layers: { heat: true, spread: true, units: true, routes: true, nowcast: true } });
  const [confirmOpen, setConfirmOpen] = useState(false);
  /* 1100–1360 접힌 레일에서 펼친 수신함 서랍(목업 .op-open) · 출동 직후 지도 맞춤(목업 showTrips) */
  const [drawer, setDrawer] = useState(false);
  const [tripsFit, setTripsFit] = useState<{ fire: string; n: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (M) {
      bootOnce(M);
      syncOpenAlerts(M);
    }
  }, [M]);

  const inbox = useMemo(() => (M ? M.alerts.filter((a) => a.targets.includes(role)) : []), [M, role]);
  const unread = useMemo(() => (M ? unreadOf(w, role, M.alerts) : []), [M, w, role]);
  const fire = useCallback((id: string | undefined) => M?.fires.find((f) => f.id === id), [M]);
  const unit = useCallback((id: string) => M?.units.find((u) => u.id === id), [M]);

  /* 처음 고를 경보(목업): 알림 서랍에서 고른 경보(?alert=, 목업 EM.state.focusAlert) → 미읽음 → 열린 것 → 첫 줄.
     화면이 스스로 고른 것이라 읽음 처리 없음 — 사람이 고르기 전까지는 처음 열 때 고른 것을 쓴다 */
  const focusId = sp.get("alert");
  const firstId = ready ? (focusId && inbox.some((a) => a.id === focusId) ? focusId : firstPick(inbox, unread)) : null;
  const selId = ui.sel ?? firstId;
  const sel = inbox.find((a) => a.id === selId) ?? null;
  const selFire = sel ? fire(sel.fire_id) : undefined;

  /* ── 사전 ── */
  const fname = (f: OpsFire | undefined) => (f ? tl("fire", f.id, "name", f.name) : "");
  const atitle = (a: OpsAlert) => tl("alert", a.id, "title", a.title);
  const uname = (u: OpsUnit) => tl("unit", u.id, "name", u.name);
  const uorg = (u: OpsUnit) => tl("unit", u.id, "org", u.org);
  const vname = (n: string) => tl("village", n, null, n);
  const dirName = (d: string) => tl("dir", d, null, d);
  const LV = (n: number) => t(`shell.level.${n}`);
  const STATUS = (s: string) => t(`shell.status.${s}`);
  const atL = (s: string) => (String(s).startsWith(YDAY) ? t("ops.at.yday", { t: String(s).slice(YDAY.length) }) : String(s));
  const param = (v: string | number): string | number => {
    if (typeof v !== "string" || !v.startsWith("@")) return v;
    const [k, id = ""] = v.slice(1).split(":");
    const u = unit(id);
    const f = fire(id);
    const R: Record<string, () => string | number> = {
      unit: () => (u ? uname(u) : id),
      crew: () => u?.crew ?? 0,
      lv: () => LV(Number(id)),
      vil: () => (f ? f.villages.map((x) => vname(x.name)).join("·") : ""),
    };
    return (R[k ?? ""] ?? (() => v))();
  };
  const logText = (a: OpsAlert, l: LogRow) =>
    "title" in l.text ? tl("alert", a.id, "title", l.text.title) : t(l.text.key, l.text.params ? Object.fromEntries(Object.entries(l.text.params).map(([k, v]) => [k, param(v)])) : undefined);
  const BY: Record<string, () => string> = { satellite: () => t("shell.by.satellite"), avl: () => t("ops.by.avl"), system: () => t("shell.by.system") };
  const logBy = (l: LogRow) => (BY[l.by] ?? (() => t(`shell.role.${l.by}.label`)))();

  /* ── 동작 ── */
  const select = (id: string, quiet = false) => {
    if (!M) return;
    setUi((u) => (selId === id ? { ...u, sel: id } : { ...u, sel: id, level: null, pick: [], evac: false, more: false }));
    if (!quiet) markRead(M, w, role, id);
  };
  const opToast = (o: Parameters<typeof toast>[0]) => {
    if (!ui.evac) toast(o);
  };
  const act = (name: string, extra?: string) => {
    if (!M || !sel || !selFire) return;
    const a = sel;
    const f = selFire;
    if (!ui.sel) setUi((u) => ({ ...u, sel: a.id })); // 고른 경보를 굳힌다(읽음 처리로 첫 선택 규칙이 다른 경보를 고르지 않게)
    markRead(M, w, role, a.id);
    const H: Record<string, () => void> = {
      ack: () => {
        const log: Omit<LogRow, "at"> = { text: { key: "ops.log.ack" }, by: role };
        if (stepIdx(f.status) >= 1 && !isClosed(f.status)) updateAlert(M, a.id, { status: f.status, ack_at: clock }, clock, log);
        else {
          updateAlert(M, a.id, { ack_at: clock }, clock);
          updateFire(M, f.id, { status: "ack" }, clock, log);
        }
        opToast({ text: t("ops.log.ack"), sub: atitle(a), kind: "ok", ms: 3000 });
      },
      lv: () => setUi((u) => ({ ...u, level: Number(extra) })),
      "lv-apply": () => {
        const from = a.level;
        const to = ui.level;
        if (to == null || to === from) return;
        setUi((u) => ({ ...u, level: null }));
        updateFire(M, f.id, { level: to as OpsFire["level"] }, clock);
        updateAlert(M, a.id, { level: to as OpsAlert["level"], level_at: clock }, clock, { text: { key: "ops.log.level", params: { a: `@lv:${from}`, b: `@lv:${to}` } }, by: role });
        opToast({ level: to as 1, text: <span>{t("ops.toast.level", { lv: LV(to) })}</span>, sub: fname(f), ms: 3500 });
      },
      req: () => {
        addUnread(M, w, "firefighter", a.id);
        updateAlert(M, a.id, { dispatch_req: clock }, clock, { text: { key: "ops.log.req" }, by: role });
        opToast({ text: t("ops.toast.req"), sub: t("ops.toast.req_sub"), kind: "ok", ms: 3500 });
      },
      evac: () => setUi((u) => ({ ...u, evac: true })),
      "evac-cancel": () => setUi((u) => ({ ...u, evac: false })),
      "evac-send": () => {
        const homes = f.villages.reduce((s, v) => s + v.homes, 0);
        setUi((u) => ({ ...u, evac: false }));
        updateAlert(M, a.id, { evac_at: clock }, clock, { text: { key: "ops.log.evac", params: { v: `@vil:${f.id}`, h: homes } }, by: role });
        toast({ text: t("ops.toast.evac"), sub: t("ops.toast.evac_sub", { n: f.villages.length, h: homes }), kind: "ok", ms: 3500 });
      },
      more: () => setUi((u) => ({ ...u, more: !u.more })),
      dispatch: () => {
        const ids = ui.pick;
        setUi((u) => ({ ...u, pick: [] }));
        const n = dispatch(M, f, a, ids, clock, role, (u) => etaMin(u, f));
        ids.forEach((id) => void agency.dispatchUnit(id, f.id).catch(() => undefined));
        if (n) setTripsFit((x) => ({ fire: f.id, n: (x?.n ?? 0) + 1 }));
        if (n) opToast({ text: t("ops.toast.dispatch", { n }), sub: t("ops.toast.dispatch_sub"), kind: "ok", ms: 3500 });
      },
      arrive: () => {
        arriveAll(f.id);
        updateFire(M, f.id, { status: "onscene" }, clock, { text: { key: "ops.log.onscene" }, by: role });
      },
      contain: () => setConfirmOpen(true),
    };
    H[name]?.();
  };
  const contain = () => {
    if (!M || !selFire) return;
    const f = selFire;
    setConfirmOpen(false);
    const at = `${situation ? new Date(situation.now_ms + KST_MIN * 60000).toISOString().slice(0, 10) : "2026-11-11"} ${clock}`;
    updateFire(M, f.id, { status: "contained", contained_at: at }, clock, { text: { key: "ops.log.contained" }, by: role });
    /* 기관 원장에도 진화 완료 → 피해 면적 산정 대기열·토지 관리 경보(목업 mock/agency.js). 다른 화면(land·home)이 다시 받게 무효화 */
    void agency
      .containFire(f.id, at)
      .then(() => Promise.all([qc.invalidateQueries({ queryKey: ["agency", "fires"] }), qc.invalidateQueries({ queryKey: ["agency", "alerts"] })]))
      .catch(() => undefined);
    recall(M, f);
    M.units.filter((u) => u.fire_id === f.id).forEach((u) => void agency.recallUnit(u.id).catch(() => undefined));
    toast({ text: t("ops.contain.verb"), sub: t("ops.toast.contained_sub"), kind: "ok", ms: 4000 });
  };
  const togglePick = (id: string) => setUi((u) => ({ ...u, pick: u.pick.includes(id) ? u.pick.filter((x) => x !== id) : [...u.pick, id] }));

  /* ── 폰: 머리 높이·바닥 행동 바 높이를 잰다(목업 fitHead) ── */
  const opRef = useRef<HTMLDivElement>(null);
  const sumRef = useRef<HTMLElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const op = opRef.current;
    const sum = sumRef.current;
    const foot = footRef.current;
    if (!op || !sum || !foot) return;
    let footH = 0;
    const fit = () => {
      if (!phone) {
        op.style.removeProperty("--op-above");
        op.style.removeProperty("--op-foot");
        return;
      }
      const host = op.parentElement;
      const top = sum.getBoundingClientRect().top - (host?.getBoundingClientRect().top ?? 0) + (host?.scrollTop ?? 0);
      op.style.setProperty("--op-above", `${Math.ceil(top + sum.offsetHeight)}px`);
      if (foot.offsetHeight) footH = foot.offsetHeight;
      if (footH) op.style.setProperty("--op-foot", `${footH}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(sum);
    ro.observe(foot);
    return () => ro.disconnect();
  }, [phone, ready]);

  /* 토스트 자리(목업 placeToasts): 지도 옆에 상세 칸이 있으면 지도 칸 오른쪽 아래·확대 단추 왼쪽 · 범례 위에 띄운다 →
     상세 아래 행동 바(현장 도착·진화 완료)를 덮지 않는다. 한 열 배치(폰)는 셸 기본(머리줄 아래). 화면을 떠나면 셸 값으로 되돌린다 */
  useEffect(() => {
    const op = opRef.current;
    if (!op || !ready) return;
    const saved = new Map<HTMLElement, [string, string]>();
    const place = () => {
      const box = document.querySelector<HTMLElement>("[data-sonner-toaster]");
      if (!box) return;
      const cell = op.querySelector<HTMLElement>('[data-testid="ops-map"]');
      const det = op.querySelector<HTMLElement>('[data-testid="ops-detail"]');
      if (!cell || !det) return;
      const r = cell.getBoundingClientRect();
      const d = det.getBoundingClientRect();
      const gap = 8;
      if (!(r.width > 320 && d.width > 0 && d.left >= r.right - 1)) return;
      if (!saved.has(box)) saved.set(box, [box.style.getPropertyValue("--offset-right"), box.style.getPropertyValue("--offset-bottom")]);
      const rect = (sel: string) => {
        const e = cell.querySelector<HTMLElement>(sel);
        const b = e?.getBoundingClientRect();
        return b && b.width && b.height ? b : null;
      };
      const lr = rect(`.${cx("op-legend")}`);
      const ar = rect(`.${cx("attrib")}`);
      const zr = rect(`.${cx("zoom")}`);
      const floor = lr ? lr.top : ar ? ar.top : r.bottom;
      box.style.setProperty("--offset-right", `${Math.round(zr ? window.innerWidth - zr.left + gap : window.innerWidth - r.right + gap)}px`);
      box.style.setProperty("--offset-bottom", `${Math.round(window.innerHeight - floor + gap)}px`);
    };
    place();
    window.addEventListener("resize", place);
    // 토스트 목록(ol)은 토스트가 생길 때 만들어진다 → 짧은 주기로 자리를 맞춘다
    const t = window.setInterval(place, 250);
    return () => {
      window.removeEventListener("resize", place);
      window.clearInterval(t);
      saved.forEach(([r, b], box) => {
        box.style.setProperty("--offset-right", r);
        box.style.setProperty("--offset-bottom", b);
      });
    };
  }, [ready, phone]);

  /* 상세 판 「아래 더 보기」 */
  const bodyRef = useRef<HTMLDivElement>(null);
  const [moreHint, setMoreHint] = useState(false);
  useEffect(() => {
    const b = bodyRef.current;
    if (!b) return;
    const upd = () => setMoreHint(b.clientHeight > 0 && b.scrollHeight - b.clientHeight - b.scrollTop > 24);
    upd();
    b.addEventListener("scroll", upd, { passive: true });
    const ro = new ResizeObserver(upd);
    ro.observe(b);
    Array.from(b.children).forEach((c) => ro.observe(c));
    return () => {
      b.removeEventListener("scroll", upd);
      ro.disconnect();
    };
  });

  if (!ready || !M) return <div className={cx("op")} data-pane="detail" aria-busy="true" />;

  const cnts = counts(M.alerts, M.units);
  const only = ui.cnt ? CNT_GRP[ui.cnt] : undefined;

  /* ── 수신함 ── */
  const row = (a: OpsAlert) => {
    const f = fire(a.fire_id);
    const un = unread.includes(a.id);
    const sn = alertSnap(a, M.alerts, f);
    const done = isClosed(a.status);
    return (
      <button
        key={a.id}
        type="button"
        className={cx("op-it", `l${a.level}`, un && "un", selId === a.id && "sel", done && "done")}
        role="option"
        aria-selected={selId === a.id}
        data-id={a.id}
        onClick={() => select(a.id)}
      >
        <span className={cx("op-it-top")}>
          <span className={cx("lv", `l${a.level}`)}>{LV(a.level)}</span>
          <span className={cx("op-it-time num")}>{atL(a.at)}</span>
          {un ? <span className={cx("op-it-dot")} aria-label={t("ops.row.unread")} /> : null}
        </span>
        <span className={cx("op-it-title row-t")}>{atitle(a)}</span>
        <span className={cx("op-it-place")}>{fname(f)}</span>
        <span className={cx("op-it-meta")}>
          {sn.pts != null ? (
            <span className={cx("op-it-w")}>
              {t("ops.row.detections")}
              <b className={cx("num")}>{sn.pts}</b>
            </span>
          ) : null}
          <span className={cx("op-it-w op-it-u")} title={t("ops.row.assigned_units")}>
            {t("ops.row.units")}
            <b className={cx("num")}>
              {deployed(M.units, f)}
              {t("ops.row.x")}
            </b>
          </span>
          {a.status === "new" || done ? null : <span className={cx("st", a.status)}>{STATUS(a.status)}</span>}
        </span>
      </button>
    );
  };
  const list = (
    <div
      ref={listRef}
      className={cx("op-list")}
      role="listbox"
      aria-label={t("ops.boot_once.alert_list")}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const box = e.currentTarget;
        const btns = Array.from(box.querySelectorAll<HTMLButtonElement>("[data-id]"));
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const n = btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (!n?.dataset.id) return;
        e.preventDefault();
        const id = n.dataset.id;
        select(id);
        requestAnimationFrame(() => box.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus());
      }}
    >
      {TABS.map((tb) => {
        const g = inbox.filter((a) => tb.has(a.status));
        if (only && tb.id !== only) return null;
        if (!g.length && tb.id !== "open" && tb.id !== only) return null;
        const label = t(tb.label);
        return (
          <div key={tb.id} className={cx("op-grp")} data-grp={tb.id} role="group" aria-label={t("ops.grp.aria", { t: label, n: g.length })}>
            <div className={cx("op-grp-h")} aria-hidden="true">
              {label}
            </div>
            {g.length ? g.map(row) : <p className={cx("op-grp-none")}>{t("ops.row.none")}</p>}
          </div>
        );
      })}
    </div>
  );
  const ih = (
    <div className={cx("op-ih")}>
      <h2>{t("ops.boot_once.alert_inbox")}</h2>
      <button type="button" className={cx("op-ih-x")} aria-label={t("ops.boot_once.collapse_inbox")} onClick={() => setDrawer(false)}>
        <X aria-hidden="true" />
      </button>
    </div>
  );

  /* ── 상세 ── */
  const a = sel;
  const f = selFire;
  const closed = a ? isClosed(a.status) || (f ? isClosed(f.status) : false) : false;
  const phoneAck = !!a && !isFF && a.status === "new" && phone;

  const elText = (): ReactNode => {
    if (!a || closed) return null;
    const m = minsSince(a.at, clock);
    if (m == null) return null;
    const txt = m < 60 ? t("ops.dur.m", { m }) : t("ops.dur.hm", { h: Math.floor(m / 60), m: m % 60 });
    return (
      <>
        <b className={cx("num nw")}>{txt}</b>
        <small>{t("ops.age.elapsed_word")}</small>
      </>
    );
  };
  const ageText = () => {
    if (!a) return "";
    if (closed) {
      const tt = f?.contained_at ? String(f.contained_at).slice(11, 16) : "";
      return t("ops.age.closed", { at: atL(a.at), end: tt ? t("ops.age.contained_at", { t: tt }) : t("ops.age.closed_word") });
    }
    const m = minsSince(a.at, clock);
    return m != null ? t("ops.age.elapsed", { at: atL(a.at), m: F.num(m) }) : atL(a.at);
  };
  const el = elText();
  const headAge = el ? t("ops.head.alert_at", { t: atL(a?.at ?? "") }) : ageText();

  const resRow = (r: { u: OpsUnit; d: number; eta: number }, pickable: boolean) => {
    const u = r.u;
    const on = ui.pick.includes(u.id);
    const inner = (
      <>
        {pickable ? <input type="checkbox" data-unit={u.id} checked={on} onChange={() => togglePick(u.id)} aria-label={t("ops.res.pick", { u: uname(u) })} /> : null}
        <span className={cx("op-res-ic")}>
          <UnitIcon type={u.type} />
        </span>
        <span className={cx("op-res-main")}>
          <b>{unitShort(uname(u))}</b>
          <small>
            {nbDot(unitBase(uname(u), uorg(u)))}, {nbDot(t(`shell.unit_type.${u.type}`))}
          </small>
        </span>
        <span className={cx("op-res-eta")}>
          <b className={cx("num")}>
            {r.eta}
            <small>{t("ops.unit.min")}</small>
          </b>
          <small className={cx("tn")}>{t("ops.res.dist", { km: F.num(r.d, 1), n: u.crew })}</small>
        </span>
      </>
    );
    return pickable ? (
      <label key={u.id} className={cx("op-res", on && "on")}>
        {inner}
      </label>
    ) : (
      <div key={u.id} className={cx("op-res ro")}>
        {inner}
      </div>
    );
  };

  const pickFoot = (ff: OpsFire) => {
    const ids = ui.pick.filter((id) => unit(id)?.status === "standby");
    if (!ids.length)
      return (
        <>
          <span className={cx("op-pick-sum muted")}>{t("ops.pick_foot.no_units_selected")}</span>
          <button type="button" className={cx("btn danger")} disabled>
            {t("ops.pick_foot.dispatch")}
          </button>
        </>
      );
    const us = ids.map((id) => unit(id)!).filter(Boolean);
    const B = (v: number) => `\u0001${v}\u0002`;
    const txt = t("ops.pick.sum", { n: B(ids.length), c: B(us.reduce((s, u) => s + u.crew, 0)), eta: B(Math.min(...us.map((u) => etaMin(u, ff)))) });
    return (
      <>
        <span className={cx("op-pick-sum")}>
          {txt.split(/\u0001|\u0002/).map((p, i) => (i % 2 ? <b key={i} className={cx("num")}>{p}</b> : p))}
        </span>
        <button type="button" className={cx("btn danger")} onClick={() => act("dispatch")}>
          {t("ops.pick_foot.dispatch")}
        </button>
      </>
    );
  };

  const actResponder = (aa: OpsAlert, ff: OpsFire) => {
    const cl = isClosed(aa.status);
    const acked = aa.status !== "new";
    const fireMoving = stepIdx(ff.status) >= 2 && !isClosed(ff.status);
    const lvPick = ui.level ?? aa.level;
    const vs = ff.villages;
    const homes = vs.reduce((s, v) => s + v.homes, 0);
    const reqDone = !!aa.dispatch_req || fireMoving;
    if (!acked)
      return (
        <div className={cx("op-acts")}>
          <div className={cx("op-row next")}>
            <div className={cx("op-row-b")}>
              {phone ? (
                <>
                  <b>
                    <span className={cx("lv", `l${aa.level}`)}>{LV(aa.level)}</span> {atitle(aa)}
                  </b>
                  <small>{fname(ff)}</small>
                </>
              ) : (
                <>
                  <b>{t("ops.act.ack_alert")}</b>
                  <small>{t("ops.act_responder.review_the_satellite_detection")}</small>
                </>
              )}
            </div>
            <button type="button" className={cx("btn primary")} data-act="ack" onClick={() => act("ack")}>
              {t("ops.tab_of.acknowledge")}
            </button>
          </div>
        </div>
      );
    const vnames = vs.map((v) => vname(v.name)).join("·");
    const msg = t(ff.spread && ff.spread !== "-" ? "ops.evac.msg_dir" : "ops.evac.msg", { f: fname(ff), d: ff.spread && ff.spread !== "-" ? dirName(ff.spread) : "", v: vnames });
    return (
      <div className={cx("op-acts")}>
        {!reqDone && !cl ? (
          <div className={cx("op-row next")}>
            <div className={cx("op-row-b")}>
              <b>{t("ops.act_responder.request_dispatch")}</b>
              <small>{t("ops.act_responder.to_the_local_fire")}</small>
            </div>
            <button type="button" className={cx("btn primary")} onClick={() => act("req")}>
              {t("ops.act_responder.request_dispatch")}
            </button>
          </div>
        ) : null}
        <div className={cx("op-row lvrow", cl && "off")}>
          <div className={cx("op-row-b")}>
            <b>{t("ops.act_responder.set_alert_level")}</b>
            {aa.level_at ? <small>{t("ops.lv.set_at", { t: aa.level_at })}</small> : null}
          </div>
          <div className={cx("op-lvseg")} role="group" aria-label={t("ops.act_responder.alert_level")}>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" className={cx(`v${n}`)} aria-pressed={lvPick === n} disabled={cl} onClick={() => act("lv", String(n))}>
                {LV(n)}
              </button>
            ))}
          </div>
          <button type="button" className={cx("btn sm")} disabled={cl || ui.level == null || ui.level === aa.level} onClick={() => act("lv-apply")}>
            {t("ops.act_responder.set")}
          </button>
        </div>
        {!aa.evac_at && !cl ? (
          <div className={cx("op-row")}>
            <div className={cx("op-row-b")}>
              <b>{t("ops.act_responder.request_evacuation_notice")}</b>
              <small>{t("ops.evac.sub", { n: vs.length, h: homes, v: vnames })}</small>
            </div>
            {ui.evac ? null : (
              <button type="button" className={cx("btn")} onClick={() => act("evac")}>
                {t("ops.act_responder.request")}
              </button>
            )}
          </div>
        ) : null}
        {ui.evac && !aa.evac_at ? (
          <div className={cx("op-confirm")} role="group" aria-label={t("ops.act_responder.confirm_evacuation_notice")}>
            <div className={cx("op-confirm-h")}>{t("ops.act_responder.check_before_sending")}</div>
            <dl className={cx("op-confirm-dl")}>
              <dt>{t("ops.act_responder.target")}</dt>
              <dd>
                {vs.map((v, i) => (
                  <span key={v.name}>
                    {i ? ", " : ""}
                    {vname(v.name)} <span className={cx("tn dim")}>{t("ops.vil.homes_n", { n: v.homes })}</span>
                  </span>
                ))}
              </dd>
              <dt>{t("ops.act_responder.recipient")}</dt>
              <dd>{t("ops.act_responder.local_government_emergency_desk")}</dd>
              <dt>{t("ops.act_responder.channel")}</dt>
              <dd>{t("ops.act_responder.emergency_sms_village_pa")}</dd>
            </dl>
            <p className={cx("op-confirm-msg")}>
              <span className={cx("op-confirm-k")}>{t("ops.act_responder.message")}</span>
              {msg}
            </p>
            <div className={cx("op-confirm-f")}>
              <button type="button" className={cx("btn ghost sm")} onClick={() => act("evac-cancel")}>
                {t("ops.act_responder.cancel")}
              </button>
              <button type="button" className={cx("btn primary sm")} autoFocus onClick={() => act("evac-send")}>
                {t("ops.act_responder.send_request")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const actFire = (aa: OpsAlert, ff: OpsFire) => {
    const rs = units4(M.units, ff);
    const shown = ui.more ? rs : rs.filter((r, i) => i < RES_SHOW || ui.pick.includes(r.u.id));
    const rest = rs.length - shown.length;
    return (
      <>
        {aa.dispatch_req && stepIdx(ff.status) < 2 ? (
          <div className={cx("op-banner")}>
            <span>
              <b>{t("ops.act_fire.dispatch_request_from_regional")}</b> {aa.dispatch_req}
            </span>
          </div>
        ) : null}
        {!isClosed(aa.status) ? (
          <>
            <div className={cx("op-sub")}>
              <b>{t("ops.act_fire.recommended_units")}</b>
              <small>{t("ops.res.rec_sub", { n: rs.length })}</small>
            </div>
            {rs.length ? (
              <div className={cx("op-reslist")} data-pick>
                {shown.map((r) => resRow(r, true))}
                {rest > 0 ? (
                  <button type="button" className={cx("op-more")} onClick={() => act("more")}>
                    {t("ops.res.more", { n: rest })}
                  </button>
                ) : ui.more && rs.length > RES_SHOW ? (
                  <button type="button" className={cx("op-more")} onClick={() => act("more")}>
                    {t("ops.res.less", { n: RES_SHOW })}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className={cx("op-none")}>{t("ops.act_fire.no_standby_units")}</p>
            )}
          </>
        ) : null}
      </>
    );
  };

  const fireFoot = (ff: OpsFire) => {
    const mine = M.units.filter((u) => u.fire_id === ff.id && (u.status === "enroute" || u.status === "onscene"));
    const arrived = mine.filter((u) => u.status === "onscene").length;
    const canArrive = ff.status === "dispatched";
    const canOut = ff.status === "onscene";
    return (
      <>
        <div className={cx("op-pick")} data-foot>
          {pickFoot(ff)}
        </div>
        <div className={cx("op-two")}>
          <button type="button" className={cx("btn", canArrive && arrived > 0 && "primary op-nudge")} disabled={!canArrive} onClick={() => act("arrive")}>
            {t("ops.tab_of.on_scene")}
            {canArrive && arrived ? <span className={cx("op-cnt num")}>{arrived}</span> : null}
          </button>
          <button type="button" className={cx("btn", canOut && "op-ok")} disabled={!canOut} onClick={() => act("contain")}>
            {t("ops.contain.verb")}
          </button>
        </div>
        {ff.status === "dispatched" ? <p className={cx("op-hint")}>{arrived ? t("ops.ff.arrived_n", { n: arrived }) : t("ops.ff.enroute")}</p> : null}
      </>
    );
  };

  const evidence = (aa: OpsAlert, ff: OpsFire) => {
    const sp = ff.spread ? DIRS[ff.spread] : undefined;
    const ev = evidenceCounts(ff, w.conf);
    const regs = ff.by_region ? Object.keys(ff.by_region) : [ff.region];
    const today = situation ? new Date(situation.now_ms + KST_MIN * 60000).toISOString().slice(0, 10) : "2026-11-11";
    const d0 = new Date(`${today}T00:00:00Z`);
    d0.setUTCDate(d0.getUTCDate() - 3);
    const from = d0.toISOString().slice(0, 10);
    const sen = (name: "VIIRS" | "MODIS", n: number, px: string): [string, ReactNode] => {
      const p = aa.passes.find((x) => x.sensor === name);
      const ms = p ? Date.parse(p.at) : NaN;
      return [
        `${name} ${px}`,
        <>
          <span className={cx("op-evv")}>
            <b className={cx("num")}>{n}</b>
            <small>{t("ops.unit.pts")}</small>
          </span>
          {p ? (
            <span className={cx("op-ev-pass")}>
              <span className={cx("ptick")} title={t("shell.pass.title", { sat: `${p.sat} ${name}`, t: hmOf(ms, KST_MIN) })}>
                <i className={cx(name === "MODIS" ? "m" : "v")} aria-hidden="true" />
                <span className={cx("mono")}>{p.sat}</span> <span className={cx("mono")}>{hmOf(ms, KST_MIN)}</span> {t("shell.pass.word")}
              </span>
              <span className={cx("op-utc num")} title="UTC">
                {utcHM(ms)}
              </span>
            </span>
          ) : null}
        </>,
      ];
    };
    const c = (k: string, v: ReactNode, sub?: ReactNode): [string, ReactNode] => [
      k,
      <>
        <span className={cx("op-evv")}>{v}</span>
        {sub ? <span className={cx("op-evs")}>{sub}</span> : null}
      </>,
    ];
    const conf = w.conf ?? CONF_CLASSES;
    const rows: [string, ReactNode][] = [
      [
        t("ops.sen.confidence"),
        <div key="c" className={cx("seg em-confseg")} role="group" aria-label={t("shell.conf.label")}>
          {CONF_CLASSES.map((k) => (
            <button
              key={k}
              type="button"
              data-conf={k}
              aria-pressed={conf.includes(k)}
              onClick={() => {
                const next = confToggle(w.conf, k);
                if (next !== false) setWorld((s) => ({ ...s, conf: next }));
              }}
            >
              {t(`shell.conf.${k}`)}
            </button>
          ))}
        </div>,
      ],
      sen("VIIRS", ev.nV, "375 m"),
      sen("MODIS", ev.nM, "1 km"),
      c(
        t("ops.sen.max_frp"),
        <>
          <b className={cx("num")}>{ff.frp_max}</b>
          <small>MW</small>
        </>,
        ff.frp_max >= 80 ? <span className={cx("up")}>{t("ops.sen.intense_burning")}</span> : t("ops.sen.moderate"),
      ),
      c(
        t("ops.sen.spread_direction"),
        sp != null ? (
          <>
            <svg className={cx("op-arrow")} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={{ transform: `rotate(${sp}deg)` }}>
              <path d="M8 2 L12 10 L8 8.2 L4 10 Z" fill="currentColor" />
              <path d="M8 8 V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <b>{dirName(ff.spread ?? "")}</b>
          </>
        ) : (
          <b>–</b>
        ),
        sp != null ? t("ops.sen.cluster_movement") : t("ops.sen.no_data"),
      ),
      c(
        t("ops.sen.report"),
        ff.reported ? <b className={cx("op-ok-t")}>{t("ops.sen.matched")}</b> : <b className={cx("op-warn-t")}>{t("ops.sen.none")}</b>,
        ff.reported ? t("ops.sen.matches_emergency_call_location") : t("ops.sen.satellite_first"),
      ),
      c(
        t("ops.sen.excluded"),
        <span className={cx("op-excl")}>
          {t("ops.sen.static_sources")}
          <b className={cx("num")}>{ev.fixed}</b>
          {t("ops.sen.offshore")}
          <b className={cx("num")}>{ev.sea}</b>
        </span>,
        <>
          <span className={cx("num")}>
            {from.slice(5).replace("-", ".")}–{today.slice(5).replace("-", ".")}
          </span>{" "}
          {regs.map((id) => tl("region", id, null, id)).join("·")}
        </>,
      ),
    ];
    const note = bodyNote(tl("alert", aa.id, "body", String(aa.body ?? "")));
    return (
      <>
        <div className={cx("op-ev")}>
          <dl className={cx("sumlist")}>
            {rows.map(([k, v]) => [<dt key={`k${k}`}>{k}</dt>, <dd key={`v${k}`}>{v}</dd>])}
          </dl>
        </div>
        {note ? (
          <p className={cx("op-body")}>
            <span>{note}</span>
          </p>
        ) : null}
      </>
    );
  };

  const assigned = (ff: OpsFire) => {
    const us = M.units.filter((u) => u.fire_id === ff.id && (u.status === "enroute" || u.status === "onscene" || u.status === "return"));
    if (!us.length)
      return (
        <p className={cx("op-none")}>
          {isClosed(ff.status) ? t("ops.assigned.no_units_assigned_all") : isFF ? t("ops.assigned.no_units_assigned") : t("ops.assigned.no_units_assigned_before")}
        </p>
      );
    return (
      <div className={cx("op-asg")} data-asg>
        {us.map((u) => {
          const tr = w.trips.find((x) => x.unit === u.id);
          const p = tr ? tr.p : u.status === "onscene" ? 1 : 0;
          const left = tr && tr.kind === "go" ? Math.max(0, Math.round(tr.eta * (1 - tr.p))) : null;
          return (
            <div key={u.id} className={cx("op-asg-r", u.status)}>
              <span className={cx("op-res-ic")}>
                <UnitIcon type={u.type} />
              </span>
              <span className={cx("op-res-main")}>
                <b>{unitShort(uname(u))}</b>
                <span className={cx("op-bar")}>
                  <i data-trip={u.id} style={{ width: `${Math.round(p * 100)}%` }} />
                </span>
              </span>
              <span className={cx("op-asg-s")}>
                <span className={cx("op-ust", u.status)}>{t(`shell.unit_status.${u.status}`)}</span>
                <small className={cx("num")} data-left={u.id}>
                  {left != null ? t("ops.asg.left", { m: left }) : t("ops.unit.crew", { n: u.crew })}
                </small>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const stages = (aa: OpsAlert) => {
    const cur = stepIdx(aa.status);
    const now = isClosed(aa.status) ? cur + 1 : cur;
    return (
      <div className={cx("op-steps")}>
        <ol className={cx("stages")} aria-label={t("ops.stepper.response_stage")}>
          {STEPS.map((k, i) => (
            <li key={k} className={cx(i < now ? "is-done" : i === now ? "is-now" : "")} aria-current={i === now ? "step" : undefined}>
              {i < now ? (
                <span className={cx("sg-ck")}>
                  <Check aria-hidden="true" />
                  {t(k)}
                </span>
              ) : (
                t(k)
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  };

  let dTop: ReactNode = null;
  let dBody: ReactNode;
  let dFoot: ReactNode = null;
  if (!a || !f) {
    const tab: TabId = ui.cnt && CNT_GRP[ui.cnt] ? CNT_GRP[ui.cnt]! : "open";
    const none = !inbox.some((x) => tabOf(x) === tab);
    dBody = (
      <div className={cx("op-empty tall")}>
        <Bell aria-hidden="true" />
        <b>{none ? t(TABS.find((x) => x.id === tab)!.label) + t("ops.render_detail.none") : t("ops.render_detail.no_alert_selected")}</b>
      </div>
    );
  } else {
    dTop = (
      <>
        <div className={cx("op-dh-row")}>
          <span className={cx("lv", `l${a.level}`)}>{LV(a.level)}</span>
          <span className={cx("op-dh-st")}>{STATUS(a.status)}</span>
          <span className={cx("op-grow")} />
          <span className={cx("op-dh-age tn")}>{headAge}</span>
        </div>
        <div className={cx("op-dh-tr")}>
          <h2 className={cx("op-dh-title")}>{atitle(a)}</h2>
          <span className={cx("op-dh-el")} title={t("ops.render_detail.time_since_detection")}>
            {el}
          </span>
        </div>
        <div className={cx("op-dh-place")}>
          <span>{fname(f)}</span>
          <span className={cx("num dim")}>
            {f.lat.toFixed(3)}°N {f.lon.toFixed(3)}°E
          </span>
        </div>
        {stages(a)}
      </>
    );
    const pre = isFF && a.status === "new" && stepIdx(f.status) < 2 && !a.dispatch_req ? <small>{t("ops.render_detail.satellite_first_not_yet")}</small> : null;
    const near = !isFF && !isClosed(a.status) ? units4(M.units, f).slice(0, 4) : null;
    dBody = (
      <>
        {phoneAck ? null : (
          <section className={cx("op-sec op-sec-act")}>
            <div className={cx("op-sec-h")}>
              <h3>{isFF ? t("ops.render_detail.dispatch_and_scene") : t("ops.render_detail.response_actions")}</h3>
              {pre}
            </div>
            {isClosed(a.status) ? (
              <div className={cx("op-closed")}>
                <span>
                  <b>{t("ops.render_detail.closed_alert")}</b>
                  {f.contained_at ? t("ops.closed.contained", { t: String(f.contained_at).slice(11) }) : ""}
                  {f.burned_ha != null ? t("ops.closed.burned", { ha: F.ha(f.burned_ha) }) : ""}
                  <small>{t("ops.render_detail.sent_to_land_management")}</small>
                </span>
              </div>
            ) : isFF ? (
              actFire(a, f)
            ) : (
              actResponder(a, f)
            )}
          </section>
        )}
        <section className={cx("op-sec")}>
          <div className={cx("op-sec-h")}>
            <h3>{t("ops.render_detail.detection_evidence")}</h3>
            <small>
              <span className={cx("op-pxr")} role="img" aria-label={t("ops.render_detail.pixel_size_viirs_375")}>
                <i className={cx("op-px v")} />
                <i className={cx("op-px m")} />
                <span className={cx("num")}>375 m : 1 km</span>
              </span>
              {t("ops.ev.first", { t: f.detected_at.slice(11) })}
            </small>
          </div>
          {evidence(a, f)}
        </section>
        {near ? (
          <section className={cx("op-sec")}>
            <div className={cx("op-sec-h")}>
              <h3>{t("ops.render_detail.nearest_standby_units")}</h3>
              <small>{t("ops.render_detail.by_distance_est_eta")}</small>
            </div>
            {near.length ? <div className={cx("op-reslist")}>{near.map((r) => resRow(r, false))}</div> : <p className={cx("op-none")}>{t("ops.act_fire.no_standby_units")}</p>}
          </section>
        ) : null}
        <section className={cx("op-sec")}>
          <div className={cx("op-sec-h")}>
            <h3>{t("ops.row.assigned_units")}</h3>
          </div>
          {assigned(f)}
        </section>
        <section className={cx("op-sec")}>
          <div className={cx("op-sec-h")}>
            <h3>{t("ops.render_detail.activity_log")}</h3>
            <small className={cx("tn")}>{t("ops.log.n", { n: a.log.length })}</small>
          </div>
          <ol className={cx("op-tl")}>
            {a.log
              .slice()
              .reverse()
              .map((l, i) => (
                <li key={i} className={cx(i === 0 && "last")}>
                  <span className={cx("op-tl-at num")}>{l.at}</span>
                  <span className={cx("op-tl-t")}>
                    {logText(a, l)}
                    <small>{logBy(l)}</small>
                  </span>
                </li>
              ))}
          </ol>
        </section>
      </>
    );
    dFoot = isFF && !isClosed(a.status) ? fireFoot(f) : phoneAck ? actResponder(a, f) : null;
  }

  return (
    <div ref={opRef} className={cx("op")} data-pane="detail" data-testid="ops">
      <section ref={sumRef} className={cx("op-sum")} aria-label={t("ops.boot_once.dispatch_summary")}>
        <header className={cx("pghd")}>
          <div className={cx("ph-1")}>
            <h1>{t("ops.head.name")}</h1>
          </div>
          <div className={cx("cntbar")} role="group" aria-label={t("shell.counts.aria")}>
            {cnts.map((c) => (
              <button
                key={c.key}
                type="button"
                className={cx("cb")}
                data-cnt={c.key}
                aria-pressed={ui.cnt === c.key}
                onClick={() => setUi((u) => ({ ...u, cnt: u.cnt === c.key ? null : c.key }))}
              >
                <span className={cx("cb-k")}>{t(c.label)}</span>
                <span className={cx("cb-vw")}>
                  {c.lv && c.value > 0 ? <i className={cx("cb-dot")} style={{ ["--c" as string]: `var(--alert-${c.lv})` }} aria-hidden="true" /> : null}
                  <b className={cx("cb-v")}>{c.value}</b>
                </span>
              </button>
            ))}
          </div>
        </header>
      </section>
      <div className={cx("op-grid")}>
        <section className={cx("panel op-inbox", drawer && "op-open")} aria-label={t("ops.boot_once.alert_inbox")}>
          <div className={cx("op-rail")} aria-label={t("ops.boot_once.collapsed_alert_inbox")} data-testid="ops-rail">
            <button type="button" className={cx("op-rail-open")} data-open="" aria-label={t("ops.render_rail.expand_alert_inbox")} title={t("ops.render_rail.expand_alert_inbox")} onClick={() => setDrawer(true)}>
              <Bell aria-hidden="true" />
              {unread.length ? <span className={cx("op-tab-n un num")}>{unread.length}</span> : null}
            </button>
            {TABS.map((tb) => (
              <button
                key={tb.id}
                type="button"
                className={cx("op-rail-tab")}
                data-open={tb.id}
                aria-pressed={(sel ? tabOf(sel) : "open") === tb.id}
                title={t(tb.label)}
                onClick={() => {
                  const first = inbox.find((x) => tabOf(x) === tb.id);
                  if (first) select(first.id, true);
                  setDrawer(true);
                }}
              >
                <b className={cx("num")}>{inbox.filter((x) => tb.has(x.status)).length}</b>
                <small>{t(tb.label).replace(" ", "")}</small>
              </button>
            ))}
            <span className={cx("op-rail-sep")} />
            {inbox
              .filter((x) => !isClosed(x.status))
              .map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={cx("op-rail-a", `l${x.level}`, selId === x.id && "sel", unread.includes(x.id) && "un")}
                  data-id={x.id}
                  title={`${atitle(x)} · ${LV(x.level)}`}
                  onClick={() => {
                    select(x.id);
                    setDrawer(false);
                  }}
                >
                  <span className={cx("num")}>{atL(x.at)}</span>
                  <small>{LV(x.level)}</small>
                </button>
              ))}
          </div>
          {phone ? null : ih}
          <div className={cx("op-tabs")} role="tablist" aria-label={t("ops.boot_once.alert_status")} hidden />
          {phone ? null : list}
        </section>
        <section className={cx("op-mapcell")} aria-label={t("ops.boot_once.situation_map")}>
          <OpsMap
            M={M}
            selFireId={sel?.fire_id ?? null}
            layers={ui.layers}
            fitAll={ui.cnt === "busy" || ui.cnt === "ready"}
            pick={ui.pick}
            tripsFit={tripsFit}
            weather={situation.weather}
            onLayer={(k, v) => setUi((u) => ({ ...u, layers: { ...u.layers, [k]: v } }))}
            onFire={(id) => {
              const x = inbox.find((y) => y.fire_id === id && !isClosed(y.status)) ?? inbox.find((y) => y.fire_id === id);
              if (x) select(x.id);
              else {
                // 목업 onFire: 이 불로 온 경보가 없으면 불 이름 + 상태 토스트
                const f = fire(id);
                if (f) opToast({ text: fname(f), sub: t("ops.toast.no_alert", { st: STATUS(f.status) }) });
              }
            }}
            onUnit={(id) => {
              const u = unit(id);
              if (!u) return;
              if (isFF && sel && !isClosed(sel.status) && u.status === "standby") return togglePick(id);
              toast({ text: uname(u), sub: `${uorg(u)} · ${t(`shell.unit_type.${u.type}`)} · ${t("ops.unit.crew", { n: u.crew })} · ${t(`shell.unit_status.${u.status}`)}` });
            }}
            sheet={
              phone ? (
                <section className={cx("sheet op-sheet")} data-stop="peek" aria-label={t("ops.boot_once.alert_inbox")}>
                  <button
                    type="button"
                    className={cx("sh-grip")}
                    aria-label={t("ops.sheet.grip", { stop: t("ops.sheet.stop_peek") })}
                    onClick={(e) => {
                      const s = e.currentTarget.parentElement;
                      if (!s) return;
                      const ST = ["peek", "half", "full"];
                      s.dataset.stop = ST[(ST.indexOf(s.dataset.stop ?? "peek") + 1) % 3];
                    }}
                  />
                  <div className={cx("sh-h")}>
                    {ih}
                    <div className={cx("op-tabs")} hidden />
                  </div>
                  <div className={cx("sh-b")}>{list}</div>
                </section>
              ) : null
            }
          />
        </section>
        <div className={cx("op-pane utabs")} role="tablist" aria-label={t("ops.boot_once.view")}>
          <button type="button" role="tab" data-pane="inbox" aria-selected="false" tabIndex={-1}>
            {t("ops.boot_once.inbox")}
            <span className={cx("cnt")} hidden={!unread.length}>
              {unread.length || ""}
            </span>
          </button>
          <button type="button" role="tab" data-pane="detail" aria-selected="true">
            {t("ops.boot_once.details")}
          </button>
        </div>
        <section className={cx("panel op-detail")} aria-label={t("ops.boot_once.alert_details")} data-testid="ops-detail">
          <div className={cx("op-dtop", a && `op-tone${a.level}`)}>{dTop}</div>
          <div ref={bodyRef} className={cx("op-detail-b")}>
            {dBody}
          </div>
          <div className={cx("op-morehint")}>
            <button
              type="button"
              className={cx("btn sm")}
              hidden={!moreHint}
              onClick={() => bodyRef.current?.scrollBy({ top: Math.round((bodyRef.current?.clientHeight ?? 0) * 0.8), behavior: "smooth" })}
            >
              {t("ops.boot_once.more_below")}
            </button>
          </div>
          <div ref={footRef} className={cx("op-dfoot")}>
            {dFoot}
          </div>
        </section>
      </div>
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={f ? t("ops.contain.q", { f: fname(f) }) : ""}
        closeLabel={t("ops.act_responder.cancel")}
        footer={
          <>
            <button type="button" className={cx("btn")} onClick={() => setConfirmOpen(false)}>
              {t("ops.act_responder.cancel")}
            </button>
            <button type="button" className={cx("btn primary")} onClick={contain}>
              <Check aria-hidden="true" />
              {t("ops.contain.verb")}
            </button>
          </>
        }
      >
        <p>{t("ops.contain.result")}</p>
      </Dialog>
    </div>
  );
}

