"use client";

import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChartColumn, FlaskConical, Ruler, Siren } from "lucide-react";
import { LoginDialog } from "@/features/auth-login";
import { ScopeButton } from "@/features/pick-aoi";
import { pageHref, ROLE_DEF, type Locale, type PageId, type RoleId } from "@/shared/config";
import { useDevice } from "@/shared/lib/use-device";
import { ACTIVE, addDays, dayCount, FIRST_DAY, grid, ytdRatio, ymKey, daysIn } from "../model/home";
import { cx } from "./cx";
import type { Ctx } from "./home-page";
import { HomeDownload } from "./home-download";

/** 기간 글자(목업 pdText): 「2026-11-05 – 11-11」 · 해가 다르면 둘 다 전체 */
export const pdText = (a: string, b: string) => (a === b ? a : `${a} – ${a.slice(0, 4) === b.slice(0, 4) ? b.slice(5) : b}`);

/**
 * 머리 — 줄 1: 화면 이름 + 도구 띠(관심 영역 · 기간 · 내려받기) · 줄 2: 상태 개수 띠(감지 목록 필터) + 역할 화면 넷.
 * 폰은 도구 띠와 역할 화면을 지도 아래 제자리(목업 placeBar — CSS 격자 영역 bar·scr).
 */
export function HomeHead(c: Ctx) {
  const dev = useDevice();
  const phone = dev === "phone";
  return (
    <>
      <section className={cx("hm-entry hm-hd")}>
        <header className={cx("pghd")}>
          <div className={cx("ph-1")}>
            <h1>{c.t("home.short_label.overview")}</h1>
            <div className={cx("ph-tools")}>{phone ? null : <ToolBar {...c} head />}</div>
          </div>
          <div className={cx("hm-hd2")}>
            <div className={cx("hm-cnt")} data-cntbox="">
              <Counts {...c} />
            </div>
            {phone ? null : <Screens {...c} />}
          </div>
        </header>
      </section>
      {phone ? <ToolBar {...c} /> : null}
      {phone ? <Screens {...c} out /> : null}
    </>
  );
}

function Counts(c: Ctx) {
  const live = c.fires.filter((f) => !f.historical && ACTIVE.includes(f.status)).length;
  const fresh = c.alerts.filter((a) => a.status === "new").length;
  const busy = c.units.filter((u) => u.status === "enroute" || u.status === "onscene").length;
  const items = [
    { k: "live" as const, label: c.t("shell.count.live"), v: live, dot: false },
    { k: "new" as const, label: c.t("shell.count.new_alert"), v: fresh, dot: fresh > 0 },
    { k: "busy" as const, label: c.t("shell.count.busy_units"), v: busy, dot: false },
  ];
  return (
    <div className={cx("cntbar")} role="group" aria-label={c.t("shell.counts.aria")}>
      {items.map((it) => (
        <button key={it.k} type="button" className={cx("cb")} data-cnt={it.k} aria-pressed={c.cntSel === it.k} onClick={() => c.setCntSel(c.cntSel === it.k ? null : it.k)}>
          <span className={cx("cb-k")}>{it.label}</span>
          <span className={cx("cb-vw")}>
            {it.dot ? <i className={cx("cb-dot")} aria-hidden="true" style={{ ["--c" as string]: "var(--alert-4)" }} /> : null}
            <b className={cx("cb-v")}>{c.fmt.num(it.v)}</b>
          </span>
        </button>
      ))}
    </div>
  );
}

const SVC: { role: RoleId; page: PageId; Ic: typeof Siren }[] = [
  { role: "responder", page: "ops", Ic: Siren },
  { role: "land", page: "land", Ic: Ruler },
  { role: "commander", page: "cmd", Ic: ChartColumn },
  { role: "scientist", page: "lab", Ic: FlaskConical },
];

