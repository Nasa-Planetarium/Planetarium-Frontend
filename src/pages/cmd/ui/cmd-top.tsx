"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download, Play, Square } from "lucide-react";
import { ScopeButton } from "@/features/pick-aoi";
import type { Fire } from "@/shared/agency";
import { annualOf, ids, years, ytdCompare, type Board, type Sensor } from "../model/cmd";
import type { Ctx } from "./cmd-page";
import { CmdMap } from "./cmd-map";
import { C, Eras, LineChart, type LineSeries } from "./charts";
import { cx } from "./cx";
import { downloadText, toCSV, useFmt, useWidth } from "./use-ui";

const CLOSED = ["contained", "out", "resolved"];
const SENSOR_KEY: Record<Sensor, string> = { harmonized: "cmd.ui.harmonized", raw: "cmd.ui.unharmonized", modis: "cmd.ui.modis_raw", viirs: "cmd.ui.viirs_raw" };
export const SENSOR_LONG: Record<Sensor, string> = { harmonized: "cmd.ui.harmonized_viirs_equivalent", raw: "cmd.ui.unharmonized_modis_viirs_spl", modis: "cmd.ui.modis_raw_detections", viirs: "cmd.ui.viirs_raw_detections" };
export const UNIT_KEY: Record<Sensor, string> = { harmonized: "cmd.ui.viirs_equivalent_hotspots", raw: "cmd.ui.hotspots_mixed_sensors", modis: "cmd.ui.modis_hotspots", viirs: "cmd.ui.viirs_hotspots" };
export const sensorName = (T_: Ctx["T_"], s: Sensor) => T_(SENSOR_KEY[s]);

/** 지역 이름표(목업 regionLabel) */
export function regionLabel(c: Pick<Ctx, "T_" | "names" | "kor" | "aoiLabel" | "cname">, regions: string[], n: number) {
  if (!regions.length) return c.T_("cmd.aoi.name_lv", { aoi: c.aoiLabel, n });
  const ns = regions.map((r) => c.names[r] ?? r);
  return ns.length <= 2 ? ns.join("·") : c.T_("cmd.rg.more", { a: ns[0] ?? "", n: ns.length - 1 });
}

export function CmdTop(c: Ctx) {
  const { board, q, view, setView, T_ } = c;
  const F = useFmt();
  const hist = useMemo(() => (c.kor ? c.fires.filter((f) => f.historical) : []), [c.fires, c.kor]);

  /* 연도 재생(목업 data-play): 850ms 마다 한 해 */
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || !board) return;
    const Y1 = board.cm.last_year;
    const t = setInterval(() => {
      setView((v) => {
        if (v.year >= Y1) {
          setPlaying(false);
          return v;
        }
        return { ...v, year: v.year + 1, month: null, cum: false, sel: null };
      });
    }, 850);
    return () => clearInterval(t);
  }, [playing, board, setView]);
  const play = () => {
    if (playing) return setPlaying(false);
    if (board && view.year >= board.cm.last_year) setView((v) => ({ ...v, year: (board?.cm.first_year ?? 2001) - 1 }));
    setPlaying(true);
  };

  return (
    <div className={cx("cm-screen")}>
      <Head {...c} />
      <section className={cx("cm-stage")} aria-label={T_("cmd.ui.detection_activity_map")}>
        <div className={cx("cm-mtop")}>
          <div className={cx("cm-mread")}>
            <h2 className={cx("cm-mname")}>{T_("cmd.ui.hotspot_detection_density")}</h2>
            <span className={cx("cm-msub")}>
              {!view.cum && q.sensor === "viirs" && view.year < 2012
                ? T_("cmd.ui.viirs_from_2012")
                : [q.season === "all" ? "" : T_(`cmd.ui.${q.season}`), q.conf || q.frp || q.agri ? T_("cmd.ui.filters_on") : ""].filter(Boolean).join(", ")}
            </span>
          </div>
          <div className={cx("utabs cm-mseg")} role="tablist" aria-label={T_("cmd.ui.map_period")}>
            <button type="button" role="tab" aria-selected={!view.cum} onClick={() => setView((v) => ({ ...v, cum: false }))}>
              {T_("cmd.ui.selected_year")}
            </button>
            <button type="button" role="tab" aria-selected={view.cum} onClick={() => setView((v) => ({ ...v, cum: true }))}>
              <span className={cx("cm-mseg-y")}>2001–2026 </span>
              {T_("cmd.ui.cumulative")}
            </button>
          </div>
        </div>
        <CmdMap {...c} hist={hist} />
      </section>
      <TimeBar {...c} playing={playing} onPlay={play} F={F} />
      <div className={cx("cm-side")}>
        <section className={cx("panel cm-resp")} aria-label={T_("cmd.ui.response")}>
          <div className={cx("cm-resp-b")}>{c.kor ? <Resp {...c} F={F} /> : <Det {...c} />}</div>
          <AnnualLine {...c} F={F} />
        </section>
      </div>
    </div>
  );
}

