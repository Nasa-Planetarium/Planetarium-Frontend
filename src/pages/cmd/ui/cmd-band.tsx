"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { analysis, calendar, cellVal, extract, ids, isPartial, metricOf, niceMax, prep, qKey, SEASON_MONTHS, years, type AnomRow, type Board, type Query, type Season } from "../model/cmd";
import type { Ctx } from "./cmd-page";
import { Bars, C, Hatch, Tx } from "./charts";
import { regionLabel, SENSOR_LONG, sensorName, UNIT_KEY } from "./cmd-top";
import { cx } from "./cx";
import { downloadText, toCSV, useFmt, useTok, useWidth } from "./use-ui";

const SEASONS: Season[] = ["all", "spring", "summer", "autumn", "winter"];
const STATE_CLS = { comparable: "ok", limited: "lim", unavailable: "na" } as const;

/** 관측 활동 캘린더 + 이상 달 추출(목업 cmd.js C · B 구역) */
export function CmdBand(c: Ctx & { board: Board }) {
  return (
    <div className={cx("cm-band")}>
      <CalPanel {...c} />
      <QueryPanel {...c} />
    </div>
  );
}

/* ── 캘린더 ── */
function CalPanel(c: Ctx & { board: Board }) {
  const { board, q, view, setView, T_ } = c;
  const F = useFmt();
  const { ramp } = useTok();
  const [vals, setVals] = useState(false);
  const [ref, cw0] = useWidth<HTMLDivElement>();
  const rs = ids(board, q.regions);
  const cal = useMemo(() => calendar(board, rs, q.sensor), [board, rs, q.sensor]);
  const cm = board.cm;
  const row = cal.rows.find((r) => r.year === view.year);
  const okv = row ? row.vals.filter((v): v is number => v != null) : [];
  const hm = view.month ?? (okv.length && row ? row.vals.indexOf(Math.max(...okv)) + 1 : 3);
  const cw = cw0 || 300;
  const cs = Math.max(11, Math.min(cw >= 420 ? 26 : vals ? 22 : 20, Math.floor((cw - 114) / 12) - 2));
  const all = cal.rows.flatMap((r) => r.vals).filter((v): v is number => v != null).sort((p, x) => p - x);
  const smax = all[Math.floor(all.length * 0.97)] ?? cal.max;
  const tv = (v: number) => Math.sqrt(Math.min(1, v / (smax || 1)));
  const padL = 44;
  const padT = 20;
  const gridH = cal.years.length * (cs + 2);
  const W = padL + 12 * (cs + 2) + 70;
  const H = padT + gridH + 4;
  const pos = (yi: number, m: number) => [padL + (m - 1) * (cs + 2), padT + yi * (cs + 2)] as const;
  const totals = cal.rows.map((r) => r.vals.reduce<number>((s, v) => s + (v ?? 0), 0));
  const tmx = Math.max(...totals, 1);
  let nMiss = 0;
  let nHold = 0;
  let nZero = 0;
  cal.rows.forEach((r) =>
    r.vals.forEach((v, mi) => {
      if (v == null && r.missing[mi]) nMiss++;
      if (v === 0) nZero++;
      if (v != null && r.reasons[mi]?.includes("modis_only_small")) nHold++;
    }),
  );
  const go = (y: number, m: number) => setView((p) => ({ ...p, year: y, month: m, cum: false, sel: null }));
  const anaOf = (y: number, m: number) => analysis(board, rs, y, m, metricOf(q.sensor, y, cm));
  const HID = "cmh-cal";
  const step = (y: number, m: number, d: number): [number, number] | null => {
    let yy = y;
    let mm = m + d;
    if (mm < 1) {
      mm = 12;
      yy--;
    } else if (mm > 12) {
      mm = 1;
      yy++;
    }
    return yy < cm.first_year || yy > cm.last_year || (yy === cm.last_year && mm > cm.last_month) ? null : [yy, mm];
  };
  const unit = T_(UNIT_KEY[q.sensor]);
  const a = view.cum ? null : anaOf(view.year, hm);
  const missText = (key: string | null) => {
    const m = board.missing.find((x) => x.key === key);
    return m ? `${m.sensors.join("·")} · ${T_(`data.missing.${m.key}`) === `data.missing.${m.key}` ? m.reason : T_(`data.missing.${m.key}`)}` : "";
  };
  const reasonText = (r: { code: string; extra?: unknown }) => {
    const ex = r.extra as { key: string; params?: Record<string, string | number> } | undefined;
    return T_(`data.reason.${r.code}`) + (ex ? ` · ${T_(ex.key, ex.params)}` : "");
  };
  const shk = c.kor && !view.cum ? board.shocks.find((s) => s.year === view.year && s.month === hm && (!q.regions.length || s.regions.some((x) => q.regions.includes(x)))) : null;
  const shockName = (s: { year: number; month: number; note: string }) => {
    const f = c.fires.find((x) => x.historical && +x.detected_at.slice(0, 4) === s.year && +x.detected_at.slice(5, 7) === s.month);
    if (!f) return s.note;
    const k = `data.fire.${f.id}.name`;
    const v = T_(k);
    return v === k ? f.name : v;
  };
  const acsv = () => {
    if (!a || a.state === "unavailable") return;
    downloadText(
      `emberline_analysis_${q.regions.length ? q.regions.join("-") : c.kor ? "gb-north" : c.iso3}_${a.year}-${String(a.month).padStart(2, "0")}_${a.metric}.csv`,
      toCSV([a], [
        { label: "year", get: (x) => x.year },
        { label: "month", get: (x) => x.month },
        { label: "metric", get: (x) => x.metric },
        { label: "value", get: (x) => x.value },
        { label: "baseline_median", get: (x) => x.baseline.median },
        { label: "baseline_p10", get: (x) => x.baseline.p10 },
        { label: "baseline_p90", get: (x) => x.baseline.p90 },
        { label: "baseline_n", get: (x) => x.baseline.n },
        { label: "ratio", get: (x) => (x.ratio == null ? null : x.ratio.toFixed(2)) },
        { label: "state", get: (x) => x.state },
        { label: "data_version", get: () => board.provenance.data_version },
        { label: "method_version", get: () => board.provenance.method_version },
      ]),
    );
  };
  const png = () => {
    const svg = document.querySelector("[data-calsvg]");
    if (!svg) return;
    const s = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.width * 2;
      cv.height = img.height * 2;
      const g = cv.getContext("2d");
      if (!g) return;
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface-1");
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, cv.width, cv.height);
      const el = document.createElement("a");
      el.href = cv.toDataURL("image/png");
      el.download = `emberline_calendar_${q.sensor}.png`;
      el.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  };
  /* 누적 보기: 26년 합계·가장 많은 달 */
  let tot = 0;
  let top: { y: number; m: number; v: number } | null = null;
  cal.rows.forEach((r) =>
    r.vals.forEach((v, i) => {
      if (v == null) return;
      tot += v;
      if (!top || v > top.v) top = { y: r.year, m: i + 1, v };
    }),
  );
  const topC = top as { y: number; m: number; v: number } | null;
  const pv = step(view.year, hm, -1);
  const nx = step(view.year, hm, 1);
  const med = a ? (a.partial && a.baseline.median != null ? a.baseline.median * a.frac : a.baseline.median) : null;
  const block = a ? a.reasons.filter((x) => x.severity === "block") : [];
  const lim = a ? a.reasons.filter((x) => x.severity === "limit") : [];
  return (
    <section className={cx("panel cm-cal")} aria-label={T_("cmd.ui.detection_activity_calendar")} data-scroll="cal">
      <div className={cx("panel-h")}>
        <h2>{T_("cmd.ui.detection_activity_calendar")}</h2>
        <div className={cx("cm-calh")}>
          <button type="button" className={cx("cm-switch")} role="switch" aria-checked={vals} onClick={() => setVals((v) => !v)}>
            <i />
            {T_("cmd.ui.values")}
          </button>
          <button type="button" className={cx("btn ghost sm")} title={T_("cmd.ui.save_calendar_image")} onClick={png}>
            PNG
          </button>
          <button type="button" className={cx("btn sm")} disabled={!a || a.state === "unavailable"} title={view.cum ? T_("cmd.ui.no_analysis_month_in_cumulat") : `${F.ymS(view.year, hm)}${T_("cmd.ui.analysis_csv2")}${T_(SENSOR_LONG[q.sensor])})`} onClick={acsv}>
            {T_("cmd.ui.analysis_csv")}
          </button>
        </div>
      </div>
      <div className={cx("cm-cal-b")}>
        <p className={cx("cm-calsub")}>{`${T_("cmd.ui.year_month_unit")}${unit}${T_("cmd.ui.mo")}`}</p>
        <div className={cx("cm-readout")} aria-live="polite">
          {view.cum || !a ? (
            <div className={cx("cm-rd1")}>
              <b className={cx("num")}>{`${cal.years[0]}–${cal.years[cal.years.length - 1]}`}</b>
              {T_("cmd.ui.cumulative2")}
              <b className={cx("num")}>{F.num(tot)}</b> {unit}
              {topC ? (
                <>
                  {T_("cmd.ui.peak")}
                  <b className={cx("num")}>{F.ymS(topC.y, topC.m)}</b> {F.num(topC.v)}
                </>
              ) : null}
            </div>
          ) : (
            <>
              <div className={cx("cm-rd1")}>
                <b className={cx("num")}>{F.ymS(view.year, hm)}</b>
                <span className={cx("cm-st", `cm-st-${STATE_CLS[a.state]}`)}>{T_(`data.state.${a.state}`)}</span>
                {a.value == null ? (
                  <span className={cx("cm-rdmiss")}>
                    <i className={cx("cm-cl-miss")} />
                    {block.length ? block.map(reasonText).join(", ") : T_("cmd.ui.no_value")}
                  </span>
                ) : (
                  <>
                    <span>
                      <b className={cx("num")}>{F.num(a.value)}</b> {T_(`data.metric.${a.metric}.unit`)}
                    </span>
                    {isPartial(cm, view.year, hm) ? <span className={cx("dim")}>{T_("cmd.ui.to_day_11")}</span> : null}
                  </>
                )}
              </div>
              {a.state !== "unavailable" ? (
                <div className={cx("cm-rd2")}>
                  {T_("cmd.ui.same_month_past_median")}
                  <b className={cx("num")}>{med == null ? "–" : F.num(med, med < 10 ? 1 : 0)}</b>
                  {a.partial ? T_("cmd.ui.scaled_by_elapsed_days") : ""}
                  {", p10–p90 "}
                  <b className={cx("num")}>{`${F.num((a.baseline.p10 ?? 0) * a.frac)}–${F.num((a.baseline.p90 ?? 0) * a.frac)}`}</b>
                  {", n "}
                  <b className={cx("num")}>{a.baseline.n}</b>
                  {`(${a.metric === "viirs" ? Math.max(a.baseline.from, cm.viirs_start_year) : a.baseline.from}–${a.baseline.to}, ${view.year}${T_("cmd.ui.excl")}${a.baseline.missing_years ? `${T_("cmd.ui.missing3")}${a.baseline.missing_years}${T_("cmd.ui.excl")}` : ""})`}
                  {a.ratio != null ? (
                    <>
                      {", "}
                      <b className={cx(a.ratio >= 2 && "up")}>
                        <span className={cx("num")}>{a.ratio.toFixed(1)}</span>
                        {T_("cmd.ui.s101")}
                      </b>
                      {a.state === "limited" ? <span className={cx("dim")}>{T_("cmd.ui.limited")}</span> : null}
                    </>
                  ) : null}
                </div>
              ) : (
                <div className={cx("cm-rd2")}>{T_("cmd.ui.not_enough_past_data_to_comp")}</div>
              )}
              {lim.length ? (
                <div className={cx("cm-rd3")}>
                  {lim.map((x) => (
                    <span key={x.code} className={cx("cm-why")}>
                      {reasonText(x)}
                    </span>
                  ))}
                </div>
              ) : null}
              {shk ? (
                <div className={cx("cm-rd3")}>
                  <span className={cx("cm-why cm-why-ev")}>{`${T_("cmd.ui.incident_record")}${shockName(shk)})`}</span>
                </div>
              ) : null}
              <div className={cx("cm-rdstep")}>
                <button type="button" className={cx("btn ghost sm")} disabled={!pv} onClick={() => pv && go(pv[0], pv[1])}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  {T_("cmd.ui.prev_month")}
                </button>
                <button type="button" className={cx("btn ghost sm")} disabled={!nx} onClick={() => nx && go(nx[0], nx[1])}>
                  {T_("cmd.ui.next_month")}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>
        <div className={cx("cm-calbox chart")} ref={ref}>
          <svg data-calsvg="" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ fontVariantNumeric: "tabular-nums" }} role="grid" aria-label={`${T_("cmd.ui.detection_activity_calendar")} ${cal.years[0]}–${cal.years[cal.years.length - 1]}`}>
            <Hatch id={HID} bg="var(--hatch-bg)" col={C.dim} op={1} />
            {Array.from({ length: 12 }, (_, i) => (
              <Tx key={i} x={padL + i * (cs + 2) + cs / 2} y={padT - 7} anchor="middle">
                {F.lang === "ko" ? String(i + 1) : F.monthName(i + 1, "narrow")}
              </Tx>
            ))}
            {cal.years.map((y, i) => (
              <Tx key={y} x={padL - 6} y={padT + i * (cs + 2) + cs / 2 + 3.5} anchor="end">
                {y}
              </Tx>
            ))}
            {cal.rows.map((r, yi) => (
              <g key={r.year} role="row">
                {r.vals.map((v, mi) => {
                  const m = mi + 1;
                  const [x, y] = pos(yi, m);
                  const rsn = r.reasons[mi] ?? [];
                  const hl = !view.cum && view.year === r.year && hm === m;
                  const hlR = hl ? <rect x={x - 1.5} y={y - 1.5} width={cs + 3} height={cs + 3} rx="4" fill="none" stroke={C.signal} strokeWidth="2" pointerEvents="none" /> : null;
                  if (v == null && r.missing[mi])
                    return (
                      <g key={m}>
                        <rect className={cx("cal-x")} x={x} y={y} width={cs} height={cs} rx="3" fill={`url(#${HID})`} stroke={C.dim} strokeWidth="1" role="gridcell" tabIndex={-1} onClick={() => go(r.year, m)}>
                          <title>{`${F.ym(r.year, m)} · ${missText(r.missing[mi] ?? null)}`}</title>
                        </rect>
                        {hlR}
                      </g>
                    );
                  if (v == null)
                    return (
                      <rect key={m} x={x + 0.5} y={y + 0.5} width={cs - 1} height={cs - 1} rx="3" fill="none" stroke={C.line} strokeDasharray={rsn.includes("sensor_not_operating") ? undefined : "2 2"}>
                        <title>{F.ym(r.year, m)}</title>
                      </rect>
                    );
                  const part = isPartial(cm, r.year, m);
                  const t = v === 0 ? 0 : tv(v);
                  const an = !rsn.includes("modis_only_small") && v >= 10 && q.sensor !== "raw" ? anaOf(r.year, m) : null;
                  const txt = v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(v);
                  const fs = Math.max(7.5, Math.min(11, cs * 0.5));
                  return (
                    <g key={m}>
                      <rect className={cx("cal-c")} x={x} y={y} width={cs} height={cs} rx="3" fill={v === 0 ? C.zero : ramp(t)} fillOpacity={part ? 0.85 : undefined} tabIndex={-1} role="gridcell" aria-selected={hl || undefined} onClick={() => go(r.year, m)} style={{ cursor: "pointer" }}>
                        <title>{`${F.ym(r.year, m)} ${F.num(v)}`}</title>
                      </rect>
                      {vals ? (
                        <text x={x + cs / 2} y={y + cs / 2 + fs * 0.36} textAnchor="middle" fontSize={fs.toFixed(1)} pointerEvents="none" style={{ fill: t > 0.42 ? C.bg : C.ink, fillOpacity: 0.88, fontSize: `${fs.toFixed(1)}px` }} textLength={txt.length * fs * 0.62 > cs - 4 ? cs - 4 : undefined} lengthAdjust="spacingAndGlyphs">
                          {txt}
                        </text>
                      ) : null}
                      {part ? <rect x={x + 0.75} y={y + 0.75} width={cs - 1.5} height={cs - 1.5} rx="2.5" fill="none" stroke={C.ink} strokeWidth="1.5" strokeDasharray="3 2" pointerEvents="none" /> : null}
                      {rsn.includes("modis_only_small") ? <circle cx={x + cs / 2} cy={y + cs / 2} r={Math.max(2.4, cs * 0.2).toFixed(1)} fill="none" stroke={C.muted} strokeWidth="1.2" pointerEvents="none" /> : null}
                      {an && an.ratio != null && an.ratio >= 2 ? <circle cx={x + cs - 5} cy={y + 5} r="2.6" fill={C.ink} pointerEvents="none" /> : null}
                      {hlR}
                    </g>
                  );
                })}
              </g>
            ))}
            {(() => {
              const vi = cal.years.indexOf(cm.viirs_start_year);
              if (vi <= 0) return null;
              const y = padT + vi * (cs + 2) - 1 - 0.5;
              return <line x1={padL - 40} y1={y} x2={padL + 12 * (cs + 2)} y2={y} stroke={C.signal} strokeWidth="1" strokeDasharray="3 3" />;
            })()}
            {cal.rows.map((r, i) => (
              <rect key={r.year} x={padL + 12 * (cs + 2) + 6} y={padT + i * (cs + 2) + cs * 0.25} width={(((totals[i] ?? 0) / tmx) * 56).toFixed(1)} height={cs * 0.5} rx="1.5" fill={C.line2}>
                <title>{`${r.year} ${F.num(totals[i] ?? 0)}`}</title>
              </rect>
            ))}
          </svg>
        </div>
        <div className={cx("cm-calleg")}>
          <span className={cx("cm-cl-r")}>
            <span>{T_("cmd.ui.low")}</span>
            <i />
            <span>
              {T_("cmd.ui.high")}
              <b className={cx("num")}>{F.num(smax)}</b>
              {T_("cmd.ui.mo2")}
            </span>
          </span>
          <span>
            <i className={cx("cm-cl-zero")} />
            {T_("cmd.ui.0_no_detections")}
            {nZero ? (
              <>
                {" "}
                <b className={cx("num")}>{nZero}</b>
              </>
            ) : null}
          </span>
          <span>
            <i className={cx("cm-cl-miss")} />
            {T_("cmd.ui.missing_with_reason")}
            <b className={cx("num")}>{nMiss}</b>
          </span>
          {nHold ? (
            <span>
              <i className={cx("cm-cl-hold")} />
              {T_("cmd.ui.on_hold_modis_0")}
              <b className={cx("num")}>{nHold}</b>
            </span>
          ) : null}
          {q.sensor !== "raw" ? (
            <span>
              <i className={cx("cm-cl-dot")} />
              {T_("cmd.ui.2_past_median_evaluation_yea")}
            </span>
          ) : null}
          <span>
            <i className={cx("cm-cl-pt")} />
            {T_("cmd.ui.partial_month_to_day_11")}
          </span>
          <span>
            <i className={cx("cm-cl-vi")} />
            {T_("cmd.ui.viirs_starts_2012")}
          </span>
          {vals ? <span className={cx("dim")}>{T_("cmd.ui.cell_value_monthly_count_1_2")}</span> : null}
        </div>
      </div>
    </section>
  );
}

