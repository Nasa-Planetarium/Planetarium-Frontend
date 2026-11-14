"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import { calendar, ids, median, niceMax, SEASON_MONTHS, type Board } from "../model/cmd";
import type { Ctx } from "./cmd-page";
import { C, Hatch, Stack } from "./charts";
import { fireName, sensorName } from "./cmd-top";
import { cx } from "./cx";
import { useFmt, useWidth } from "./use-ui";

/** 계절성 · 자료와 방법 · 사건 기록(목업 cmd.js D · 자료와 방법 · E 구역) */
export function CmdLow(c: Ctx & { board: Board }) {
  return (
    <>
      <div className={cx("cm-low")}>
        <Season {...c} />
        <Src {...c} />
      </div>
      <Events {...c} />
    </>
  );
}

/* ── 계절성: 막대 = 월별 과거 중앙값, 선 = 그 해 ── */
function Season(c: Ctx & { board: Board }) {
  const { board, q, view, T_ } = c;
  const F = useFmt();
  const [ref, W0, H0] = useWidth<HTMLDivElement>();
  const cm = board.cm;
  const rs = ids(board, q.regions);
  const ev = view.cum ? null : view.year;
  const bs = q.sensor === "raw" ? ((ev ?? cm.baseline_to) < cm.viirs_start_year ? "modis" : "viirs") : q.sensor;
  const by = bs === "viirs" ? [cm.viirs_start_year, cm.baseline_to] : [cm.baseline_from, cm.baseline_to];
  const bcal = useMemo(() => calendar(board, rs, bs), [board, rs, bs]);
  const cal = useMemo(() => calendar(board, rs, q.sensor), [board, rs, q.sensor]);
  const med: number[] = [];
  const mn: number[] = [];
  for (let i = 0; i < 12; i++) {
    const vs = bcal.rows.filter((r) => r.year >= (by[0] ?? 0) && r.year <= (by[1] ?? 0) && r.year !== ev && r.vals[i] != null).map((r) => r.vals[i] as number);
    med.push(median(vs) ?? 0);
    mn.push(vs.length);
  }
  const row = cal.rows.find((r) => r.year === view.year);
  const yv = view.cum ? null : (row?.vals ?? null);
  const ymiss = row?.missing;
  const W = Math.max(240, W0 || 0);
  const H = Math.max(176, Math.min(260, H0 || 0) || 176);
  const pl = 34;
  const pr = 6;
  const pb = 22;
  let mx = niceMax(Math.max(...med, 1) * 1.7);
  const yTop = yv ? Math.max(0, ...yv.filter((v): v is number => v != null)) : 0;
  if (yTop > mx && yTop <= mx * 2.5) mx = niceMax(yTop * 1.05);
  const over = yTop > mx;
  const pt = over ? 40 : 14;
  const brk = pt - 10;
  const cw = (W - pl - pr) / 12;
  const X = (i: number) => pl + i * cw;
  const Y = (v: number) => pt + (1 - Math.min(v, mx) / mx) * (H - pt - pb);
  const inSeason = SEASON_MONTHS[q.season];
  const part = q.season !== "all";
  const HID = "cmh-sea";
  let d = "";
  let pen = false;
  (yv ?? []).forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${(X(i) + cw / 2).toFixed(1)} ${Y(v).toFixed(1)}`;
    pen = true;
  });
  const tot = med.reduce((a, b) => a + b, 0) || 1;
  const spring = ((med[2] ?? 0) + (med[3] ?? 0)) / tot;
  const aut = ((med[9] ?? 0) + (med[10] ?? 0)) / tot;
  const missN = ymiss ? ymiss.filter(Boolean).length : 0;
  return (
    <section className={cx("panel cm-season")} aria-label={T_("cmd.ui.seasonality")}>
      <div className={cx("panel-h")}>
        <h2>{T_("cmd.ui.seasonality")}</h2>
        <span className={cx("cm-tag")}>{view.cum ? T_("cmd.ui.cumulative_view") : `${view.year}${T_("cmd.ui.line_overlay")}`}</span>
      </div>
      <div className={cx("panel-b cm-season-b")}>
        <div className={cx("cm-chart cm-seasonc chart")} ref={ref}>
          {W0 ? (
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={T_("cmd.ui.monthly_past_median_bars")}>
              <Hatch id={HID} />
              {part ? inSeason.map((m) => <rect key={m} x={X(m - 1).toFixed(1)} y={pt} width={cw.toFixed(1)} height={H - pt - 8} fill={C.line} fillOpacity=".55" />) : null}
              {[0, mx / 2, mx].map((v) => (
                <g key={v}>
                  <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? C.line2 : C.line} />
                  {tt({ x: pl - 5, y: Y(v) + 3.5, s: F.axis(v), a: "end" })}
                </g>
              ))}
              {over ? (
                <>
                  <line x1={pl} x2={W - pr} y1={brk} y2={brk} stroke={C.line2} strokeDasharray="2 3" />
                  <path d={`M${pl - 9} ${brk + 3}l6 -6M${pl - 5} ${brk + 3}l6 -6`} stroke={C.muted} fill="none" />
                  {tt({ x: pl - 5, y: brk - 6, s: T_("cmd.ui.off_axis"), a: "end", k: true })}
                </>
              ) : null}
              {med.map((v, i) => {
                const on = inSeason.includes(i + 1);
                const hm = !view.cum && view.month === i + 1;
                return (
                  <g key={i}>
                    <rect x={(X(i) + cw * 0.18).toFixed(1)} y={Y(v).toFixed(1)} width={(cw * 0.64).toFixed(1)} height={(Y(0) - Y(v)).toFixed(1)} rx="3" fill={C.base} fillOpacity={hm || on ? 0.9 : 0.45} stroke={hm ? "var(--accent)" : undefined} strokeWidth={hm ? 2 : undefined}>
                      <title>{`${F.month(i + 1)}${T_("cmd.ui.past_median2")}${F.num(v, v < 10 ? 1 : 0)}, n=${mn[i]}`}</title>
                    </rect>
                    {tt({ x: X(i) + cw / 2, y: H - 6, s: i + 1, a: "middle", col: hm || (part && on) ? C.ink : undefined })}
                  </g>
                );
              })}
              {yv ? (
                <>
                  <path d={d} fill="none" stroke={C.ink} strokeWidth="1.4" strokeOpacity=".8" />
                  {yv.map((v, i) => {
                    if (v == null || v <= mx) return null;
                    const cx0 = X(i) + cw / 2;
                    const right = cx0 > W - pr - 56;
                    const ty = brk - 14;
                    return (
                      <g key={`o${i}`}>
                        <line x1={cx0.toFixed(1)} x2={cx0.toFixed(1)} y1={pt} y2={ty + 4} stroke={C.ink} strokeOpacity=".8" strokeDasharray="2 2" />
                        <path d={`M${(cx0 - 4).toFixed(1)} ${ty + 3}l4 -7 4 7z`} fill={C.ink} />
                        {tt({ x: right ? cx0 - 7 : cx0 + 7, y: ty + 3, s: `${F.month(i + 1)} ${F.num(v)}`, a: right ? "end" : undefined, col: C.ink, k: true })}
                      </g>
                    );
                  })}
                  {yv.map((v, i) =>
                    v == null && ymiss?.[i] ? (
                      <rect key={`m${i}`} x={(X(i) + cw * 0.22).toFixed(1)} y={Y(0) - 14} width={(cw * 0.56).toFixed(1)} height="14" rx="2" fill={`url(#${HID})`} stroke={C.muted} strokeOpacity=".6" />
                    ) : v != null && v <= mx ? (
                      <circle key={`c${i}`} cx={(X(i) + cw / 2).toFixed(1)} cy={Y(v).toFixed(1)} r="2.6" fill={C.bg} stroke={C.ink} strokeWidth="1.4">
                        <title>{`${F.ym(view.year, i + 1)} ${F.num(v)}`}</title>
                      </circle>
                    ) : null,
                  )}
                </>
              ) : null}
            </svg>
          ) : null}
        </div>
        <p className={cx("cm-cap")}>
          {T_(c.kor ? "cmd.ui.share_of_annual_median_sprin" : "cmd.ui.share_of_annual_median_m34")}
          <b className={cx("num")}>{F.pct(spring)}</b>
          {T_(c.kor ? "cmd.ui.autumn_oct_nov" : "cmd.ui.m1011")}
          <b className={cx("num")}>{F.pct(aut)}</b>
          {`${T_("cmd.ui.bars")}${by[0]}–${by[1]} ${sensorName(T_, bs)}${T_("cmd.ui.median2")}${ev ? `(${ev}${T_("cmd.ui.excl2")}` : ""}${yv ? `${T_("cmd.ui.line")}${view.year}${T_("cmd.ui.s182")}${sensorName(T_, q.sensor)}` : ""}`}
          {missN ? (
            <span className={cx("cm-capmiss")}>
              {", "}
              <i className={cx("cm-cl-miss")} />
              {`${T_("cmd.ui.missing5")}${missN}${T_("cmd.ui.mo_line_broken")}`}
            </span>
          ) : null}
          {`${bs !== q.sensor ? T_("cmd.ui.modis_as_is_through_2011") : ""}${over ? `${T_("cmd.ui.above_axis_max")}${F.num(mx)}${T_("cmd.ui.value_shown_above_the_break")}` : ""}`}
        </p>
      </div>
    </section>
  );
}