/* ── 머리: 이름 + 범위 + 필터(지역·지표) / 개수 띠 ── */
function Head(c: Ctx) {
  const { board, q, setQ, T_, kor } = c;
  const F = useFmt();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", out);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const all = board ? board.regions.map((r) => r.id) : [];
  const nAll = all.length;
  const toggle = (id: string) =>
    setQ((p) => {
      const rs = p.regions.includes(id) ? p.regions.filter((x) => x !== id) : [...p.regions, id];
      return { ...p, regions: rs.length === nAll ? [] : rs };
    });
  const Y1 = board?.cm.last_year ?? 2026;
  const v = board ? annualOf(c.ann, Y1, q.sensor) : null;
  const yc = board && v != null ? ytdCompare(board, ids(board, q.regions), q.sensor, Y1, c.ann) : null;
  const R = board?.response;
  const recs = c.fires.filter((f) => !f.historical);
  const done = recs.filter((f) => CLOSED.includes(f.status)).length;
  const scroll = (sel: string) => document.querySelector(`[data-scroll="${sel}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  type Cnt = { key: string; label: string; value: string | number | null; unit?: string; delta?: string; title?: string; go: string };
  const C1: Cnt[] = [
    { key: "obs", label: T_("cmd.ui.satellite_detections"), value: v == null ? null : F.num(v), delta: yc?.ratio == null ? undefined : `${yc.ratio >= 1 ? "▲ " : "▼ "}${yc.ratio.toFixed(1)}${T_("cmd.ui.s101")}`, go: "stage" },
  ];
  const cnts: Cnt[] = kor
    ? [
        ...C1,
        { key: "ev", label: T_("cmd.ui.incidents"), value: recs.length, go: "ev" },
        { key: "fa", label: T_("cmd.ui.median_first_arrival"), value: R?.med == null ? null : F.num(R.med, R.med % 1 ? 1 : 0), unit: T_("cmd.ui.min"), go: "resp" },
        { key: "done", label: T_("cmd.ui.contained"), value: done, go: "ev" },
      ]
    : [...C1, { key: "det", label: T_("shell.det.clusters"), value: null, go: "resp" }, { key: "pts", label: T_("shell.det.points"), value: c.ptsState === "ok" && !c.view.cum ? F.num(c.ptsTotal) : null, title: String(c.view.year), go: "resp" }];
  return (
    <header className={cx("pghd cm-head")}>
      <div className={cx("ph-1")}>
        <h1>{T_("cmd.ui.command_stats")}</h1>
        <div className={cx("ph-tools cm-filt")} role="group" aria-label={T_("cmd.ui.page_filters")}>
          <ScopeButton s={c.scope} label={T_("cmd.ui.region")} />
          <div className={cx("cm-rgwrap")} ref={wrap}>
            <button type="button" className={cx("cm-rgbtn")} aria-haspopup="true" aria-expanded={open} aria-label={T_("cmd.ui.region")} onClick={() => setOpen((o) => !o)}>
              <span>{q.regions.length ? regionLabel(c, q.regions, nAll) : T_("cmd.rg.all_n", { name: regionLabel(c, [], nAll) })}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            <div className={cx("cm-pop")} hidden={!open}>
              <button type="button" className={cx("cm-opt cm-optall")} aria-pressed={!q.regions.length} onClick={() => setQ((p) => ({ ...p, regions: [] }))}>
                <Check size={16} aria-hidden="true" />
                {T_("cmd.rg.all", { aoi: c.aoiLabel })}
              </button>
              {all.map((id) => (
                <button type="button" key={id} className={cx("cm-opt")} aria-pressed={q.regions.includes(id)} onClick={() => toggle(id)}>
                  <Check size={16} aria-hidden="true" />
                  {c.names[id] ?? id}
                </button>
              ))}
            </div>
          </div>
          <div className={cx("seg cm-seg")} role="group" aria-label={T_("cmd.ui.metric")}>
            {(["harmonized", "raw", "modis", "viirs"] as Sensor[]).map((s) => (
              <button type="button" key={s} title={T_(SENSOR_LONG[s])} aria-pressed={q.sensor === s} onClick={() => c.setSensor(s)}>
                {sensorName(T_, s)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className={cx("cntbar")} role="group" aria-label={T_("shell.counts.aria")}>
          {cnts.map((k) => (
            <button type="button" key={k.key} className={cx("cb")} data-cnt={k.key} aria-pressed="false" onClick={() => scroll(k.go)}>
              <span className={cx("cb-k")}>{k.label}</span>
              <span className={cx("cb-vw")}>
                <b className={cx("cb-v")}>{k.value ?? "–"}</b>
                {k.unit && k.value != null ? <span className={cx("cb-u")}>{k.unit}</span> : null}
                {k.delta ? <span className={cx("cb-d")}>{k.delta}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/* ── 연도 타임라인(재생줄) ── */
function TimeBar(c: Ctx & { playing: boolean; onPlay: () => void; F: ReturnType<typeof useFmt> }) {
  const { board, q, view, setView, T_, F } = c;
  const [trackRef, tw] = useWidth<HTMLDivElement>();
  if (!board) return <div className={cx("cm-time")} data-scroll="time" />;
  const Y0 = board.cm.first_year;
  const Y1 = board.cm.last_year;
  const YS = years(board.cm);
  const vals = c.ann.map((a) => a[q.sensor]);
  const mx = Math.max(...vals.filter((v): v is number => v != null), 1);
  const v = annualOf(c.ann, view.year, q.sensor);
  const yc = v != null && !view.cum ? ytdCompare(board, ids(board, q.regions), q.sensor, view.year, c.ann) : null;
  const unit = T_(q.sensor === "harmonized" ? "cmd.ui.det_unit" : "cmd.ui.det_unit_raw");
  const left = (i: number) => `calc(7px + ${i / (YS.length - 1)} * (100% - 14px))`;
  const tot = c.ann.reduce((s, x) => s + (x[q.sensor] ?? 0), 0);
  return (
    <div className={cx("cm-time", view.cum && "cm-cumt")} data-scroll="time">
      <button type="button" className={cx("cm-play", c.playing && "on")} aria-label={T_(c.playing ? "cmd.ui.stop" : "cmd.ui.play_years")} onClick={c.onPlay}>
        {c.playing ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      <div className={cx("cm-yr")}>
        <b className={cx("num")}>{view.cum ? T_("cmd.ui.cumulative") : view.year}</b>
        <span>
          {view.cum ? (
            <>
              {q.sensor === "viirs" ? "2012–2026 " : T_("cmd.ui.26_yr")}
              {T_("cmd.ui.total")}
              <b className={cx("num")}>{F.num(tot)}</b>
            </>
          ) : v == null ? (
            T_("cmd.ui.no_value_before_viirs")
          ) : (
            <>
              <b className={cx("num")}>{F.num(v)}</b> {unit}
              {view.year === Y1 ? T_("cmd.thru_d", { d: board.cm.last_day }) : ""},{" "}
              <span className={cx(yc?.ratio != null && yc.ratio >= 1.5 && "up")}>
                {T_("cmd.ui.vs_past_median")}
                <b className={cx("num")}>{yc?.ratio == null ? "–" : yc.ratio.toFixed(1)}</b>
                {yc?.ratio == null ? "" : T_("cmd.ui.s101")}
              </span>
            </>
          )}
        </span>
      </div>
      <div className={cx("cm-tscroll")} role="group" aria-label={T_("cmd.ui.year_bars_swipe_sideways_on")}>
        <div className={cx("cm-track")} ref={trackRef}>
          <div className={cx("cm-bars")}>
            {c.ann.map((a, i) => {
              const x = a[q.sensor];
              return (
                <i
                  key={a.year}
                  className={cx("cm-bar", a.year === view.year && !view.cum && "on", x == null && "na")}
                  style={{ left: left(i), ...(x == null ? {} : { height: `${Math.max(4, (x / mx) * 100).toFixed(1)}%` }) }}
                  title={`${T_("cmd.fmt.year", { y: a.year })} ${x == null ? T_("cmd.ui.pre_viirs") : `${F.num(x)}, ${T_(UNIT_KEY[q.sensor])}`}`}
                />
              );
            })}
          </div>
          <input
            className={cx("cm-range", view.cum && "cm-cumr")}
            type="range"
            min={Y0}
            max={Y1}
            step={1}
            value={view.year}
            aria-label={T_("cmd.ui.highlighted_year")}
            onChange={(e) => setView((p) => ({ ...p, year: +e.target.value, month: null, cum: false, sel: null }))}
          />
          <div className={cx("cm-ticks")}>
            {[2001, 2006, 2011, 2016, 2021, 2026].map((y) => (
              <span key={y} style={{ left: `calc(7px + ${(y - Y0) / (YS.length - 1)} * (100% - 14px))` }}>
                {y}
              </span>
            ))}
          </div>
          <Eras from={Y0} to={Y1} width={tw} aria={T_("shell.eras.label")} title={(sat, sen, d) => `${sat} ${sen} · ${T_("shell.eras.start", { d })}`} />
        </div>
      </div>
    </div>
  );
}

/* ── 대응 성과(한국) ── */
function Resp(c: Ctx & { F: ReturnType<typeof useFmt> }) {
  const { board, T_, F } = c;
  const [ref, W0] = useWidth<HTMLDivElement>();
  const R = board?.response;
  if (!board || !R) return <div ref={ref} />;
  const fname = (id: string) => c.fires.find((f) => f.id === id);
  const W = Math.max(240, W0 || 300);
  const H = 52;
  const pl = 8;
  const pr = 12;
  const mx = Math.max(60, Math.ceil(Math.max(0, ...R.arr.map((x) => x.min)) / 15) * 15);
  const X = (v: number) => pl + (v / mx) * (W - pl - pr);
  const seen: Record<number, number> = {};
  const realN = R.arr.filter((x) => x.real).length;
  const ORD = ["onscene", "enroute", "return", "standby"] as const;
  const bmx = Math.max(1, ...R.burn.map((b) => b.ha));
  type Row = { year: number; ha: number; n: number; zero?: false } | { zero: true; year: number; from: number };
  const rows: Row[] = [];
  R.burn
    .slice()
    .reverse()
    .forEach((b) => {
      const last = rows[rows.length - 1];
      if (!b.n && last && last.zero) last.from = b.year;
      else rows.push(b.n ? b : { zero: true, year: b.year, from: b.year });
    });
  const cm = board.cm;
  const mdK = (d: string) => F.md(+d.slice(5, 7), +d.slice(8, 10));
  return (
    <div ref={ref} data-scroll="resp">
      <div className={cx("cm-rhd")}>
        <h2 className={cx("cm-rt")}>{T_("cmd.ui.response")}</h2>
        {c.fires.some((f) => !f.historical) ? (
          <span className={cx("cm-rfrom")}>
            {mdK(R.from)}
            {T_("cmd.ui.onward")}
          </span>
        ) : null}
      </div>
      <div className={cx("cm-rs")}>
        <h3 className={cx("cm-rh")}>{T_("cmd.ui.detection_to_first_arrival")}</h3>
        {R.med == null ? (
          <p className={cx("cm-none")}>{T_("cmd.ui.no_measurable_dispatches")}</p>
        ) : (
          <>
            <svg className={cx("cm-strip")} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${T_("cmd.ui.minutes_from_detection_to_fi")}${R.med}${T_("cmd.ui.min")}`}>
              <line className={cx("cm-st-ax")} x1={pl} x2={W - pr} y1="22" y2="22" />
              {Array.from({ length: mx / 15 + 1 }, (_, k) => k * 15).map((v) => (
                <g key={v}>
                  <line className={cx("cm-st-tk")} x1={X(v).toFixed(1)} x2={X(v).toFixed(1)} y1="22" y2="26" />
                  <text className={cx("cm-st-t")} x={X(v).toFixed(1)} y="40" textAnchor={v === 0 ? "start" : v === mx ? "end" : "middle"}>
                    {v}
                    {v === mx ? T_("cmd.ui.min") : ""}
                  </text>
                </g>
              ))}
              <line className={cx("cm-st-med")} x1={X(R.med).toFixed(1)} x2={X(R.med).toFixed(1)} y1="8" y2="30" />
              {R.arr.map((x) => {
                const k = Math.round(X(x.min) / 9);
                seen[k] = (seen[k] ?? 0) + 1;
                const y = 22 - ((seen[k] ?? 1) - 1) * 9;
                const f = fname(x.fire_id);
                return (
                  <circle key={x.fire_id} className={cx("cm-st-d", x.real && "is-real")} cx={X(x.min).toFixed(1)} cy={y} r="4.5">
                    <title>{`${f ? fireName(c, f) : x.fire_id}, ${x.min}${T_("cmd.ui.min")}${x.real ? T_("cmd.ui.on_scene_report") : T_("cmd.ui.est")}`}</title>
                  </circle>
                );
              })}
            </svg>
            <p className={cx("cm-stkey")}>
              <span>
                {T_("cmd.ui.dispatches")}
                <b className={cx("num")}>{R.arr.length}</b>
                {T_("cmd.ui.events")}
              </span>
              {realN ? (
                <span>
                  <svg width="10" height="10" aria-hidden="true">
                    <circle className={cx("cm-st-d is-real")} cx="5" cy="5" r="4" />
                  </svg>
                  {T_("cmd.ui.arrival_report")}
                </span>
              ) : null}
              <span title={T_("cmd.ui.travel_time_of_the_nearest_s")}>
                <svg width="10" height="10" aria-hidden="true">
                  <circle className={cx("cm-st-d")} cx="5" cy="5" r="4" />
                </svg>
                {T_("cmd.ui.estimated")}
              </span>
              <span>
                <svg width="2" height="12" aria-hidden="true">
                  <line className={cx("cm-st-med")} x1="1" x2="1" y1="0" y2="12" />
                </svg>
                {T_("cmd.ui.median")}
              </span>
            </p>
          </>
        )}
      </div>
      <div className={cx("cm-rs")}>
        <h3 className={cx("cm-rh")}>
          {T_("cmd.ui.resources_active")}
          <span className={cx("cm-rh-v")}>
            <b className={cx("num")}>{R.busy}</b> / {R.total}
            {T_("cmd.ui.s228")}
          </span>
        </h3>
        <div className={cx("cm-ubar")} role="img" aria-label={`${T_("cmd.ui.resources")}${R.total}${T_("cmd.ui.total_active")}${R.busy}${T_("cmd.ui.s228")}`}>
          {ORD.filter((k) => R.by[k]).map((k) => (
            <i key={k} className={cx(`cm-u-${k}`)} style={{ flex: R.by[k] }} />
          ))}
        </div>
        <ul className={cx("cm-ukey")}>
          {ORD.map((k) => (
            <li key={k}>
              <i className={cx(`cm-u-${k}`)} />
              {T_(`shell.unit_status.${k}`)} <b className={cx("num")}>{R.by[k] ?? 0}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className={cx("cm-rs")}>
        <h3 className={cx("cm-rh")}>{T_("cmd.ui.burned_area_by_year")}</h3>
        <table className={cx("tbl cm-burn")} aria-label={T_("cmd.ui.burned_area_recorded_per_yea")}>
          <tbody>
            {rows.map((b) =>
              b.zero ? (
                <tr key={b.year} className={cx("cm-burn-0")}>
                  <td className={cx("num")}>{b.from === b.year ? b.year : `${b.from}–${String(b.year).slice(2)}`}</td>
                  <td className={cx("r")} colSpan={2}>
                    {T_("cmd.ui.0_records")}
                  </td>
                </tr>
              ) : (
                <tr key={b.year}>
                  <td className={cx("num")}>
                    {b.year}
                    {b.year === cm.last_year ? (
                      <small>
                        {cm.last_month}.{cm.last_day}
                        {T_("cmd.ui.ytd")}
                      </small>
                    ) : null}
                  </td>
                  <td className={cx("r num rowbar")} style={{ ["--w" as string]: (b.ha / bmx).toFixed(3) }}>
                    {b.ha ? F.ha(b.ha >= 100 ? Math.round(b.ha) : Math.round(b.ha * 10) / 10) : "0 ha"}
                  </td>
                  <td className={cx("r num cm-burn-n")}>
                    {b.n}
                    {T_("cmd.ui.events")}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export const fireName = (c: Pick<Ctx, "T_">, f: Fire) => {
  const k = `data.fire.${f.id}.name`;
  const v = c.T_(k);
  return v === k ? f.name : v;
};

/* ── 한국 밖: 감지 묶음(감지 점 자료가 아직 없어 「자료 준비 중」) ── */
function Det(c: Ctx) {
  /* 대응 성과는 한국 시나리오(목)만 — 밖은 실제 감지 점 수(고른 해 · 고른 범위)를 적는다 */
  return (
    <div data-scroll="resp">
      <div className={cx("cm-rhd")}>
        <h2 className={cx("cm-rt")}>{c.T_("shell.det.title")}</h2>
      </div>
      <p className={cx("dt-none")} role="status">
        {c.ptsState === "ok" && !c.view.cum
          ? c.T_("cmd.real.det_n", { y: c.view.year, a: c.aoiLabel, n: new Intl.NumberFormat().format(c.ptsTotal) })
          : c.ptsState === "wide"
            ? c.T_("cmd.real.pts_wide")
            : c.ptsState === "pending"
              ? c.T_("cmd.real.loading")
              : c.ptsState === "rate"
                ? c.T_("shell.err.rate_limited")
                : c.T_("shell.err.request")}
      </p>
    </div>
  );
}

/* ── 연간 위성 관측 추이(3선) ── */
function AnnualLine(c: Ctx & { F: ReturnType<typeof useFmt> }) {
  const { T_, F, view, q } = c;
  const [ref, W0, H0] = useWidth<HTMLDivElement>();
  const ko = F.lang === "ko";
  const endW = ko ? 78 : 96;
  const W = Math.max(260, W0);
  const H = H0 ? Math.max(170, Math.min(220 * 1.9, H0)) : 220;
  const series: LineSeries[] = [
    { k: "modis", name: T_("cmd.ui.modis_raw"), short: "MODIS", color: C.modis, width: 1.8, values: c.ann.map((a) => ({ x: a.year, y: a.modis })) },
    { k: "harmonized", name: T_("cmd.ui.harmonized"), color: C.harm, width: 2, area: true, values: c.ann.map((a) => ({ x: a.year, y: a.harmonized })) },
    { k: "raw", name: T_("cmd.ui.unharmonized_spliced"), short: T_("cmd.ui.unharmonized"), color: C.ink, width: 1.5, dash: "2 4", values: c.ann.map((a) => ({ x: a.year, y: a.raw })) },
  ];
  const csv = () => {
    const name: Record<string, string> = { modis: "MODIS 원시", harmonized: "보정 지표", raw: "보정 전(이어 붙임)" };
    downloadText(
      `emberline_cmd_annual_${q.regions.length ? q.regions.slice().sort().join("-") : "all"}_${c.board?.provenance.updated_at.slice(0, 10) ?? ""}.csv`,
      toCSV(c.ann, [{ label: "연도", get: (r) => r.year }, ...series.map((s) => ({ label: name[s.k] ?? s.k, get: (r: (typeof c.ann)[number]) => r[s.k as Sensor] }))]),
      undefined,
      { data_version: c.board?.provenance.data_version ?? null, aoi: q.regions.length ? q.regions.slice().sort().join(" ") : "all", period: c.ann.length ? `${c.ann[0]!.year}/${c.ann[c.ann.length - 1]!.year}` : "", freq: "year" },
    );
  };
  return (
    <div className={cx("cm-resp-line")}>
      <h3 className={cx("cm-rh")}>{T_("cmd.ui.annual_satellite_detections")}</h3>
      <div className={cx("cm-chart cm-fill cm-fill-l chart")} ref={ref}>
        {c.ann.length && W0 ? <LineChart series={series} width={W} height={H} endW={endW} marker={view.cum ? null : view.year} label={T_("cmd.ui.annual_hotspot_detections_3")} axisFmt={(v) => F.axis(v)} /> : null}
      </div>
      <div className={cx("cm-lsrc")}>
        <span>{T_("cmd.ui.data_nasa_firms_modis_c6_1_v")}</span>
        <button type="button" className={cx("btn sm")} title={T_("cmd.ui.annual_series_csv")} onClick={csv}>
          <Download size={16} aria-hidden="true" />
          {T_("cmd.ui.trend_csv")}
        </button>
      </div>
    </div>
  );
}
export type { Board };
