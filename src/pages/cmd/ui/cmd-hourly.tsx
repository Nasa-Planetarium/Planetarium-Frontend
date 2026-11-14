"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKE, type PointerEvent as RPE, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { tzAbbr } from "@/shared/lib";
import { binsOf, busiest, dParts, hourlyStats, meanOf, medTotal, peakOf, UNITS, type Board, type Day, type HourStat, type Peak, type Query } from "../model/cmd";
import type { Ctx } from "./cmd-page";
import { Hatch } from "./charts";
import { cx } from "./cx";
import { useFmt, useWidth } from "./use-ui";

type Dow = "all" | "wd" | "we";
const UNIT_NAME: Record<string, string> = { day: "cmd.ui.days", week: "cmd.ui.weekly_totals", month: "cmd.ui.monthly_totals", quarter: "cmd.ui.quarterly_totals", year: "cmd.ui.annual_totals" };

/**
 * 시간대별 분포 + 기간 다이얼(목업 cmd.js hr*): 리드 값 칸 · 시각별 띠 그래프(최소–최대 · 25–75% · 중앙값 · 평균선 · 일별 값 · 전년) ·
 * 표로 보기 · 기간 다이얼(요일 · 빠른 기간 · 막대 브러시 + 손잡이 · 눈금).
 * 일 자료는 AgencyPort 묶음(board.hourly.days — 2001-01-01 부터 결측 날 포함).
 */