/** 역할 화면 넷(목업 renderSvc): 화면 이름 + 그 화면이 다루는 수 하나 */
function Screens(c: Ctx & { out?: boolean }) {
  const router = useRouter();
  const [login, setLogin] = useState<{ role: RoleId; page: PageId } | null>(null);
  const mine = c.role === "firefighter" ? "responder" : c.role;
  /* 경보·출동 = 대기 자원(원장) · 피해 면적 = 진화 완료 불(원장, 산정 대기) · 지휘 통계 = 올해 누계 예년 대비(release 달 값 — 목업은 시나리오 칸) · 예측 = 전망 다음 달(F8 outlook) */
  const g = grid(c.months, "harmonized");
  const cur = c.partial ? c.partial.month - 1 : 0;
  const yc = c.months.length ? ytdRatio(g, cur) : null;
  const ol = c.outlook?.aoi?.find((a) => a.id === c.aoi)?.p?.[0];
  const vals: Record<string, { k: string; v: string | null; u?: string; w?: string; title?: string }> = {
    responder: { k: c.t("home.svc_val.standby"), v: c.fmt.num(c.units.filter((u) => u.status === "standby").length), u: c.t("home.svc_val.x") },
    land: { k: c.t("home.svc_val.pending"), v: c.fmt.num(c.fires.filter((f) => !f.historical && f.status === "contained").length), u: c.t("home.svc_val.x_2") },
    commander: yc ? { k: c.t(c.kor ? "home.svc_val.vs_normal" : "home.svc_val.ytd_vs_normal"), v: c.fmt.num(yc.ratio, 1), u: c.t("home.svc_val.x_3"), title: `${c.dataAoiName} · 1–${cur} · n=${yc.n}` } : { k: c.t("home.svc_val.vs_normal"), v: null },
    scientist: { k: c.t("home.svc_val.30_day_outlook"), v: ol != null ? c.fmt.num(ol / 10, ol / 10 >= 100 ? 0 : 1) : null, title: c.dataAoiName },
  };
  return (
    <nav className={cx("hm-scr")} data-scr="" aria-label={c.t("home.top.role_screens")}>
      {SVC.map(({ role, page, Ic }) => {
        const v = vals[role]!;
        const inner = (
          <>
            <span className={cx("hm-scr-n")}>
              <Ic aria-hidden="true" strokeWidth={1.9} />
              <span>{c.t(`shell.nav.${page}.label`)}</span>
            </span>
            <span className={cx("hm-scr-v")} title={v.title}>
              <span className={cx("hm-scr-k")}>{v.k}</span>
              {v.w ? (
                <b>{v.w}</b>
              ) : (
                <span className={cx("nw")}>
                  <b className={cx("mono")}>{v.v ?? "–"}</b>
                  {v.u && v.v != null ? <span className={cx("hm-scr-u")}>{v.u}</span> : null}
                </span>
              )}
            </span>
          </>
        );
        return role === mine ? (
          <div key={role} className={cx("hm-scr-i is-mine")} aria-current="true">
            {inner}
          </div>
        ) : (
          <button
            key={role}
            type="button"
            className={cx("hm-scr-i")}
            data-svc-r={role}
            aria-label={c.t("home.svc.aria", { p: c.t(`shell.nav.${page}.label`), r: c.t(`shell.role.${role}.label`) })}
            onClick={() => (c.role && ROLE_DEF[c.role as RoleId]?.nav === page ? router.push(pageHref(c.lang as Locale, page)) : setLogin({ role, page }))}
          >
            {inner}
          </button>
        );
      })}
      <LoginDialog open={!!login} onOpenChange={(v) => !v && setLogin(null)} preset={login?.role} then={login?.page} />
    </nav>
  );
}