/* ── 이상 달 추출 ── */
function QueryPanel(c: Ctx & { board: Board }) {
  const { board, q, setQ, view, setView, T_ } = c;
  const F = useFmt();
  const { ramp } = useTok();
  const [run, setRun] = useState(() => ({ q, at: Date.now() }));
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<{ col: number; dir: "ascending" | "descending" }>({ col: 5, dir: "descending" });
  const res = useMemo(() => extract(board, run.q), [board, run.q]);
  const dirty = qKey(run.q) !== qKey(q);
  const nAll = board.regions.length;
  const cond = (rq: Query) =>
    `${sensorName(T_, rq.sensor)}, ${rq.season === "all" ? T_("cmd.ui.all_seasons") : T_(`cmd.ui.${rq.season}`)}, ${regionLabel(c, rq.regions, nAll)}${rq.conf ? T_("cmd.ui.confidence") + rq.conf : ""}${rq.frp ? `, FRP≥${rq.frp}` : ""}${rq.agri ? T_("cmd.ui.crop_burning_excl") : ""}`;
  const doRun = () => {
    setBusy(true);
    setTimeout(() => {
      setRun({ q, at: Date.now() });
      setBusy(false);
    }, 520);
  };
  const [dRef, dW] = useWidth<HTMLDivElement>();
  const inQ = new Set(ids(board, run.q.regions));
  const by: Record<string, number> = {};
  res.rows.forEach((x) => (by[x.r] = (by[x.r] ?? 0) + 1));
  const items = board.regions
    .map((r) => r.id)
    .sort((p, x) => Number(inQ.has(x)) - Number(inQ.has(p)) || (by[x] ?? 0) - (by[p] ?? 0))
    .slice(0, 15)
    .map((k) => ({ id: k, label: c.names[k] ?? k, value: by[k] ?? 0, out: !inQ.has(k), color: by[k] ? ramp(0.45 + (0.5 * (by[k] ?? 0)) / Math.max(1, res.rows.length)) : C.line2 }));
  const sorted = useMemo(() => {
    const keyOf: ((x: AnomRow) => string | number)[] = [(x) => c.names[x.r] ?? x.r, (x) => x.y * 100 + x.m, (x) => x.v, (x) => x.med, (x) => x.ratio, (x) => x.z];
    const f = keyOf[sort.col] ?? ((x: AnomRow) => x.z);
    return res.rows
      .map((x, i) => ({ x, i }))
      .sort((p, o) => {
        const a1 = f(p.x);
        const b1 = f(o.x);
        const d = typeof a1 === "number" && typeof b1 === "number" ? a1 - b1 : String(a1).localeCompare(String(b1));
        return sort.dir === "ascending" ? d : -d;
      });
  }, [res.rows, sort, c.names]);
  const maxZ = Math.max(1e-9, ...res.rows.map((x) => x.z));
  const selRow = (view.sel && res.rows.find((d) => `${d.r}:${d.y}:${d.m}` === view.sel)) || res.rows[0];
  const pickRow = (x: AnomRow) => setView((p) => ({ ...p, sel: `${x.r}:${x.y}:${x.m}`, month: x.m, cum: false, year: x.y }));
  const csv = () =>
    downloadText(
      `emberline_cmd_anomalies_${board.provenance.updated_at.slice(0, 10)}.csv`,
      toCSV(res.rows, [
        { label: "region_name", get: (x) => c.names[x.r] ?? x.r },
        { label: "region_id", get: (x) => x.r },
        { label: "year", get: (x) => x.y },
        { label: "month", get: (x) => x.m },
        { label: "metric", get: () => T_(SENSOR_LONG[run.q.sensor]) },
        { label: "value_filtered", get: (x) => x.v.toFixed(1) },
        { label: "baseline_median", get: (x) => x.med.toFixed(1) },
        { label: "baseline_n", get: (x) => x.n },
        { label: "ratio", get: (x) => x.ratio.toFixed(2) },
        { label: "z", get: (x) => x.z.toFixed(2) },
        { label: "partial_month", get: (x) => String(x.partial) },
        { label: "condition", get: () => cond(run.q) },
        { label: "data_version", get: () => board.provenance.data_version },
        { label: "method_version", get: () => board.provenance.method_version },
      ]),
    );
  const at = new Date(run.at);
  const hhmm = c.kor ? board.provenance.updated_at.slice(11, 16) : `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
  const COLS: { k: string; r?: boolean; title?: string }[] = [{ k: "cmd.ui.region" }, { k: "cmd.ui.month" }, { k: "cmd.ui.observed", r: true }, { k: "cmd.ui.past_median", r: true, title: T_("cmd.ui.median_of_past_years_same_an") }, { k: "cmd.ui.ratio", r: true }, { k: "z" }];
  return (
    <section className={cx("panel cm-query")} aria-label={T_("cmd.ui.anomalous_months")}>
      <div className={cx("panel-h")}>
        <h2>{T_("cmd.ui.anomalous_months")}</h2>
        <span className={cx("cm-tag")}>{T_("cmd.ui.2_same_month_past_median")}</span>
      </div>
      <div className={cx("cm-qgrid")}>
        <div className={cx("cm-qside")}>
          <div className={cx("cm-form")}>
            <div className={cx("cm-row")}>
              <span className={cx("cm-lab")}>{T_("cmd.ui.season")}</span>
              <div className={cx("seg cm-seg")}>
                {SEASONS.map((s) => (
                  <button type="button" key={s} aria-pressed={q.season === s} onClick={() => setQ((p) => ({ ...p, season: s }))}>
                    {T_(`cmd.ui.${s}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className={cx("cm-row cm-two")}>
              <label className={cx("cm-sl")}>
                <span className={cx("cm-lab")}>{T_("cmd.ui.min_confidence")}</span>
                <input className={cx("cm-mini")} type="range" min={0} max={90} step={10} value={q.conf} onChange={(e) => setQ((p) => ({ ...p, conf: +e.target.value }))} />
                <b className={cx(q.conf ? "num" : null)}>{q.conf ? `${q.conf}%` : T_("cmd.ui.all")}</b>
              </label>
              <label className={cx("cm-sl")}>
                <span className={cx("cm-lab")}>{T_("cmd.ui.min_frp")}</span>
                <input className={cx("cm-mini")} type="range" min={0} max={50} step={5} value={q.frp} onChange={(e) => setQ((p) => ({ ...p, frp: +e.target.value }))} />
                <b className={cx(q.frp ? "num" : null)}>{q.frp ? `${q.frp} MW` : T_("cmd.ui.all")}</b>
              </label>
            </div>
            <p className={cx("cm-fnote")}>{T_("cmd.ui.confidence_pixel_detection_c")}</p>
            <div className={cx("cm-row cm-act")}>
              <button type="button" className={cx("cm-switch")} role="switch" aria-checked={q.agri} onClick={() => setQ((p) => ({ ...p, agri: !p.agri }))}>
                <i />
                {T_("cmd.ui.exclude_crop_burning")}
              </button>
              <button type="button" className={cx("btn primary", dirty && "cm-pulse")} disabled={busy} onClick={doRun}>
                {busy ? T_("cmd.ui.extracting") : T_("cmd.ui.find_patterns")}
              </button>
            </div>
          </div>
          <div className={cx("cm-dist")}>
            <div className={cx("cm-sub cm-sub0")}>
              <h3>{T_("cmd.ui.anomalous_cells_by_region")}</h3>
              <span className={cx("cm-reg")}>{T_("cmd.dist.n", { a: Object.keys(by).length, b: inQ.size })}</span>
            </div>
            <div className={cx("cm-chart chart")} ref={dRef}>
              {dW ? (
                <Bars
                  items={items}
                  width={Math.max(240, dW)}
                  labelW={64}
                  rowH={24}
                  max={Math.max(1, ...items.map((i) => i.value))}
                  label={T_("cmd.ui.anomalous_cells_by_region2")}
                  fmt={(v, it) => (it.out ? T_("cmd.ui.not_in_query") : `${v}${T_("cmd.ui.cells")}`)}
                  onPick={(id) => {
                    const x = res.rows.find((r) => r.r === id);
                    if (x) pickRow(x);
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
        <div className={cx("cm-res")}>
          <div className={cx("cm-meta", dirty && "cm-dirty")}>
            {dirty ? <p className={cx("cm-warn")}>{T_("cmd.ui.conditions_changed_run_again")}</p> : null}
            <div className={cx("listhead")}>
              <h3 className={cx("lh-t")}>{T_("cmd.ui.anomaly")}</h3>
              <span className={cx("lh-n")}>
                {T_("shell.list.total", { n: "§N§", u: T_("cmd.ui.cells") })
                  .split("§N§")
                  .flatMap((part, i) => (i ? [<b key={i}>{F.num(res.rows.length)}</b>, part] : [part]))}
              </span>
              <span className={cx("lh-a")}>
                <button type="button" className={cx("btn sm ghost")} title={T_("cmd.ui.anomaly_table_csv")} disabled={!res.rows.length} onClick={csv}>
                  {T_("cmd.ui.table_csv")}
                </button>
              </span>
            </div>
            <p className={cx("cm-cond dim")}>{`${cond(run.q)}(${hhmm}${T_("cmd.ui.calc")}${F.num(res.cand)}${T_("cmd.ui.cells_checked")}${res.skipped ? `${T_("cmd.ui.short_baseline_excl")}${res.skipped}${T_("cmd.ui.cells")}` : ""})`}</p>
          </div>
          <div className={cx("cm-tblwrap")}>
            <div className={cx("cm-tblbox", busy && "cm-busy")} aria-busy={busy || undefined}>
              {!res.rows.length ? (
                <div className={cx("cm-empty")}>
                  <Search aria-hidden="true" />
                  <b>{T_("cmd.ui.no_anomalies_match")}</b>
                </div>
              ) : (
                <table className={cx("tbl cm-tbl is-row")}>
                  <thead>
                    <tr>
                      {COLS.map((col, i) => (
                        <th key={col.k} className={cx(col.r && "r")} title={col.title} aria-sort={sort.col === i ? sort.dir : "none"}>
                          <button type="button" className={cx("th-sort")} onClick={() => setSort((s) => ({ col: i, dir: s.col === i && s.dir === "descending" ? "ascending" : "descending" }))}>
                            {col.k === "z" ? "z" : T_(col.k)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(({ x, i }, k) => {
                      const key = `${x.r}:${x.y}:${x.m}`;
                      return (
                        <tr key={key} tabIndex={0} className={cx(view.sel === key && "cm-sel", !view.cum && x.y === view.year && "cm-yrrow", "cm-in")} style={{ animationDelay: `${Math.min(k, 14) * 28}ms` }} onClick={() => pickRow(x)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pickRow(x))}>
                          <td title={T_("cmd.rank", { n: i + 1 })}>{c.names[x.r] ?? x.r}</td>
                          <td>
                            <span className={cx("num")}>{F.ymS(x.y, x.m)}</span>
                            {x.partial ? <span className={cx("cm-pt")}> {T_("cmd.ui.partial")}</span> : null}
                          </td>
                          <td className={cx("num r")}>{F.num(x.v)}</td>
                          <td className={cx("num r dim")} title={`n=${x.n}, ${x.y}${T_("cmd.ui.excl")}`}>
                            {F.num(x.med, x.med < 10 ? 1 : 0)}
                          </td>
                          <td className={cx("r", x.ratio >= 4 ? "cm-hot" : "up")}>
                            <span className={cx("num")}>{x.ratio.toFixed(1)}</span>
                            {T_("cmd.ui.s101")}
                          </td>
                          <td>
                            <span className={cx("cm-z")}>
                              <i style={{ width: `${Math.max(6, (x.z / maxZ) * 100).toFixed(0)}%` }} />
                            </span>
                            <b className={cx("num")}>{x.z.toFixed(1)}</b>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          {selRow ? <Detail {...c} row={selRow} rq={run.q} anomYears={new Set(res.rows.filter((d) => d.r === selRow.r && d.m === selRow.m).map((d) => d.y))} /> : null}
        </div>
      </div>
    </section>
  );
}

/* ── 이상치 상세: 그 시군·달을 26년 막대로(과거 중앙값 · 2배 선) ── */
function Detail(c: Ctx & { board: Board; row: AnomRow; rq: Query; anomYears: Set<number> }) {
  const { board, row: x, rq, view, setView, T_ } = c;
  const F = useFmt();
  const { ramp } = useTok();
  const [ref, W0, H0] = useWidth<HTMLDivElement>();
  const st = prep(board, rq);
  const med = st(x.r, x.m, x.y).at(x.y).med;
  const YS = years(board.cm);
  const vals = YS.map((y) => {
    const v = cellVal(board, x.r, y, x.m, rq.sensor);
    return v == null ? null : st(x.r, x.m, y).fv(v);
  });
  const W = Math.max(240, W0 || 0);
  const H = H0 ? Math.max(150, Math.min(380, H0)) : 200;
  const pl = 36;
  const pr = 8;
  const pt = 14;
  const pb = 22;
  const mx = niceMax(Math.max(med * 2.2, ...vals.filter((v): v is number => v != null), 1));
  const cw = (W - pl - pr) / YS.length;
  const X = (i: number) => pl + i * cw;
  const Y = (v: number) => pt + (1 - Math.min(v, mx) / mx) * (H - pt - pb);
  const HID = "cmh-det";
  return (
    <div className={cx("cm-det")}>
      <div className={cx("cm-sub cm-sub0")}>
        <h3>
          {T_("cmd.ui.anomaly_detail")}
          <span className={cx("cm-reg")}>
            {`${c.names[x.r] ?? x.r}, ${F.month(x.m)}, ${sensorName(T_, rq.sensor)}, `}
            <b className={cx("num")}>{x.y}</b>
            {`${T_("cmd.ui.vs_past_median2")}${x.y}${T_("cmd.ui.excl_n")}${x.n}${T_("cmd.ui.s135")}${F.num(x.ratio, 1)}${T_("cmd.ui.s101")}`}
          </span>
        </h3>
        <span className={cx("cm-detk")}>
          <i className={cx("cm-dk-a")} />
          {T_("cmd.ui.anomaly")}
          <i className={cx("cm-dk-m")} />
          {T_("cmd.ui.past_median")}
          <i className={cx("cm-dk-2")} />
          {T_("cmd.ui.2")}
          <i className={cx("cm-dk-x")} />
          {T_("cmd.ui.missing")}
        </span>
      </div>
      <div className={cx("cm-chart cm-detc chart")} ref={ref}>
        {W0 ? (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.names[x.r] ?? x.r} ${F.month(x.m)}${T_("cmd.ui.by_year")}`}>
            <Hatch id={HID} />
            {[0, mx / 2, mx].map((v) => (
              <g key={v}>
                <line x1={pl} x2={W - pr} y1={Y(v).toFixed(1)} y2={Y(v).toFixed(1)} stroke={C.line} />
                <text x={pl - 5} y={(Y(v) + 3.5).toFixed(1)} fill={C.muted} className={cx("cm-tx")} textAnchor="end">
                  {F.axis(v)}
                </text>
              </g>
            ))}
            {vals.map((v, i) => {
              const y = YS[i] ?? 0;
              const on = y === x.y;
              const an = c.anomYears.has(y);
              const cur = !view.cum && y === view.year && !on;
              const miss = board.cells[x.r]?.miss[(y - board.cm.first_year) * 12 + x.m - 1];
              if (v == null)
                return (
                  <rect key={y} x={(X(i) + cw * 0.16).toFixed(1)} y={(miss ? Y(mx * 0.18) : Y(0) - 3).toFixed(1)} width={(cw * 0.68).toFixed(1)} height={(miss ? Y(0) - Y(mx * 0.18) : 3).toFixed(1)} rx="2" fill={miss ? `url(#${HID})` : C.line2} stroke={miss ? C.muted : undefined} strokeOpacity={miss ? 0.5 : undefined}>
                    <title>{F.ym(y, x.m)}</title>
                  </rect>
                );
              return (
                <g key={y}>
                  <rect
                    className={cx("cm-db")}
                    x={(X(i) + cw * 0.16).toFixed(1)}
                    y={Y(v).toFixed(1)}
                    width={(cw * 0.68).toFixed(1)}
                    height={Math.max(1.5, Y(0) - Y(v)).toFixed(1)}
                    rx="2"
                    fill={on ? C.harm : an ? ramp(0.62 + 0.3 * Math.min(1, v / mx)) : C.line2}
                    fillOpacity={on || an ? 0.95 : 0.6}
                    stroke={cur || isPartial(board.cm, y, x.m) ? C.ink : undefined}
                    strokeWidth={cur ? 1.2 : undefined}
                    strokeDasharray={isPartial(board.cm, y, x.m) ? "3 2" : undefined}
                    style={{ cursor: "pointer" }}
                    onClick={() => setView((p) => ({ ...p, month: x.m, year: y, cum: false }))}
                  >
                    <title>{`${F.ym(y, x.m)} ${F.num(v)}${an ? T_("cmd.ui.anomaly2") : ""}`}</title>
                  </rect>
                  {on || (y % 5 === 1 && Math.abs(y - x.y) > 2) ? (
                    <text x={(X(i) + cw / 2).toFixed(1)} y={H - 7} fill={on ? C.ink : C.muted} className={cx("cm-tx")} textAnchor="middle">
                      {on ? y : `'${String(y).slice(2)}`}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <line x1={pl} x2={W - pr} y1={Y(med).toFixed(1)} y2={Y(med).toFixed(1)} stroke={C.ink} strokeOpacity=".7" strokeDasharray="4 3" />
            <line x1={pl} x2={W - pr} y1={Y(med * 2).toFixed(1)} y2={Y(med * 2).toFixed(1)} stroke={C.viirs} strokeOpacity=".8" strokeDasharray="1 3" />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

export const SEASON_KEYS = SEASON_MONTHS;