export function CmdHourly({ board, T_, src, setSrc, occurOff, kor }: { board: Board; q: Query; T_: Ctx["T_"]; kor: boolean; src: "occur" | "sat"; setSrc: (s: "occur" | "sat") => void; occurOff?: boolean }) {
  const F = useFmt();
  const days = board.hourly.days;
  const N = days.length;
  const [dow, setDow] = useState<Dow>("all");
  const [yoy, setYoy] = useState(false);
  const [showDays, setShowDays] = useState(false);
  const [zoom, setZoom] = useState<"year" | "all">("year");
  const busy = useMemo(() => busiest(days), [days]);
  const [ab, setAb] = useState<[number, number]>(busy);
  /* 자료가 바뀌면(지역·기준) 가장 활발한 30일이었으면 다시 그 창으로 */
  const prevBusy = useRef(busy);
  useEffect(() => {
    setAb((cur) => (cur[0] === prevBusy.current[0] && cur[1] === prevBusy.current[1] ? busy : [Math.min(cur[0], N - 1), Math.min(cur[1], N - 1)]));
    prevBusy.current = busy;
  }, [busy, N]);
  const [a, b] = ab;
  const inDow = (d: Day) => dow === "all" || (dow === "wd" ? !d.we : d.we);
  const span = days.slice(a, b + 1);
  const sel = span.filter((d) => d.v && inDow(d));
  const nMiss = span.filter((d) => !d.v).length;
  const nDow = span.filter((d) => d.v && !inDow(d)).length;
  const st = useMemo(() => hourlyStats(sel), [sel]);
  const mean = useMemo(() => meanOf(sel), [sel]);
  const low = sel.length > 0 && Math.max(0, ...st.map((x) => x.median ?? 0)) <= 1;
  /* 전년: 같은 날짜 1년 전(2001 앞이면 비교 안 함) */
  const prev = useMemo(() => {
    if (!yoy) return null;
    const pa = a - 365;
    const pb = b - 365;
    if (pa < 0) return null;
    const pd = days.slice(pa, pb + 1).filter((d) => d.v && (dow === "all" || (dow === "wd" ? !d.we : d.we)));
    return { pa, pb, days: pd, stats: pd.length ? hourlyStats(pd) : null, mean: pd.length ? meanOf(pd) : null };
  }, [yoy, a, b, days, dow]);

  const KO = F.lang === "ko";
  const WK = (d: number) => (KO ? ("일월화수목금토"[d] ?? "") : new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + d))));
  const mdOf = (i: number) => {
    const p = dParts(days[i]?.date ?? "2001-01-01");
    return KO ? `${p[1]}.${p[2]}` : `${F.monthName(p[1])} ${p[2]}`;
  };
  const mdwOf = (i: number) => `${mdOf(i)} (${WK(days[i]?.dow ?? 0)})`;
  const enRange = (ya: number, yb: number, sa: string, sb: string) => (ya === yb ? `${sa} – ${sb}, ${ya}` : `${sa}, ${ya} – ${sb}, ${yb}`);
  const yA = dParts(days[a]?.date ?? "2001-01-01")[0];
  const yB = dParts(days[b]?.date ?? "2001-01-01")[0];
  const rangeTxt = (withDow: boolean) => {
    const f = withDow ? mdwOf : mdOf;
    return KO ? `${yA}.${f(a)} ~ ${yA === yB ? "" : `${yB}.`}${f(b)}` : enRange(yA, yB, f(a), f(b));
  };
  const n1 = (v: number | null) => (v == null ? "–" : F.num(v, Math.abs(v % 1) > 1e-9 ? 1 : 0));
  const f2 = (v: number | null) => (v == null ? "–" : F.num(v, v < 10 ? 1 : 0));
  const pk = peakOf(st, mean);
  const ppk = prev?.stats ? peakOf(prev.stats, prev.mean) : null;
  const tm = sel.length ? medTotal(sel) : null;
  const ptm = prev?.days.length ? medTotal(prev.days) : null;
  const rng = KO ? `${yA}.${mdOf(a)}–${yA === yB ? "" : `${yB}.`}${mdOf(b)}` : enRange(yA, yB, mdOf(a), mdOf(b));
  const ex = [nMiss ? `${T_("cmd.ui.missing5")}${nMiss}${T_("cmd.ui.days")}` : "", nDow ? `${dow === "wd" ? T_("cmd.ui.weekend") : T_("cmd.ui.weekday2")} ${nDow}${T_("cmd.ui.days")}` : ""].filter(Boolean).join(", ");

  const presets: { n: string; label: string; title?: string }[] = [
    { n: "busy", label: T_("cmd.ui.busiest_30_days"), title: T_("cmd.ui.30_days_with_the_most_detect") },
    { n: "7", label: T_("cmd.ui.last_7_days") },
    { n: "14", label: T_("cmd.ui.14_days") },
    { n: "30", label: T_("cmd.ui.30_days") },
    { n: "0", label: T_("cmd.ui.all_time") },
  ];
  const preOn = (n: string) => (n === "busy" ? a === busy[0] && b === busy[1] : b === N - 1 && (+n ? a === N - +n : a === 0));
  const pick = (n: string) => {
    if (n === "busy") {
      setAb(busy);
      setZoom("year");
    } else {
      setAb([+n ? N - +n : 0, N - 1]);
      setZoom(+n ? "year" : "all");
    }
  };
  const sumOf = (ds: Day[]) => ds.reduce((t, d) => t + (d.total ?? 0), 0);

  return (
    <section className={cx("panel cm-hr")} aria-label={T_("cmd.ui.hourly_distribution_period_s")}>
      <div className={cx("panel-h cm-hr-h")}>
        <h2>{T_("cmd.ui.hourly_distribution")}</h2>
        <div className={cx("cm-hr-ctl")}>
          <div className={cx("seg cm-seg")} role="group" aria-label={T_("cmd.ui.time_basis")}>
            {/* 실제 자료(release)에는 발생 시각이 없다 — 위성 관측 시각만(지어내지 않음) */}
            <button type="button" title={occurOff ? T_("cmd.real.no_occur") : T_("cmd.ui.estimated_distribution_daily")} aria-pressed={src === "occur"} disabled={occurOff} onClick={() => setSrc("occur")}>
              {T_("cmd.ui.ignition_time")}
              <span className={cx("cm-hr-q")}>{T_("cmd.ui.est")}</span>
            </button>
            <button type="button" title={T_("cmd.ui.detections_grouped_by_overpa")} aria-pressed={src === "sat"} onClick={() => setSrc("sat")}>
              {T_("cmd.ui.overpass_time")}
            </button>
          </div>
          <button type="button" className={cx("cm-switch")} role="switch" aria-checked={yoy} title={T_("cmd.ui.show_the_same_period_one_yea")} onClick={() => setYoy((v) => !v)}>
            <i />
            {T_("cmd.ui.year_over_year")}
          </button>
        </div>
      </div>
      <div className={cx("panel-b cm-hr-b")}>
        <p className={cx("cm-hrkv")} aria-live="polite">
          <Kv k={T_("cmd.ui.period")}>
            <span className={cx("num")}>{rng}</span>
          </Kv>
          <Kv k={T_("cmd.ui.days2")}>
            <span className={cx("num")}>{sel.length}</span>
            {T_("cmd.ui.days")}
            {ex ? (
              <small className={cx("cm-k")}>
                {" "}
                {ex}
                {T_("cmd.ui.excl3")}
              </small>
            ) : null}
          </Kv>
          {!sel.length ? (
            <Kv k={T_("cmd.ui.status")}>{T_("cmd.ui.no_countable_days")}</Kv>
          ) : !pk || pk.h < 0 ? (
            <Kv k={T_("cmd.ui.status")}>{T_("cmd.ui.no_detections")}</Kv>
          ) : (
            <>
              <Kv k={T_("cmd.ui.peak_hour")}>
                <span className={cx("num")}>{pk.h}</span>
                {T_("cmd.ui.00")}
                {yoy && prev ? (
                  <small className={cx("cm-k")}>
                    {T_("cmd.ui.prev")}
                    {ppk && ppk.h >= 0 ? T_("cmd.fmt.hour", { h: ppk.h }) : "–"}
                  </small>
                ) : null}
              </Kv>
              <Kv k={T_("cmd.ui.daily_mean")}>
                <span className={cx("num")}>{f2(pk.val)}</span>
              </Kv>
              <Kv k={T_("cmd.ui.median_daily_total")}>
                <span className={cx("num")}>{n1(tm == null ? null : Math.round(tm * 10) / 10)}</span>
                {yoy && prev ? (
                  <small className={cx("cm-k")}>
                    {T_("cmd.ui.prev")}
                    {n1(ptm == null ? null : Math.round(ptm * 10) / 10)}
                  </small>
                ) : null}
              </Kv>
            </>
          )}
        </p>
        <div className={cx("cm-hr-yoy")} hidden={!yoy}>
          {yoy ? (
            prev ? (
              <>
                <div className={cx("cm-hy-h")}>
                  <b>{T_("cmd.ui.year_over_year")}</b>
                  <span className={cx("num")}>{`${rng}${T_("cmd.ui.vs")}${KO ? `${yA - 1}.${mdOf(prev.pa)}–${mdOf(prev.pb)}` : enRange(yA - 1, yB - 1, mdOf(prev.pa), mdOf(prev.pb))}`}</span>
                  <span className={cx("dim")}>{T_("cmd.ui.period_totals_weekday_filter")}</span>
                </div>
                <div className={cx("cm-hy-g")}>
                  <YoyCell label={T_("cmd.ui.harmonized")} cur={sumOf(days.slice(a, b + 1))} prev={sumOf(days.slice(prev.pa, prev.pb + 1))} T_={T_} n1={n1} />
                </div>
              </>
            ) : (
              <span className={cx("cm-hy-wait")}>{T_("cmd.ui.n_a")}</span>
            )
          ) : null}
        </div>
        <HrCard st={st} mean={mean} sel={sel} low={low} showDays={showDays} setShowDays={setShowDays} prev={prev} T_={T_} n1={n1} pk={pk} nMiss={nMiss} nDow={nDow} src={src} kor={kor} />
        <Dial days={days} a={a} b={b} setAb={setAb} zoom={zoom} inDow={inDow} dow={dow} setDow={setDow} presets={presets} preOn={preOn} pick={pick} rangeTxt={rangeTxt(true)} T_={T_} WK={WK} />
      </div>
    </section>
  );
}