/** 도구 띠: 관심 영역 · 기간(‹ [기간 ▾] › KST) · 내려받기 */
function ToolBar(c: Ctx & { head?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const r = c.range;
  const today = c.today;
  const shift = (d: number) => {
    if (!r || !today) return;
    const n = dayCount(r.start, r.end);
    let s = addDays(r.start, d * n);
    let e = addDays(r.end, d * n);
    if (e > today) {
      e = today;
      s = addDays(today, -(n - 1));
    }
    if (s < "2001-01-01") s = "2001-01-01";
    c.setRange({ start: s, end: e });
  };
  const label = r ? pdText(r.start, r.end) : "–";
  return (
    <div className={cx("hm-bar", c.head && "is-head")} role="toolbar" aria-label={c.t("home.short_label.area_period_download")}>
      <div className={cx("hm-grp hm-grp-aoi")}>
        <span className={cx("hm-gl")}>{c.t("home.short_label.area")}</span>
        {/* 지역 고르기(전 세계 → 나라 → 시도·1급 → 시군구) — 경북 북부 11개 시군 고정 목록 대신(2026-11-15 사용자 지적) */}
        <span data-aoi="">
          <ScopeButton s={c.scope} label={c.t("home.short_label.choose_area")} />
        </span>
      </div>
      <div className={cx("hm-grp hm-grp-range")} ref={box}>
        <span className={cx("hm-gl")}>{c.t("home.short_label.period")}</span>
        <div className={cx("hm-pd")} data-pd="">
          <div className={cx("period")} role="group" aria-label={c.t("home.render_range.map_period")}>
            <button type="button" className={cx("pd-step")} data-pd="prev" aria-label={c.t("shell.ui.period_prev")} disabled={!r || r.start <= "2001-01-01"} onClick={() => shift(-1)}>
              <ChevronLeft className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
            </button>
            <button type="button" data-pd="open" aria-haspopup="dialog" aria-expanded={open} aria-label={c.t("home.render_range.map_period_2") + label + c.t("home.render_range.open_picker")} onClick={() => setOpen(!open)}>
              <span className={cx("pd-v")}>{label}</span>
              <ChevronDown className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
            </button>
            <button type="button" className={cx("pd-step")} data-pd="next" aria-label={c.t("shell.ui.period_next")} disabled={!r || !today || r.end >= today} onClick={() => shift(1)}>
              <ChevronRight className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
            </button>
            <span className={cx("pd-tz")}>{c.kor ? "KST" : "UTC"}</span>
          </div>
        </div>
        {open && r && today ? <PeriodPop {...c} close={() => setOpen(false)} /> : null}
      </div>
      <div className={cx("hm-grow")} />
      <HomeDownload {...c} />
    </div>
  );
}

/** 달 이동(목업 data-nav/data-rn): 2001-01 ~ 오늘 달 안으로 자른다 */
function moveYm(v: { y: number; m: number }, d: number, hi: string): { y: number; m: number } {
  const kHi = +hi.slice(0, 4) * 12 + +hi.slice(5, 7) - 1;
  const k = Math.max(2001 * 12, Math.min(kHi, v.y * 12 + v.m - 1 + d));
  return { y: Math.floor(k / 12), m: (k % 12) + 1 };
}

/** 달력 칸 키보드(목업 rcBox·dp keydown): ← → 하루 · ↑ ↓ 한 주 — 고를 수 있는 칸끼리 */
function gridKeys(e: RKeyboardEvent<HTMLElement>, sel: string) {
  const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
  const d = (e.target as HTMLElement).closest?.(sel);
  if (!step || !d) return;
  e.preventDefault();
  const all = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(`${sel}:not(:disabled)`));
  all[all.indexOf(d as HTMLButtonElement) + step]?.focus();
}