function tt({ x, y, s, a, col, k }: { x: number; y: number; s: string | number; a?: "end" | "middle"; col?: string; k?: boolean }) {
  return (
    <text className={cx("cm-tx", k && "k")} x={x} y={y} fill={col ?? C.muted} textAnchor={a}>
      {s}
    </text>
  );
}

/* ── 자료와 방법 ── */
function Src(c: Ctx & { board: Board }) {
  const { board, T_, kor } = c;
  const F = useFmt();
  const V = board.validation;
  const sg = (v: number | null, k: number) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(k));
  const src: [string, string, string, string, string][] = [
    ["MODIS C6.1", "Terra, Aqua", "1 km", "2001–", C.modis],
    ["VIIRS 375 m", "S-NPP", "375 m", "2012–", C.viirs],
    ["VIIRS 375 m", "NOAA-20", "375 m", "2018–", C.viirs],
    ["VIIRS 375 m", "NOAA-21", "375 m", "2023–", C.viirs],
  ];
  const tz = kor ? "KST" : "UTC";
  const mae = V.mae_month == null ? "–" : !kor && Math.abs(V.mae_month) >= 100 ? F.num(V.mae_month) : V.mae_month.toFixed(1);
  const steps: [string, string][] = [
    [T_("cmd.ui.collect"), T_("cmd.ui.nasa_firms_modis_viirs_activ")],
    [T_("cmd.ui.aggregate"), T_("cmd.step.agg", { tz })],
    [T_("cmd.ui.formula"), T_("cmd.ui.method_now")],
    [T_("cmd.ui.convert"), T_("cmd.ui.modis_2001_2011_converted_to")],
    [T_("cmd.ui.zero_vs_missing"), T_("cmd.ui.0_is_0_missing_is_an_empty_h")],
    [T_("cmd.ui.validation"), `${T_("cmd.ui.leave_one_year_out_refit")}${V.n_loo}${T_("cmd.ui.runs_mae")}${mae}${T_("cmd.ui.mo_bias")}${sg(V.bias_pct, 1)}%`],
    [T_("cmd.ui.same_month_comparison"), `${T_("cmd.ui.same_region_and_month_in_pas")}${board.cm.min_limited}${T_("cmd.ui.baseline_years")}`],
  ];
  const ver: [string, string][] = [
    [T_("cmd.ui.boundaries"), T_(kor ? "cmd.src.bd_kor" : "cmd.src.bd_adm1")],
    [T_("cmd.ui.time"), T_("cmd.src.time", { tz })],
    [T_("cmd.ui.formula"), board.provenance.method_version],
    [T_("cmd.ui.updated"), `${board.provenance.updated_at} ${tz}`],
  ];
  return (
    <section className={cx("panel cm-src")} aria-label={T_("cmd.ui.data_method")}>
      <div className={cx("panel-h")}>
        <h2>{T_("cmd.ui.data_method")}</h2>
        <span className={cx("cm-tag num")}>{T_("cmd.method_v", { v: board.provenance.method_version })}</span>
      </div>
      <div className={cx("panel-b")}>
        <div className={cx("cm-srcg")}>
          <div>
            <table className={cx("tbl cm-srct")}>
              <thead>
                <tr>
                  <th>{T_("cmd.ui.data")}</th>
                  <th>{T_("cmd.ui.satellite")}</th>
                  <th className={cx("r")}>{T_("cmd.ui.pixel")}</th>
                  <th className={cx("r")}>{T_("cmd.ui.period")}</th>
                </tr>
              </thead>
              <tbody>
                {src.map((s) => (
                  <tr key={s[1]}>
                    <td>
                      <i className={cx("cm-sw")} style={{ background: s[4] }} />
                      {s[0]}
                    </td>
                    <td>{s[1]}</td>
                    <td className={cx("num r")}>{s[2]}</td>
                    <td className={cx("num r")}>{s[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className={cx("cm-ver")}>
              {ver.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd className={cx(!/[가-힣]/.test(v) && "mono")}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ol className={cx("cm-steps")}>
            {steps.map(([k, v]) => (
              <li key={k}>
                <div>
                  <b>{k}</b>
                  <span>{v}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ── 사건 기록: 신고 대조 + 과거 대형 산불 ── */
type Cls = "reported" | "early" | "agri";
const TG: Record<Cls, string> = { reported: "ok", early: "sg", agri: "ag" };
function Events(c: Ctx & { board: Board }) {
  const { T_, kor, view, setView } = c;
  const F = useFmt();
  /* 신고 일치로 기록(목업 EM.updateFire reported) — 화면 상태로 덮는다(포트에 쓰기 자리가 없다) */
  const [marked, setMarked] = useState<string[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const fs = kor ? c.fires.filter((f) => !f.historical).map((f) => (marked.includes(f.id) ? { ...f, reported: true } : f)) : [];
  const hist = kor ? c.fires.filter((f) => f.historical) : [];
  const clsOf = (f: (typeof fs)[number]): Cls => (f.reported ? "reported" : f.kind === "agri" ? "agri" : "early");
  const cnt: Record<Cls, number> = { reported: 0, early: 0, agri: 0 };
  fs.forEach((f) => cnt[clsOf(f)]++);
  const ym = view.cum ? null : `${view.year}-${String(view.month ?? 3).padStart(2, "0")}`;
  const list = fs.slice().sort((a, b) => (a.reported === b.reported ? b.detected_at.localeCompare(a.detected_at) : a.reported ? 1 : -1));
  const mark = () => {
    if (!pick.length) return;
    setMarked((m) => [...m, ...pick]);
    toast({ text: `${pick.length}${T_("cmd.ui.marked_as_call_match")}`, sub: T_("cmd.ui.applied_to_incident_classes"), kind: "ok" });
    setPick([]);
  };
  return (
    <details className={cx("panel cm-ev")} data-scroll="ev">
      <summary className={cx("cm-evs")}>
        <span className={cx("cm-evt")}>
          <b>{T_("cmd.ui.incident_records")}</b>
          <small>{T_(kor ? "cmd.ui.119_call_match_past_major_fi" : "cmd.ui.call_match_past_major_fi_x")}</small>
        </span>
        <span className={cx("cm-evsum")}>
          <span className={cx("cm-evn")}>
            <b className={cx("num")}>{fs.length}</b>
            {T_("cmd.ui.events")}
          </span>
          {(Object.keys(cnt) as Cls[]).map((k) => (
            <span key={k} className={cx("cm-evc")}>
              <i className={cx("cm-evd", `cm-evd-${TG[k]}`)} />
              {T_(`data.detect.${k}`)} <b className={cx("num")}>{cnt[k]}</b>
            </span>
          ))}
        </span>
        <span className={cx("cm-evchev")}>
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </summary>
      <div className={cx("cm-ev-b")}>
        {!kor ? (
          <p className={cx("cm-none")}>{T_("cmd.empty.records")}</p>
        ) : (
          <div className={cx("cm-evgrid")}>
            <div className={cx("cm-evcol")}>
              <div className={cx("cm-sub cm-sub0")}>
                <h3>
                  {T_("cmd.ui.recent_incidents")}
                  <span className={cx("cm-reg")}>{T_("cmd.ui.119_call_match")}</span>
                </h3>
                {fs.some((f) => !f.reported) ? (
                  <button type="button" className={cx("btn sm cm-match")} disabled={!pick.length} onClick={mark}>
                    {pick.length ? `${pick.length}${T_("cmd.ui.marked_as_call_match")}` : T_("cmd.ui.mark_as_call_match")}
                  </button>
                ) : null}
              </div>
              <div>
                <Stack
                  fmt={(v) => F.num(v)}
                  segments={(["reported", "early", "agri"] as Cls[]).map((k) => ({ label: T_(`data.detect.${k}`), value: cnt[k], color: k === "reported" ? C.ok : k === "early" ? "var(--accent)" : C.modis }))}
                />
              </div>
              <ul className={cx("cm-dl")}>
                {list.map((f) => {
                  const dn = (
                    <div className={cx("cm-dn")}>
                      <b>{fireName(c, f)}</b>
                      <span className={cx("num muted")}>{`${f.detected_at.slice(5)}, VIIRS ${f.viirs}, MODIS ${f.modis}`}</span>
                    </div>
                  );
                  const k = clsOf(f);
                  return (
                    <li key={f.id} className={cx(!f.reported && "cm-dl-u")}>
                      {f.reported ? (
                        dn
                      ) : (
                        <label className={cx("cm-dlc")}>
                          <input type="checkbox" checked={pick.includes(f.id)} aria-label={`${fireName(c, f)}${T_("cmd.ui.select")}`} onChange={(e) => setPick((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))} />
                          {dn}
                        </label>
                      )}
                      <span className={cx("cm-tg", TG[k])}>{T_(`data.detect.${k}`)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className={cx("cm-evcol")}>
              <div className={cx("cm-sub cm-sub0")}>
                <h3>{T_("cmd.ui.past_major_fire")}</h3>
              </div>
              <ul className={cx("cm-hl")}>
                {hist.map((f) => {
                  const fym = f.detected_at.slice(0, 7);
                  const on = fym === ym;
                  return (
                    <li key={f.id} className={cx(on && "on")}>
                      <div className={cx("cm-dn")}>
                        <b>{fireName(c, f)}</b>
                        <span className={cx("num muted")}>{`${f.detected_at.slice(0, 10)}${T_("cmd.ui.burned")}${F.ha(typeof f.burned_ha === "number" ? f.burned_ha : 0)}`}</span>
                      </div>
                      <span className={cx("cm-hs num")}>
                        <span>
                          VIIRS <b>{F.num(f.viirs)}</b>
                        </span>
                        <span>
                          MODIS <b>{F.num(f.modis)}</b>
                        </span>
                      </span>
                      <button
                        type="button"
                        className={cx("btn sm ghost")}
                        onClick={() => {
                          setView((p) => ({ ...p, year: +fym.slice(0, 4), month: +fym.slice(5, 7), cum: false, sel: null }));
                          document.querySelector('[data-scroll="cal"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        {on ? T_("cmd.ui.selected") : T_("cmd.ui.view_month")}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className={cx("cm-cap")}>{T_("cmd.ui.viirs_modis_hotspots_per_sen")}</p>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