const Kv = ({ k, children }: { k: string; children: ReactNode }) => (
  <span className={cx("cm-kv")}>
    <span className={cx("cm-k")}>{k}</span>
    <b>{children}</b>
  </span>
);

function YoyCell({ label, cur, prev, T_, n1 }: { label: string; cur: number; prev: number; T_: Ctx["T_"]; n1: (v: number | null) => string }) {
  const d = cur - prev;
  const sg = (v: number, k: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(k);
  return (
    <div className={cx("cm-hy")}>
      <span className={cx("cm-hst-k")}>{label}</span>
      <div className={cx("cm-hy-v")}>
        <b className={cx("num")}>{n1(cur)}</b>
        <span className={cx("num dim")}>
          {T_("cmd.ui.prev2")}
          {n1(prev)}
        </span>
      </div>
      <span className={cx("cm-dlt", d > 0 ? "up" : d < 0 ? "dn" : "eq")}>{prev === 0 ? `${sg(d, 0)}${T_("cmd.ui.prev_02")}` : `${sg(d, 0)} (${sg((d / prev) * 100, 1)}%)`}</span>
    </div>
  );
}

/* ── 위 그래프 ── */
function HrCard(p: {
  st: HourStat[];
  mean: (number | null)[];
  sel: Day[];
  low: boolean;
  showDays: boolean;
  setShowDays: (v: boolean) => void;
  prev: { stats: HourStat[] | null; mean: (number | null)[] | null } | null;
  T_: Ctx["T_"];
  n1: (v: number | null) => string;
  pk: Peak | null;
  nMiss: number;
  nDow: number;
  src: "occur" | "sat";
  kor: boolean;
}) {
  const { st, mean, sel, low, T_, n1 } = p;
  /* 24행 표 머리 정렬(목업 EM.ui.sortTable · KB R43): 누른 열 내림 → 다시 누르면 오름. 처음은 시각 순 */
  const [sort, setSort] = useState<{ col: number; dir: "ascending" | "descending" } | null>(null);
  const F = useFmt();
  const [ref, W0] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<{ h: number; x: number; y: number } | null>(null);
  const W = Math.max(280, W0 || 0);
  const narrow = W < 560;
  const H = Math.round(Math.max(232, Math.min(330, W * 0.26)));
  const R = 8;
  const T = 12;
  const B = 26;
  const ps = p.prev?.stats ?? null;
  const pv = (h: number) => (low ? (p.prev?.mean?.[h] ?? null) : (ps?.[h]?.median ?? null));
  const body = Math.max(0.5, ...st.map((s) => Math.max(s.p75 ?? 0, s.median ?? 0)), ...mean.map((v) => v ?? 0), ...(ps ? ps.map((_, h) => pv(h) ?? 0) : [0]));
  const maxTop = Math.max(0, ...st.map((s) => s.max ?? 0));
  const clip = maxTop > body * 2.5;
  const nice = (v: number) => {
    const pw = Math.pow(10, Math.floor(Math.log10(v)));
    return ([1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => k * pw >= v - 1e-9) ?? 10) * pw;
  };
  const ym = nice(clip ? body * 1.8 : Math.max(body * 1.15, maxTop));
  const Y = (v: number) => T + (H - T - B) * (1 - Math.min(v, ym) / ym);
  const stp = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => ym / s <= 6 && Math.abs(ym / s - Math.round(ym / s)) < 1e-9) ?? ym / 4;
  const tk = (v: number) => F.num(v, stp < 1 ? (Math.abs(v * 10 - Math.round(v * 10)) > 1e-9 ? 2 : 1) : 0).replace(/\.0+$/, "");
  const grid: number[] = [];
  for (let v = 0; v <= ym + 1e-9; v += stp) grid.push(v);
  const tkW = Math.max(...grid.map((v) => tk(v).length * 7.5));
  const L = Math.max(narrow ? 34 : 44, Math.ceil(tkW) + 11);
  const bw = (W - L - R) / 24;
  const bandW = Math.min(bw * 0.6, 26);
  const tickW = Math.min(bw * 0.78, 34);
  const skip = bw < 15 ? 3 : bw < 22 ? 2 : 1;
  const al = Math.min(0.32, Math.max(0.012, 4 / Math.max(1, sel.length)));
  const pkSet = new Set(p.pk && p.pk.h >= 0 ? [p.pk.h] : []);
  const rr = (cx0: number, lo: number, hi: number, w: number, c: string) => <rect className={cx(c)} x={(cx0 - w / 2).toFixed(1)} y={(Y(hi) - 1).toFixed(1)} width={w.toFixed(1)} height={Math.max(2, Y(lo) - Y(hi) + 2).toFixed(1)} rx={Math.min(4, w / 2).toFixed(1)} />;
  const HRS = (h: number) => T_("cmd.fmt.hour", { h });
  const meanPts = mean.map((v, h) => (v == null ? null : ([L + bw * (h + 0.5), Y(v)] as const))).filter((x): x is readonly [number, number] => !!x);
  const onMove = (e: RPE<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const h = Math.floor((e.clientX - r.left - L) / bw);
    if (h < 0 || h > 23 || !sel.length) return setTip(null);
    setTip({ h, x: L + bw * (h + 0.5), y: e.clientY - r.top - 20 });
  };
  const stt = tip ? st[tip.h] : null;
  return (
    <div className={cx("cm-hr-card", low && "is-low")}>
      <div className={cx("cm-hr-row")}>
        <div className={cx("cm-hr-leg")}>
          <span>
            <i className={cx("cm-hk cm-hk-band")} />
            {T_("cmd.ui.min_max_range")}
          </span>
          <span className={cx("cm-hk-meanl")}>
            <i className={cx("cm-hk cm-hk-mean")} />
            {T_("cmd.ui.mean")}
          </span>
          <span>
            <i className={cx("cm-hk cm-hk-iqr")} />
            {T_("cmd.ui.25_75_range")}
          </span>
          <span>
            <i className={cx("cm-hk cm-hk-med")} />
            {T_("cmd.ui.median")}
          </span>
          <span>
            <i className={cx("cm-hk cm-hk-day")} />
            {T_("cmd.ui.daily_values")}
          </span>
          <span hidden={!ps}>
            <i className={cx("cm-hk cm-hk-prev")} />
            {low ? T_("cmd.ui.prev_year_mean") : T_("cmd.ui.prev_year_median")}
          </span>
        </div>
        <label className={cx("cm-hr-tg")}>
          <input type="checkbox" checked={p.showDays} onChange={(e) => p.setShowDays(e.target.checked)} />
          <i className={cx("cm-hr-cb")} aria-hidden="true" />
          {T_("cmd.ui.overlay_daily_values")}
        </label>
      </div>
      <div className={cx("cm-hr-box")} ref={ref} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
        <svg className={cx("cm-hr-svg")} role="img" viewBox={`0 0 ${W} ${H}`} height={H} aria-label={`${T_("cmd.ui.hourly_distribution2")}${sel.length}${T_("cmd.ui.days")}`}>
          {grid.map((v) => (
            <g key={v}>
              <line className={cx(v ? "cm-hg" : "cm-ha")} x1={L} x2={W - R} y1={Y(v).toFixed(1)} y2={Y(v).toFixed(1)} />
              <text className={cx("cm-ht")} x={L - 7} y={(Y(v) + 3.5).toFixed(1)} textAnchor="end">
                {v ? tk(v) : "0"}
              </text>
            </g>
          ))}
          {tip ? <rect className={cx("cm-hhl")} x={(L + bw * tip.h).toFixed(1)} y={T} width={bw.toFixed(1)} height={H - T - B} rx="4" /> : null}
          {st.map((x, h) => {
            const c0 = L + bw * (h + 0.5);
            const cnt = new Map<number, number>();
            if (p.showDays && x.n) sel.forEach((d) => cnt.set(d.v?.[h] ?? 0, (cnt.get(d.v?.[h] ?? 0) ?? 0) + 1));
            const dw = Math.min(bw * 0.86, 38);
            const pvh = pv(h);
            return (
              <g key={h}>
                {h % skip === 0 ? (
                  <text className={cx("cm-ht", pkSet.has(h) && "cm-hpk")} x={c0.toFixed(1)} y={H - 8} textAnchor="middle">
                    {h}
                  </text>
                ) : null}
                {pkSet.has(h) ? <circle className={cx("cm-hpkd")} cx={c0.toFixed(1)} cy={H - B + 5} r="2.2" /> : null}
                {x.n && x.min != null && x.max != null ? (
                  <>
                    {rr(c0, x.min, x.max, bandW, "cm-hb")}
                    {x.max > ym ? (
                      <text className={cx("cm-ht cm-hcap")} x={c0.toFixed(1)} y={T + 1} textAnchor="middle">
                        ▲{bw >= 22 ? n1(x.max) : ""}
                      </text>
                    ) : null}
                    {rr(c0, x.p25 ?? 0, x.p75 ?? 0, bandW, "cm-hi")}
                    {[...cnt.entries()].map(([v, c]) => {
                      const len = Math.max(3, dw * Math.sqrt(c / sel.length));
                      return <line key={v} className={cx("cm-hd")} x1={(c0 - len / 2).toFixed(1)} x2={(c0 + len / 2).toFixed(1)} y1={Y(v).toFixed(1)} y2={Y(v).toFixed(1)} strokeOpacity={Math.max(0.18, 1 - Math.pow(1 - al, c)).toFixed(3)} />;
                    })}
                    <line className={cx("cm-hm", low && "is-aux")} x1={(c0 - tickW / 2).toFixed(1)} x2={(c0 + tickW / 2).toFixed(1)} y1={Y(x.median ?? 0).toFixed(1)} y2={Y(x.median ?? 0).toFixed(1)} />
                    {ps && ps[h]?.n && pvh != null ? <line className={cx("cm-hp")} x1={(c0 - tickW / 2).toFixed(1)} x2={(c0 + tickW / 2).toFixed(1)} y1={Y(pvh).toFixed(1)} y2={Y(pvh).toFixed(1)} /> : null}
                  </>
                ) : null}
              </g>
            );
          })}
          {sel.length ? (
            <>
              <polyline className={cx("cm-hmean", low && "is-main")} points={meanPts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ")} />
              {meanPts.map((q, h) => (
                <circle key={h} className={cx("cm-hmeand", low && "is-main")} cx={q[0].toFixed(1)} cy={q[1].toFixed(1)} r="2.4">
                  <title>{`${HRS(h)}${T_("cmd.ui.mean3")}${F.num(mean[h] ?? 0, 2)}`}</title>
                </circle>
              ))}
            </>
          ) : (
            <text className={cx("cm-ht cm-hempty")} x={W / 2} y={H / 2} textAnchor="middle">
              {p.nMiss && !p.nDow ? T_("cmd.ui.no_data_in_the_selected_peri") : T_("cmd.ui.no_data_for_these_weekdays_i")}
            </text>
          )}
        </svg>
        <div className={cx("cm-hr-tip")} role="presentation" style={tip && stt ? { display: "block", left: tip.x + 200 > W ? tip.x - 180 : tip.x + 12, top: Math.max(0, Math.min(H - 180, tip.y)) } : { display: "none" }}>
          {tip && stt ? (
            <>
              <h4>{`${HRS(tip.h)} – ${HRS(tip.h + 1)}`}</h4>
              {(
                [
                  [T_("cmd.ui.max2"), n1(stt.max)],
                  ["75%", n1(stt.p75)],
                  [T_("cmd.ui.median"), n1(stt.median), "on"],
                  [T_("cmd.ui.mean"), mean[tip.h] == null ? "–" : F.num(mean[tip.h] ?? 0, 2)],
                  ["25%", n1(stt.p25)],
                  [T_("cmd.ui.min2"), n1(stt.min)],
                ] as [string, string, string?][]
              ).map(([k, v, c]) => (
                <div key={k} className={cx(c)}>
                  <span>{k}</span>
                  <b className={cx("num")}>{v}</b>
                </div>
              ))}
              <p>{`${stt.n}${T_("cmd.ui.days4")}${p.src === "occur" ? T_("cmd.ui.ignition_time") : T_("cmd.ui.overpass_time")}`}</p>
            </>
          ) : null}
        </div>
      </div>
      <p className={cx("cm-hr-src")}>
        <span className={cx("cm-k")}>{T_("cmd.ui.basis")}</span>
        <span>{p.src === "sat" ? T_("cmd.hr.sat_note", { tz: p.kor ? tzAbbr("Asia/Seoul") : T_("cmd.hr.solar") }) : T_("cmd.ui.estimated_ignition_time_dail")}</span>
      </p>
      <details className={cx("cm-hr-tbl")}>
        <summary>{T_("cmd.ui.show_as_table_24_hours")}</summary>
        <div className={cx("tbl-wrap")}>
          <table className={cx("tbl")}>
            <thead>
              <tr>
                {[T_("cmd.ui.hour"), T_("cmd.ui.min2"), "p25", T_("cmd.ui.median"), "p75", T_("cmd.ui.max2"), T_("cmd.ui.mean"), T_("cmd.ui.days2"), ...(ps ? [T_("cmd.ui.prev_year_median")] : [])].map((label, i) => (
                  <th key={i} className={cx(i > 0 && "r")} aria-sort={sort?.col === i ? sort.dir : "none"}>
                    <button type="button" className={cx("th-sort")} onClick={() => setSort((o) => ({ col: i, dir: o?.col === i && o.dir === "descending" ? "ascending" : "descending" }))}>
                      {label}
                      <ChevronDown aria-hidden="true" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const key = (x: HourStat, h: number): number | null =>
                  [h, x.min, x.p25, x.median, x.p75, x.max, mean[h] ?? null, x.n, ps?.[h]?.median ?? null][sort?.col ?? 0] ?? null;
                const order = st.map((x, h) => ({ x, h }));
                if (sort) {
                  const m = sort.dir === "ascending" ? 1 : -1;
                  order.sort((a, b) => {
                    const u = key(a.x, a.h);
                    const v = key(b.x, b.h);
                    if (u == null && v == null) return 0;
                    if (u == null) return 1;
                    if (v == null) return -1;
                    return (u - v) * m || a.h - b.h;
                  });
                }
                return order;
              })().map(({ x, h }) => (
                <tr key={h}>
                  <td>
                    <span className={cx("num")}>{String(h).padStart(2, "0")}</span>
                    {T_("cmd.ui.00")}
                  </td>
                  {[x.min, x.p25, x.median, x.p75, x.max].map((v, i) => (
                    <td key={i} className={cx("num r")}>
                      {n1(v)}
                    </td>
                  ))}
                  <td className={cx("num r")}>{mean[h] == null ? "–" : F.num(mean[h] ?? 0, 2)}</td>
                  <td className={cx("num r dim")}>{x.n}</td>
                  {ps ? <td className={cx("num r dim")}>{n1(ps[h]?.median ?? null)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/* ── 기간 다이얼 ── */
function Dial(p: {
  days: Day[];
  a: number;
  b: number;
  setAb: (v: [number, number]) => void;
  zoom: "year" | "all";
  inDow: (d: Day) => boolean;
  dow: Dow;
  setDow: (d: Dow) => void;
  presets: { n: string; label: string; title?: string }[];
  preOn: (n: string) => boolean;
  pick: (n: string) => void;
  rangeTxt: string;
  T_: Ctx["T_"];
  WK: (d: number) => string;
}) {
  const { days, a, b, T_ } = p;
  const F = useFmt();
  const [ref, W0] = useWidth<HTMLDivElement>();
  const N = days.length;
  const W = Math.max(200, W0 || 0);
  const H = 64;
  /* 막대 범위: 전 기간이면 전체, 아니면 선택 창 가운데 1년(창이 넓으면 1.2배) */
  const [drag, setDrag] = useState<{ mode: "a" | "b" | "move" | "new"; off: number; anchor: number } | null>(null);
  const [frozen, setFrozen] = useState<[number, number] | null>(null);
  const domain = (): [number, number] => {
    if (p.zoom === "all") return [0, N - 1];
    const w = Math.max(366, Math.ceil((b - a + 1) * 1.2));
    if (w >= N) return [0, N - 1];
    const s0 = Math.max(0, Math.min(N - w, Math.round((a + b) / 2) - Math.floor(w / 2)));
    return [s0, s0 + w - 1];
  };
  const [d0, d1] = frozen ?? domain();
  const len = d1 - d0 + 1;
  const dayW = W / len;
  const unit = UNITS.find((u) => (len / u.per) * 2.2 <= W) ?? UNITS[4];
  const bins = binsOf(days, d0, d1, unit.k, a, b, p.inDow);
  const mx = Math.max(1, ...bins.map((x) => x.sum));
  const gap = dayW * unit.per > 4 ? 1 : 0;
  const cxp = (i: number) => Math.max(0, Math.min(W, (i - d0) * dayW));
  const x1 = cxp(a);
  const x2 = cxp(b + 1);
  const HW = 15;
  const hx = x2 - x1 >= HW ? { a: x1, b: x2 } : { a: (x1 + x2) / 2 - HW / 2, b: (x1 + x2) / 2 + HW / 2 };
  const idxAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    if (x >= r.width - 2) return d1;
    if (x <= 2) return d0;
    return Math.max(d0, Math.min(d1, d0 + Math.floor(x / dayW)));
  };
  const down = (e: RPE<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    const i = idxAt(e.clientX, e.currentTarget);
    const hd = t.closest("[data-h]") as HTMLElement | null;
    if (hd) {
      const m = hd.dataset.h === "a" ? "a" : "b";
      setDrag({ mode: m, off: i - (m === "a" ? a : b), anchor: 0 });
    } else if (t.closest("[data-bsel]") && !(a <= d0 && b >= d1)) setDrag({ mode: "move", off: i - a, anchor: 0 });
    else {
      setDrag({ mode: "new", off: 0, anchor: i });
      p.setAb([i, i]);
    }
    setFrozen([d0, d1]);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const move = (e: RPE<HTMLDivElement>) => {
    if (!drag) return;
    const i = idxAt(e.clientX, e.currentTarget);
    if (drag.mode === "a") p.setAb([Math.max(d0, Math.min(b, i - drag.off)), b]);
    else if (drag.mode === "b") p.setAb([a, Math.max(a, Math.min(d1, i - drag.off))]);
    else if (drag.mode === "move") {
      const l = b - a;
      const na = Math.max(d0, Math.min(d1 - l, i - drag.off));
      p.setAb([na, na + l]);
    } else p.setAb([Math.min(drag.anchor, i), Math.max(drag.anchor, i)]);
  };
  const up = () => {
    setDrag(null);
    setFrozen(null);
  };
  const key = (which: "a" | "b") => (e: RKE) => {
    let s = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (e.key === "PageUp") s = 30;
    if (e.key === "PageDown") s = -30;
    if (e.key === "Home") s = -N;
    if (e.key === "End") s = N;
    if (!s) return;
    e.preventDefault();
    if (e.shiftKey && Math.abs(s) === 1) s *= 7;
    if (which === "a") p.setAb([Math.max(0, Math.min(b, a + s)), b]);
    else p.setAb([a, Math.max(a, Math.min(N - 1, b + s))]);
  };
  /* 눈금: 월 → 분기 → 해 → 2년 → 5년 중 글자 간격 46px 이상인 첫 단계 */
  const lv = [
    { k: "m", per: 30.44 },
    { k: "q", per: 91.3 },
    { k: "y", per: 365.25 },
    { k: "y2", per: 730.5 },
    { k: "y5", per: 1826 },
  ].find((l) => l.per * dayW >= 46) ?? { k: "y10", per: 3652 };
  const tks: { x: number; y: boolean; t: string | number }[] = [];
  let lastX = -99;
  for (let i = d0; i <= d1; i++) {
    const pd = dParts(days[i]?.date ?? "2001-01-01");
    if (pd[2] !== 1) continue;
    const ok = lv.k === "m" ? true : lv.k === "q" ? (pd[1] - 1) % 3 === 0 : pd[1] === 1 && (lv.k === "y" || pd[0] % (lv.k === "y2" ? 2 : lv.k === "y5" ? 5 : 10) === 0);
    const x = (i - d0) * dayW;
    if (!ok || x - lastX < 40 || x > W - 18) continue;
    lastX = x;
    tks.push({ x, y: pd[1] === 1, t: pd[1] === 1 || (lv.k !== "m" && lv.k !== "q") ? pd[0] : F.month(pd[1]) });
  }
  const HID = "cmh-brush";
  return (
    <div className={cx("cm-hr-card cm-hr-dial")}>
      <div className={cx("cm-hr-row cm-hr-drow")}>
        <div className={cx("cm-hr-rng")}>
          <span>{T_("cmd.ui.period")}</span>
          <b className={cx("num")}>{p.rangeTxt}</b>
        </div>
        <div className={cx("cm-hr-chips")} role="group" aria-label={T_("cmd.ui.weekday")}>
          {(
            [
              ["all", "cmd.ui.all_days"],
              ["wd", "cmd.ui.weekdays"],
              ["we", "cmd.ui.weekends"],
            ] as [Dow, string][]
          ).map(([d, k]) => (
            <button type="button" key={d} aria-pressed={p.dow === d} onClick={() => p.setDow(d)}>
              {T_(k)}
            </button>
          ))}
        </div>
        <div className={cx("cm-hr-chips")} role="group" aria-label={T_("cmd.ui.quick_periods")}>
          {p.presets.map((x) => (
            <button type="button" key={x.n} className={cx(x.n === "busy" && "cm-hr-busy")} title={x.title} aria-pressed={p.preOn(x.n)} onClick={() => p.pick(x.n)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className={cx("cm-brush", drag && "drag")} ref={ref} style={{ ["--bh-g" as string]: `${Math.min(12, Math.max(0, (hx.b - hx.a) / 2)).toFixed(1)}px` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <svg className={cx("cm-spark")} aria-hidden="true" viewBox={`0 0 ${W} ${H}`}>
          <Hatch id={HID} />
          {bins.map((bn) => {
            const x = (bn.i0 - d0) * dayW;
            const w = Math.max(0.8, (bn.i1 - bn.i0 + 1) * dayW - gap);
            const n = bn.i1 - bn.i0 + 1;
            const d = days[bn.i0];
            const on = bn.i1 >= a && bn.i0 <= b;
            const off = on && unit.k === "day" && !!d && !p.inDow(d);
            const part = on && unit.k !== "day" && (bn.inc < bn.sum || bn.i0 < a || bn.i1 > b);
            const tl = `${unit.k === "day" ? `${d?.date} (${p.WK(d?.dow ?? 0)})` : `${d?.date} ~ ${days[bn.i1]?.date}, ${T_(UNIT_NAME[unit.k] ?? "")}`}, ${bn.miss === n ? T_("cmd.ui.missing") : F.num(bn.sum)}`;
            if (bn.miss === n)
              return (
                <rect key={bn.i0} className={cx("cm-sp na")} x={x.toFixed(2)} y={H - 12} width={w.toFixed(2)} height="6" fill={`url(#${HID})`}>
                  <title>{tl}</title>
                </rect>
              );
            const h = Math.max(2, (H - 12) * Math.sqrt(bn.sum / mx));
            const rx = Math.min(1.5, w / 2).toFixed(2);
            return (
              <g key={bn.i0}>
                <rect className={cx("cm-sp", (on || part) && "on", (off || part) && "off")} x={x.toFixed(2)} y={(H - 6 - h).toFixed(1)} width={w.toFixed(2)} height={h.toFixed(1)} rx={rx}>
                  <title>{tl}</title>
                </rect>
                {part && bn.inc > 0 ? <rect className={cx("cm-sp on")} x={x.toFixed(2)} y={(H - 6 - Math.max(1.5, (H - 12) * Math.sqrt(bn.inc / mx))).toFixed(1)} width={w.toFixed(2)} height={Math.max(1.5, (H - 12) * Math.sqrt(bn.inc / mx)).toFixed(1)} rx={rx} pointerEvents="none" /> : null}
                {bn.miss ? <rect x={x.toFixed(2)} y={H - 5} width={w.toFixed(2)} height="3" fill={`url(#${HID})`} /> : null}
              </g>
            );
          })}
        </svg>
        <div className={cx("cm-bsel")} data-bsel="" style={{ left: x1, width: Math.max(2, x2 - x1) }} />
        {(["a", "b"] as const).map((k) => (
          <button
            type="button"
            key={k}
            className={cx("cm-bh")}
            data-h={k}
            role="slider"
            aria-label={T_(k === "a" ? "cmd.ui.start_date" : "cmd.ui.end_date")}
            aria-valuemin={0}
            aria-valuemax={N - 1}
            aria-valuenow={k === "a" ? a : b}
            aria-valuetext={days[k === "a" ? a : b]?.date}
            style={{ left: hx[k] }}
            onKeyDown={key(k)}
          />
        ))}
      </div>
      <div className={cx("cm-bticks")} aria-hidden="true">
        {tks.map((t) => (
          <span key={t.x} className={cx(t.y && "y")} style={{ left: `${t.x.toFixed(1)}px` }}>
            {t.t}
          </span>
        ))}
      </div>
      <div className={cx("cm-hr-foot")}>
        <p className={cx("cm-cap")}>{`${T_("cmd.ui.bars2")}${T_(UNIT_NAME[unit.k] ?? "")}${T_("cmd.ui.hatched_missing")}`}</p>
      </div>
    </div>
  );
}
