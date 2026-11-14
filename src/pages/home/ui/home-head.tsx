"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChartColumn, FlaskConical, Ruler, Siren } from "lucide-react";
import { LoginDialog } from "@/features/auth-login";
import { pageHref, ROLE_DEF, type Locale, type PageId, type RoleId } from "@/shared/config";
import { useDevice } from "@/shared/lib/use-device";
import { ACTIVE, addDays, dayCount, grid, ytdRatio, ymKey, daysIn } from "../model/home";
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
        <select className={cx("select hm-sel")} data-aoi="" aria-label={c.t("home.short_label.choose_area")} value={c.region ?? "all"} onChange={(e) => c.setRegion(e.target.value === "all" ? null : e.target.value)}>
          <option value="all">{c.kor ? c.t("home.aoi.all", { a: c.tl("aoi", "gb-north", "label", c.t("home.aoi.default")) }) : c.cname}</option>
          {c.regions.length ? (
            <optgroup label={c.t("home.aoi.group_kor")}>
              {c.regions.map((g) => (
                <option key={g.id} value={g.id}>
                  {c.regName(g.id)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
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

/** 기간 창: 빠른 선택 + 범위 달력(첫 누름 = 시작, 두 번째 = 끝) */
function PeriodPop(c: Ctx & { close: () => void }) {
  const today = c.today!;
  const r = c.range!;
  const quick = [
    { id: "7d", label: c.t("home.quick_ranges.last_7_days"), start: addDays(today, -6), end: today },
    { id: "month", label: c.t("home.quick_ranges.this_month"), start: `${today.slice(0, 8)}01`, end: today },
  ];
  const [view, setView] = useState(() => ({ y: +r.end.slice(0, 4), m: +r.end.slice(5, 7) }));
  const [a, setA] = useState<string | null>(null);
  const n = daysIn(view.y, view.m);
  const first = new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay();
  const wk = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(c.lang, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + i))));
  const mv = (d: number) => {
    let y = view.y;
    let m = view.m + d;
    while (m < 1) {
      m += 12;
      y--;
    }
    while (m > 12) {
      m -= 12;
      y++;
    }
    setView({ y, m });
  };
  const lastYm = today.slice(0, 7);
  const pick = (d: string) => {
    if (!a) {
      setA(d);
      return;
    }
    const [s, e] = a <= d ? [a, d] : [d, a];
    setA(null);
    c.setRange({ start: s, end: e });
    c.close();
  };
  return (
    <div className={cx("hm-pdpop")} data-pdpop="" role="dialog" aria-label={c.t("home.short_label.choose_period")}>
      <div className={cx("hm-pdpop-s")}>
        <span className={cx("hm-pdpop-k")}>{c.t("home.short_label.quick_pick")}</span>
        <div className={cx("hm-quick")} role="group">
          {quick.map((q) => (
            <button
              key={q.id}
              type="button"
              className={cx("hm-q")}
              data-q={q.id}
              aria-pressed={q.start === r.start && q.end === r.end}
              onClick={() => {
                c.setRange({ start: q.start, end: q.end });
                c.close();
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
      <div className={cx("hm-pdpop-s")}>
        <span className={cx("hm-pdpop-k")}>
          {c.t("home.rcal.title")} <small className={cx("dim")}>{c.t(a ? "home.rcal.hint_end" : "home.rcal.hint_start")}</small>
        </span>
        <div className={cx("hm-rcal")} data-rcal="">
          <div className={cx("hm-dp-h")}>
            <button type="button" className={cx("hm-dp-nav")} aria-label={c.t("home.ym_of.previous_year")} onClick={() => mv(-12)} disabled={view.y <= 2001}>
              <ChevronLeft className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
            <button type="button" className={cx("hm-dp-nav")} aria-label={c.t("home.ym_of.previous_month")} onClick={() => mv(-1)} disabled={view.y <= 2001 && view.m <= 1}>
              <ChevronLeft className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
            <b className={cx("hm-dp-t num")} aria-live="polite">
              {c.fmt.ym(view.y, view.m)}
            </b>
            <button type="button" className={cx("hm-dp-nav")} aria-label={c.t("home.ym_of.next_month")} onClick={() => mv(1)} disabled={ymKey(view.y, view.m) >= lastYm}>
              <ChevronRight className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
            <button type="button" className={cx("hm-dp-nav")} aria-label={c.t("home.ym_of.next_year")} onClick={() => mv(12)} disabled={ymKey(view.y + 1, view.m) > lastYm}>
              <ChevronRight className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
          </div>
          <div className={cx("hm-dp-w")} aria-hidden="true">
            {wk.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className={cx("hm-dp-g")}>
            {Array.from({ length: first }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: n }, (_, i) => {
              const d = `${ymKey(view.y, view.m)}-${String(i + 1).padStart(2, "0")}`;
              const sel = d === (a ?? r.start) || (!a && d === r.end);
              const inR = !a && d > r.start && d < r.end;
              return (
                <button key={d} type="button" className={cx("hm-dp-d num", sel && "is-sel", inR && "is-in", d === today && "is-today")} data-rd={d} disabled={d > today} aria-pressed={sel || inR} aria-label={c.fmt.ym(view.y, view.m) + " " + (i + 1)} onClick={() => pick(d)}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