/** 기간 창: 빠른 선택 + 범위 달력(첫 누름 = 시작, 두 번째 = 끝 · 올리면 미리 칠함 · 화살표) + 날짜 직접 입력 + 전년 대비 */
function PeriodPop(c: Ctx & { close: () => void }) {
  const today = c.today!;
  const r = c.range!;
  const quick = [
    { id: "7d", label: c.t("home.quick_ranges.last_7_days"), start: addDays(today, -6), end: today },
    { id: "month", label: c.t("home.quick_ranges.this_month"), start: `${today.slice(0, 8)}01`, end: today },
  ];
  const [view, setView] = useState(() => ({ y: +r.end.slice(0, 4), m: +r.end.slice(5, 7) }));
  const [a, setA] = useState<string | null>(null);
  const [hov, setHov] = useState<string | null>(null);
  const gref = useRef<HTMLDivElement>(null);
  const n = daysIn(view.y, view.m);
  const first = new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay();
  const wk = c.t("home.dp.weekdays").split(",");
  const lastYm = today.slice(0, 7);
  /* 첫 누름 뒤 마우스가 가리키는 날까지 미리 칠한다(목업 mouseover) */
  let lo = r.start;
  let hi = r.end;
  if (a) {
    lo = a;
    hi = hov ?? a;
    if (lo > hi) [lo, hi] = [hi, lo];
  }
  const focusIn = (sel: string) =>
    requestAnimationFrame(() => {
      const b = gref.current?.querySelector<HTMLButtonElement>(sel);
      if (b && !b.disabled) b.focus();
    });
  const pick = (d: string) => {
    if (!a) {
      setA(d);
      setHov(null);
      focusIn(`[data-rd="${d}"]`);
      return;
    }
    setA(null);
    c.setRange({ start: a, end: d });
  };
  const navBtn = (d: number, label: string, disabled: boolean, two: boolean, right: boolean) => {
    const Ic = right ? ChevronRight : ChevronLeft;
    return (
      <button
        type="button"
        className={cx("hm-dp-nav")}
        data-rn={String(d)}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setView(moveYm(view, d, today));
          focusIn(`[data-rn="${d}"]`);
        }}
      >
        <Ic className={cx("ic ic-btn")} aria-hidden="true" />
        {two ? <Ic className={cx("ic ic-btn")} aria-hidden="true" /> : null}
      </button>
    );
  };
  return (
    <div
      className={cx("hm-pdpop")}
      data-pdpop=""
      role="dialog"
      aria-label={c.t("home.short_label.choose_period")}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        c.close();
      }}
    >
      <div className={cx("hm-pdpop-s")}>
        <span className={cx("hm-pdpop-k")}>{c.t("home.short_label.quick_pick")}</span>
        <div className={cx("hm-quick")} role="group">
          {quick.map((q) => (
            <button key={q.id} type="button" className={cx("hm-q")} data-q={q.id} aria-pressed={q.start === r.start && q.end === r.end} onClick={() => c.setRange({ start: q.start, end: q.end })}>
              {q.label}
            </button>
          ))}
        </div>
      </div>
      <div className={cx("hm-pdpop-s")}>
        <span className={cx("hm-pdpop-k")}>
          {c.t("home.rcal.title")}{" "}
          <small className={cx("dim")} data-rch="">
            {c.t(a ? "home.rcal.hint_end" : "home.rcal.hint_start")}
          </small>
        </span>
        <div className={cx("hm-rcal")} data-rcal="" ref={gref} onKeyDown={(e) => gridKeys(e, "[data-rd]")}>
          <div className={cx("hm-dp-h")}>
            {navBtn(-12, c.t("home.ym_of.previous_year"), view.y - 1 < 2001, true, false)}
            {navBtn(-1, c.t("home.ym_of.previous_month"), ymKey(view.y, view.m) <= "2001-01", false, false)}
            <b className={cx("hm-dp-t num")} aria-live="polite">
              {c.fmt.ym(view.y, view.m)}
            </b>
            {navBtn(1, c.t("home.ym_of.next_month"), ymKey(view.y, view.m) >= lastYm, false, true)}
            {navBtn(12, c.t("home.ym_of.next_year"), String(view.y + 1) > today.slice(0, 4), true, true)}
          </div>
          <div className={cx("hm-dp-w")} aria-hidden="true">
            {wk.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className={cx("hm-dp-g")} onMouseLeave={() => setHov(null)}>
            {Array.from({ length: first }, (_, i) => (
              <span key={`e${i}`} aria-hidden="true" />
            ))}
            {Array.from({ length: n }, (_, i) => {
              const d = `${ymKey(view.y, view.m)}-${String(i + 1).padStart(2, "0")}`;
              const ends = d === lo || d === hi;
              const mid = d > lo && d < hi;
              return (
                <button
                  key={d}
                  type="button"
                  className={cx("hm-dp-d num", ends ? "is-sel" : mid && "is-in", d === today && "is-today")}
                  data-rd={d}
                  disabled={d > today || d < FIRST_DAY}
                  aria-pressed={ends || mid}
                  aria-label={c.t("home.dp.day_aria", { y: view.y, m: view.m, d: i + 1 })}
                  onMouseEnter={() => (a ? setHov(d) : undefined)}
                  onFocus={() => (a ? setHov(d) : undefined)}
                  onClick={() => pick(d)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className={cx("hm-pdpop-s")}>
        <span className={cx("hm-pdpop-k")}>{c.t("home.short_label.enter_dates")}</span>
        <div className={cx("hm-dates")}>
          <DatePick {...c} label={c.t("home.short_label.start_date")} value={r.start} onPick={(v) => c.setRange({ start: v, end: r.end })} />
          <span className={cx("dim")} aria-hidden="true">
            –
          </span>
          <DatePick {...c} label={c.t("home.short_label.end_date")} value={r.end} end onPick={(v) => c.setRange({ start: r.start, end: v })} />
        </div>
      </div>
      <div className={cx("hm-pdpop-s hm-pdpop-y")}>
        <div className={cx("hm-yoyw")} data-yoyw="">
          <button type="button" className={cx("hm-q-yoy")} data-yoy="" aria-pressed={c.yoy} onClick={() => c.setYoy(!c.yoy)}>
            <i className={cx("hm-q-sw")} aria-hidden="true" />
            <span>
              {c.t("home.render_range.year_over_year")}
              <small>{c.t("home.render_range.selected_period_beside_the")}</small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** 날짜 고르기(목업 datePick): OS 기본 날짜 칸 대신 단추 + 달력 팝오버 · 2001-01-01 ~ 오늘 · 화살표·Esc */
function DatePick(c: Ctx & { label: string; value: string; end?: boolean; onPick: (v: string) => void }) {
  const today = c.today!;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => ({ y: +c.value.slice(0, 4), m: +c.value.slice(5, 7) }));
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const close = (focus: boolean) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const end = !!c.end;
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (e.type === "resize" || (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node))) setOpen(false);
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", away);
    /* 자리(목업 place): 단추 아래, 끝 날짜는 오른쪽 맞춤 · 화면 밖이면 위로 */
    const id = requestAnimationFrame(() => {
      const rb = btn.current?.getBoundingClientRect();
      const p = pop.current;
      if (!rb || !p) return;
      const pw = p.offsetWidth;
      const ph = p.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      let x = end ? rb.right - pw : rb.left;
      x = Math.max(8, Math.min(vw - pw - 8, x));
      let y = rb.bottom + 6;
      if (y + ph > vh - 8 && rb.top - 6 - ph >= 8) y = rb.top - 6 - ph;
      setPos({ left: Math.round(x), top: Math.round(Math.max(8, y)) });
      (p.querySelector<HTMLButtonElement>("[aria-current]") ?? p.querySelector<HTMLButtonElement>("[data-d]:not(:disabled)"))?.focus();
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open, end]);
  const n = daysIn(view.y, view.m);
  const first = new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay();
  const ym = ymKey(view.y, view.m);
  const navBtn = (d: number, label: string, disabled: boolean, two: boolean, right: boolean) => {
    const Ic = right ? ChevronRight : ChevronLeft;
    return (
      <button
        type="button"
        className={cx("hm-dp-nav")}
        data-nav={String(d)}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setView(moveYm(view, d, today));
          requestAnimationFrame(() => {
            const b = pop.current?.querySelector<HTMLButtonElement>(`[data-nav="${d}"]`);
            if (b && !b.disabled) b.focus();
          });
        }}
      >
        <Ic className={cx("ic ic-btn")} aria-hidden="true" />
        {two ? <Ic className={cx("ic ic-btn")} aria-hidden="true" /> : null}
      </button>
    );
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cx("input hm-date hm-dbtn num")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={c.label + " " + (c.value || c.t("home.sync.none")) + c.t("home.sync.open_calendar")}
        data-dpick={end ? "end" : "start"}
        onClick={() => {
          if (open) return close(true);
          setView({ y: +c.value.slice(0, 4), m: +c.value.slice(5, 7) });
          setPos(null);
          setOpen(true);
        }}
      >
        <span className={cx("hm-dbtn-v")}>{c.value || c.t("home.sync.pick_a_date")}</span>
        <Calendar className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
      </button>
      {open ? (
        <div
          ref={pop}
          className={cx("hm-dp")}
          role="dialog"
          data-dp=""
          aria-label={c.label + c.t("home.place.picker")}
          style={pos ?? { visibility: "hidden", left: 0, top: 0 }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close(true);
              return;
            }
            gridKeys(e, "[data-d]");
          }}
        >
          <div className={cx("hm-dp-h")}>
            {navBtn(-12, c.t("home.ym_of.previous_year"), view.y - 1 < 2001, true, false)}
            {navBtn(-1, c.t("home.ym_of.previous_month"), ym <= "2001-01", false, false)}
            <b className={cx("hm-dp-t num")} aria-live="polite">
              {c.fmt.ym(view.y, view.m)}
            </b>
            {navBtn(1, c.t("home.ym_of.next_month"), ym >= today.slice(0, 7), false, true)}
            {navBtn(12, c.t("home.ym_of.next_year"), String(view.y + 1) > today.slice(0, 4), true, true)}
          </div>
          <div className={cx("hm-dp-w")} aria-hidden="true">
            {c
              .t("home.dp.weekdays")
              .split(",")
              .map((w, i) => (
                <span key={i}>{w}</span>
              ))}
          </div>
          <div className={cx("hm-dp-g")}>
            {Array.from({ length: first }, (_, i) => (
              <span key={`e${i}`} aria-hidden="true" />
            ))}
            {Array.from({ length: n }, (_, i) => {
              const v = `${ym}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={v}
                  type="button"
                  className={cx("hm-dp-d num", v === c.value && "is-sel", v === today && "is-today")}
                  data-d={v}
                  disabled={v < FIRST_DAY || v > today}
                  aria-current={v === c.value ? "date" : undefined}
                  aria-label={c.t("home.dp.day_aria", { y: view.y, m: view.m, d: i + 1 })}
                  onClick={() => {
                    close(true);
                    c.onPick(v);
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
