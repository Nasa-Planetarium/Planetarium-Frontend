"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { calendarQuery } from "@/entities/month-value";
import { methodQuery } from "@/entities/release";
import { hindRows, lvOf, niceMax, olRow, skill, valRows, type Row } from "../model/outlook";
import type { LabCtx } from "./lab-page";
import { cx } from "./cx";
import { downloadText, toCSV, useTok, useWidth, type Tok } from "./use-lab";

type Month = { year: number; month: number; value: number | null; value_projected?: number | null; as_of_date?: string | null; status: string };
type Obs = { ym: string; y: number; m: number; v: number | null; partial: boolean; missing: string | null };
type Fm = { month: string; year: number; m: number; median: number | null; lo80: number | null; hi80: number | null; factor: number | null | undefined; baseline: Row["baseline"] };
const HAN = /[가-힣]/;

/** SVG 글자(목업 lab.js T): 한글이면 fs-2, 숫자는 fs-1 · 서체는 본문 서체 하나 */
function SvgT({ x, y, s, anchor, fill, weight, sz, fs, fsk, muted }: { x: number; y: number; s: string | number; anchor?: "end" | "middle"; fill?: string; weight?: number; sz?: number; fs: number; fsk: number; muted: string }) {
  return (
    <text x={x.toFixed(1)} y={y.toFixed(1)} fill={fill ?? muted} fontFamily="Pretendard Variable, Pretendard, Malgun Gothic, sans-serif" fontSize={sz ?? (HAN.test(String(s)) ? fsk : fs)} textAnchor={anchor} fontWeight={weight}>
      {s}
    </text>
  );
}

/** 아래 띠: 월별 관측·예측 · 보정 검증 · 자료와 방법(접힘) | 모형 성능 — 목업 lab.js renderMonthly · renderVal · renderHow · renderHind */
export function LabBand(c: LabCtx) {
  const { T_ } = c;
  return (
    <div className={cx("lb-band")}>
      <div className={cx("lb-col")}>
        <Monthly {...c} />
        <section className={cx("panel lb-val")} aria-label={T_("lab.ui.harmonization_check")}>
          <div className={cx("panel-h")}>
            <h2>{T_("lab.ui.harmonization_check")}</h2>
          </div>
          <div className={cx("panel-b")}>
            <Validation {...c} />
          </div>
        </section>
        <section className={cx("panel lb-how")} aria-label={T_("lab.ui.data_method")}>
          <How {...c} />
        </section>
      </div>
      <div className={cx("lb-col")}>
        <section className={cx("panel lb-hc")} aria-label={T_("lab.ui.model_skill")}>
          <div className={cx("panel-h")}>
            <h2>{T_("lab.ui.model_skill")}</h2>
          </div>
          <div className={cx("panel-b")}>
            <Hind {...c} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SumList({ pairs }: { pairs: [string, ReactNode][] }) {
  return (
    <dl className={cx("sumlist")}>
      {pairs.map(([k, v]) => (
        <SumRow key={k} k={k} v={v} />
      ))}
    </dl>
  );
}
function SumRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

/* ── 월별 시계열: 과거 관측(/calendar 보정 지표) + 향후 3개월(전망 스냅숏) ── */
function Monthly(c: LabCtx) {
  const { FC, F, T_, selAoi } = c;
  const [span, setSpan] = useState(24);
  const [setBox, W0] = useWidth<HTMLDivElement>();
  const tok = useTok();
  const mq = useQuery(methodQuery());
  const mv = (mq.data as { method_version?: string } | undefined)?.method_version ?? null;
  const cq = useQuery({ ...calendarQuery(selAoi ?? "", { start_year: 2020, end_year: 2026 }, mv), enabled: !!mv && !!selAoi });
  const ms: Month[] = typeof cq.data === "object" && cq.data ? ((cq.data as unknown as { months: Month[] }).months ?? []) : [];
  const o = selAoi && FC ? (FC.ix.get(selAoi) ?? null) : null;
  const obsAll: Obs[] = ms
    .filter((r) => r.status !== "out_of_range")
    .map((r) => ({ ym: `${r.year}-${String(r.month).padStart(2, "0")}`, y: r.year, m: r.month, v: r.value, partial: r.status === "partial", missing: r.status === "missing" ? c.t("shell.st.missing") : null }));
  const O = obsAll.slice(-span);
  const FM: Fm[] = !o || !FC ? [] : FC.targets.map((ym, k) => {
    const q = olRow(o, k, "", "");
    return { month: ym, year: +ym.slice(0, 4), m: +ym.slice(5, 7), median: q.median, lo80: q.lo80, hi80: q.hi80, factor: q.ratio, baseline: q.baseline };
  });
  const partRow = ms.find((q) => q.status === "partial");
  const partLine = partRow && partRow.as_of_date && partRow.value_projected != null ? c.t("analysis.g6.partial", { d: partRow.as_of_date, v: F.n1(partRow.value), p: F.n1(partRow.value_projected) }) : "";
  const ld = FC ? +FC.m.partial_as_of.slice(8, 10) : 13;
  const [tip, setTip] = useState<{ i: number; left: number } | null>(null);

  const csv = () => {
    if (!FC) return;
    const q2 = (v: number | null | undefined) => (v == null ? "" : v);
    const rows = [...O.map((d) => ({ month: d.ym, kind: d.v == null ? "observed_missing" : d.partial ? "observed_partial" : "observed", observed: d.v, f: null as Fm | null, note: d.missing ?? (d.partial ? `${T_("lab.ui.partial_to_day2")}${ld}${T_("lab.ui.s450")}` : "") })), ...FM.map((f) => ({ month: f.month, kind: "forecast", observed: null, f, note: "" }))];
    downloadText(
      `emberline_forecast_monthly_${c.sel ?? "all"}_${FC.issued}.csv`,
      toCSV(rows, [
        { label: "region", get: () => c.sel ?? "all" },
        { label: "month", get: (r) => r.month },
        { label: "kind", get: (r) => r.kind },
        { label: "observed_harmonized", get: (r) => q2(r.observed) },
        { label: "forecast_median", get: (r) => (r.f ? q2(r.f.median) : "") },
        { label: "forecast_lo80", get: (r) => (r.f ? q2(r.f.lo80) : "") },
        { label: "forecast_hi80", get: (r) => (r.f ? q2(r.f.hi80) : "") },
        { label: "forecast_factor", get: (r) => (r.f ? q2(r.f.factor) : "") },
        { label: "baseline_p50", get: (r) => (r.f ? q2(r.f.baseline.p50) : "") },
        { label: "unit", get: () => T_("lab.g6.unit") },
        { label: "note", get: (r) => r.note },
      ]),
    );
  };

  let chart: ReactNode = null;
  if (!O.length) chart = <p className={cx("lb-empty")}>{T_("lab.ui.no_observed_months_for_this")}</p>;
  else if (tok && W0) chart = <MonthlySvg c={c} O={O} FM={FM} W0={W0} span={span} tok={tok} ld={ld} tip={tip} setTip={setTip} />;
  const last = O[O.length - 1];

  return (
    <section className={cx("panel lb-mon")} aria-label={T_("lab.ui.monthly_series_and_3_month_f")}>
      <div className={cx("panel-h")}>
        <h2>{T_("lab.ui.monthly_observed_and_next_3")}</h2>
        <div className={cx("seg lb-seg")} data-span="">
          {[24, 60].map((v) => (
            <button key={v} type="button" data-v={v} aria-pressed={span === v} onClick={() => setSpan(v)}>
              {T_(v === 24 ? "lab.ui.2_yr" : "lab.ui.5_yr")}
            </button>
          ))}
        </div>
      </div>
      <div className={cx("panel-b")}>
        <p className={cx("lb-csub")}>
          {last ? (
            <>
              <b>{c.regLabel}</b>
              <span className={cx("lb-ck")}>{T_("lab.ui.unit")}</span>
              {T_("lab.g6.unit")}
              <span className={cx("lb-ck")}>{T_("lab.ui.observed")}</span>
              <span className={cx("num nw")}>
                {F.ymS(O[0]!.ym)}–{F.ymS(last.ym)}
              </span>
              <span className={cx("lb-ck")}>{T_("lab.ui.month_in_progress")}</span>
              <span className={cx("nw")}>
                <span className={cx("num")}>{F.ymS(last.ym)}</span> {last.partial ? partLine : ""}
              </span>
            </>
          ) : (
            T_("lab.g6.unit")
          )}
        </p>
        <div className={cx("lb-mkeys")}>
          <span className={cx("lb-k lb-k-obs")}>
            <svg width="24" height="10" aria-hidden="true">
              <line x1="1" x2="23" y1="5" y2="5" />
              <circle cx="12" cy="5" r="2.6" />
            </svg>
            {T_("lab.ui.observed")}
          </span>
          <span className={cx("lb-k lb-k-part")}>
            <svg width="14" height="10" aria-hidden="true">
              <circle cx="7" cy="5" r="3.2" />
            </svg>
            {T_("lab.ui.month_in_progress")}
          </span>
          <span className={cx("lb-k lb-k-fc")}>
            <svg width="24" height="10" aria-hidden="true">
              <rect x="1" y="1" width="22" height="8" />
              <line x1="1" x2="23" y1="5" y2="5" />
            </svg>
            {T_("lab.ui.forecast_median_and_80_inter")}
          </span>
          <span className={cx("lb-k lb-k-base")}>
            <svg width="24" height="10" aria-hidden="true">
              <rect x="1" y="1" width="22" height="8" />
            </svg>
            {T_("lab.ui.normal_p10_p90")}
          </span>
        </div>
        <div className={cx("lb-mchart")} ref={setBox} data-mchart="">
          {chart}
        </div>
        <div className={cx("lb-cf")}>
          <span>{T_("lab.ui.data_nasa_firms_modis_1_km_v")}</span>
          <button type="button" className={cx("btn ghost sm")} data-x="mon" aria-label={T_("lab.ui.download_monthly_observed_an")} onClick={csv}>
            {T_("lab.ui.trend_csv")}
          </button>
        </div>
        <details className={cx("lb-tv")}>
          <summary>{T_("lab.ui.show_as_table")}</summary>
          <div className={cx("lb-tvb")}>
            <table className={cx("tbl lb-mt")}>
              <thead>
                <tr>
                  <th>{T_("lab.ui.month")}</th>
                  <th>{T_("lab.ui.type")}</th>
                  <th className={cx("r")}>{T_("lab.ui.value")}</th>
                  <th className={cx("r")}>{T_("lab.ui.80_interval2")}</th>
                  <th className={cx("r")}>{T_("lab.ui.normal_p502")}</th>
                </tr>
              </thead>
              <tbody>
                {O.slice(-6).map((d) => (
                  <tr key={d.ym}>
                    <td className={cx("num")}>{F.ymS(d.ym)}</td>
                    <td>{d.v == null ? T_("lab.ui.missing") : d.partial ? T_("lab.ui.observed_partial") : T_("lab.ui.observed")}</td>
                    <td className={cx("num r")}>{d.v == null ? "–" : F.num(d.v)}</td>
                    <td className={cx("r dim")}>–</td>
                    <td className={cx("r dim")}>–</td>
                  </tr>
                ))}
                {FM.map((f) => (
                  <tr key={f.month} className={cx("lb-mt-fc")}>
                    <td className={cx("num")}>{F.ymS(f.month)}</td>
                    <td>{T_("lab.ui.forecast")}</td>
                    <td className={cx("num r")}>{F.n1(f.median)}</td>
                    <td className={cx("num r")}>
                      {F.n1(f.lo80, f.hi80)} – {F.n1(f.hi80, f.lo80)}
                    </td>
                    <td className={cx("num r")}>{F.n1(f.baseline.p50)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

function MonthlySvg({ c, O, FM, W0, span, tok, ld, tip, setTip }: { c: LabCtx; O: Obs[]; FM: Fm[]; W0: number; span: number; tok: Tok; ld: number; tip: { i: number; left: number } | null; setTip: (v: { i: number; left: number } | null) => void }) {
  const { F, T_, FC } = c;
  const W = Math.max(300, W0);
  const Hh = W < 560 ? 230 : 270;
  const fs = parseFloat(tok["fs-1"]) || 11;
  const fsk = parseFloat(tok["fs-2"]) || 12;
  const pl = 44, pr = 14, pt = 26, pb = 30;
  const N = O.length + FM.length;
  const FW = span <= 24 ? 2.2 : 4;
  const wOf = (i: number) => (i < O.length ? 1 : FW);
  const tot = O.length + FM.length * FW;
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < N; i++) {
    cum.push(acc);
    acc += wOf(i);
  }
  const U = (W - pl - pr) / tot;
  const X = (i: number) => pl + ((cum[i] ?? 0) + wOf(i) / 2) * U;
  const SW = (i: number) => wOf(i) * U;
  const ov = O.filter((d) => d.v != null).map((d) => d.v as number).sort((a, b) => a - b);
  const q85 = ov.length ? (ov[Math.floor(ov.length * 0.85)] ?? 1) : 1;
  const top = Math.max(...FM.map((f) => Math.max(f.hi80 ?? 0, f.baseline.p90 ?? 0)), q85) * 1.18;
  const ymax = niceMax(top);
  const Y = (v: number | null) => pt + (1 - Math.min(v ?? 0, ymax) / ymax) * (Hh - pt - pb);
  const FCC = tok["text-1"], OBS = tok["data-harm"], MUTED = tok["text-2"], DIM = tok["text-3"], LINE = tok["line-soft"], LINE2 = tok["line-strong"], BG = tok["surface-0"];
  const zx = pl + (cum[O.length] ?? 0) * U;
  const fx = FM.map((_, j) => X(O.length + j));
  let lastFull = -1;
  for (let i = O.length - 1; i >= 0; i--) if (O[i]!.v != null && !O[i]!.partial) {
    lastFull = i;
    break;
  }
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  O.forEach((d, i) => {
    if (d.v == null || d.partial) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push([X(i), Y(d.v)]);
  });
  if (cur.length) segs.push(cur);
  const f0 = FM[0];
  const fl = FM[FM.length - 1];
  const pad = SW(O.length) * 0.42;
  const label = c.regLabel + T_("lab.ui.monthly_observations") + O.length + T_("lab.ui.months_with_3_month_forecast") + FM.map((f) => F.ymS(f.month) + T_("lab.ui.median2") + F.n1(f.median) + T_("lab.ui.80_interval") + F.n1(f.lo80, f.hi80) + "–" + F.n1(f.hi80, f.lo80) + ")").join(", ");

  const all = [...O.map((d) => ({ kind: d.v == null ? "miss" : d.partial ? "part" : "obs", d: d as Obs | Fm })), ...FM.map((f) => ({ kind: "fc", d: f as Obs | Fm }))];
  const tipBody = (i: number) => {
    const it = all[i];
    if (!it) return null;
    if (it.kind === "fc") {
      const d = it.d as Fm;
      return (
        <>
          <span className={cx("lb-tipk")}>
            {F.ymS(d.month)}
            {T_("lab.ui.forecast3")}
          </span>
          <b className={cx("num")}>{F.n1(d.median)}</b>
          <span className={cx("num")}>
            80% {F.n1(d.lo80, d.hi80)} – {F.n1(d.hi80, d.lo80)}
          </span>
          <span className={cx("num")}>
            {T_("lab.ui.normal_p50")}
            {F.n1(d.baseline.p50)}
            {T_("lab.ui.factor")}
            {d.factor == null ? "–" : d.factor.toFixed(2)}
          </span>
        </>
      );
    }
    const d = it.d as Obs;
    if (it.kind === "miss")
      return (
        <>
          <span className={cx("lb-tipk")}>
            {F.ymS(d.ym)}
            {T_("lab.ui.missing2")}
          </span>
          <span>{d.missing ?? T_("lab.ui.no_value")}</span>
        </>
      );
    return (
      <>
        <span className={cx("lb-tipk")}>
          {F.ymS(d.ym)}
          {T_("lab.ui.observed2")}
          {it.kind === "part" ? `${T_("lab.ui.partial_to_day")}${ld}${T_("lab.ui.s374")}` : ""}
        </span>
        <b className={cx("num")}>{F.num(d.v ?? 0)}</b>
        <span>{T_("lab.ui.harmonized")}</span>
      </>
    );
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    const u = (x - pl) / U;
    let i = 0;
    while (i < N - 1 && (cum[i + 1] ?? Infinity) <= u) i++;
    const px = (X(i) / W) * r.width;
    setTip({ i, left: Math.max(0, px > r.width - 190 ? px - 182 : px + 12) });
  };

  return (
    <>
      <svg viewBox={`0 0 ${W} ${Hh}`} width={W} height={Hh} role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => setTip(null)}>
        <defs>
          <pattern id="lbfz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={FCC} strokeOpacity=".07" strokeWidth="2" />
          </pattern>
        </defs>
        <rect x={zx.toFixed(1)} y={pt - 18} width={(W - pr - zx).toFixed(1)} height={Hh - pb - pt + 18} fill="url(#lbfz)" />
        <line x1={zx.toFixed(1)} x2={zx.toFixed(1)} y1={pt - 18} y2={Hh - pb} stroke={FCC} strokeOpacity=".45" strokeDasharray="3 3" />
        <SvgT fs={fs} fsk={fsk} muted={MUTED} x={zx + 6} y={pt - 6} s={T_("lab.ui.forecast")} fill={FCC} />
        {FC ? <SvgT fs={fs} fsk={fsk} muted={MUTED} x={zx - 6} y={pt - 6} s={T_("lab.ui.issued") + F.md(FC.issued)} anchor="end" /> : null}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (ymax * i) / 4;
          const y = Y(v);
          return (
            <g key={i}>
              <line x1={pl} x2={W - pr} y1={y.toFixed(1)} y2={y.toFixed(1)} stroke={i ? LINE : LINE2} strokeDasharray={i ? "2 3" : undefined} />
              <SvgT fs={fs} fsk={fsk} muted={MUTED} x={pl - 6} y={y + 3.5} s={F.axis(v, 1e4)} anchor="end" />
            </g>
          );
        })}
        {[...O.map((d) => ({ m: d.m, y: d.y })), ...FM.map((f) => ({ m: f.m, y: f.year }))].map((d, i) =>
          d.m === 1 ? (
            <g key={"x" + i}>
              <SvgT fs={fs} fsk={fsk} muted={MUTED} x={X(i)} y={Hh - 10} s={d.y} anchor="middle" fill={FCC} />
              <line x1={X(i).toFixed(1)} x2={X(i).toFixed(1)} y1={Hh - pb} y2={Hh - pb + 4} stroke={LINE2} />
            </g>
          ) : span <= 24 && (d.m === 4 || d.m === 7 || d.m === 10) && W >= 420 ? (
            <SvgT fs={fs} fsk={fsk} muted={MUTED} key={"x" + i} x={X(i)} y={Hh - 10} s={F.month(d.m)} anchor="middle" fill={DIM} />
          ) : null,
        )}
        {FM.map((f, j) => {
          const i = O.length + j;
          const bw = Math.min(40, SW(i) * 0.62);
          return (
            <g key={"b" + j}>
              <rect x={(X(i) - bw / 2).toFixed(1)} y={Y(f.baseline.p90).toFixed(1)} width={bw.toFixed(1)} height={Math.max(1, Y(f.baseline.p10) - Y(f.baseline.p90)).toFixed(1)} rx="1" fill={MUTED} fillOpacity=".16" />
              <line x1={(X(i) - bw / 2).toFixed(1)} x2={(X(i) + bw / 2).toFixed(1)} y1={Y(f.baseline.p50).toFixed(1)} y2={Y(f.baseline.p50).toFixed(1)} stroke={MUTED} strokeWidth="1.4" />
            </g>
          );
        })}
        {f0 && fl && f0.median != null ? (
          <g>
            <polygon
              points={[`${((fx[0] ?? 0) - pad).toFixed(1)},${Y(f0.hi80).toFixed(1)}`, ...FM.map((f, j) => `${(fx[j] ?? 0).toFixed(1)},${Y(f.hi80).toFixed(1)}`), `${((fx[fx.length - 1] ?? 0) + pad).toFixed(1)},${Y(fl.hi80).toFixed(1)}`, `${((fx[fx.length - 1] ?? 0) + pad).toFixed(1)},${Y(fl.lo80).toFixed(1)}`, ...FM.map((f, j) => `${(fx[j] ?? 0).toFixed(1)},${Y(f.lo80).toFixed(1)}`).reverse(), `${((fx[0] ?? 0) - pad).toFixed(1)},${Y(f0.lo80).toFixed(1)}`].join(" ")}
              fill={FCC}
              fillOpacity=".14"
              stroke={FCC}
              strokeOpacity=".28"
              strokeWidth="1"
            />
            {lastFull >= 0 ? <line x1={X(lastFull).toFixed(1)} y1={Y(O[lastFull]!.v).toFixed(1)} x2={(fx[0] ?? 0).toFixed(1)} y2={Y(f0.median).toFixed(1)} stroke={FCC} strokeOpacity=".35" strokeWidth="1.2" strokeDasharray="2 4" /> : null}
            <polyline points={FM.map((f, j) => `${(fx[j] ?? 0).toFixed(1)},${Y(f.median).toFixed(1)}`).join(" ")} fill="none" stroke={FCC} strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />
            {FM.map((f, j) => (
              <circle key={"m" + j} cx={(fx[j] ?? 0).toFixed(1)} cy={Y(f.median).toFixed(1)} r="3.6" fill={BG} stroke={FCC} strokeWidth="1.8" />
            ))}
            {FM.map((f, j) => (SW(O.length + j) >= 40 || j === FM.length - 1 ? <SvgT fs={fs} fsk={fsk} muted={MUTED} key={"n" + j} x={fx[j] ?? 0} y={Y(f.hi80) - 6} s={F.n1(f.median)} anchor="middle" weight={600} fill={FCC} /> : null))}
          </g>
        ) : null}
        {O.map((d, i) =>
          d.v == null ? (
            <g key={"miss" + i}>
              <rect x={(X(i) - SW(i) / 2).toFixed(1)} y={pt} width={SW(i).toFixed(1)} height={Hh - pt - pb} fill={MUTED} fillOpacity=".12" />
              <SvgT fs={fs} fsk={fsk} muted={MUTED} x={X(i)} y={pt + 10} s={T_("lab.ui.missing")} anchor="middle" />
            </g>
          ) : null,
        )}
        {segs.map((g, k) => {
          const g0 = g[0]!;
          const gl = g[g.length - 1]!;
          return (
            <g key={"s" + k}>
              {g.length > 1 ? <path d={`M${g.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}L${gl[0].toFixed(1)},${Hh - pb}L${g0[0].toFixed(1)},${Hh - pb}Z`} fill={OBS} fillOpacity=".1" /> : null}
              <polyline points={g.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} fill="none" stroke={OBS} strokeWidth="2" strokeLinejoin="round" />
            </g>
          );
        })}
        {O.map((d, i) => {
          if (d.v == null) return null;
          const x = X(i);
          const y = Y(d.v);
          const prev = O[i - 1];
          return (
            <g key={"o" + i}>
              {d.partial ? (
                <>
                  {prev && prev.v != null ? <line x1={X(i - 1).toFixed(1)} y1={Y(prev.v).toFixed(1)} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke={OBS} strokeWidth="1.4" strokeDasharray="2 3" /> : null}
                  <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="4" fill={BG} stroke={OBS} strokeWidth="1.8" />
                  <SvgT fs={fs} fsk={fsk} muted={MUTED} x={x - 7} y={y - 4} s={T_("lab.fx.thru", { d: ld })} anchor="end" fill={FCC} />
                </>
              ) : span <= 24 || d.v > ymax ? (
                <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={span <= 24 ? 2.6 : 2} fill={OBS} />
              ) : null}
              {d.v > ymax ? (
                <>
                  <path d={`M${(x - 5).toFixed(1)},${pt + 1}L${x.toFixed(1)},${pt - 6}L${(x + 5).toFixed(1)},${pt + 1}Z`} fill={OBS} />
                  <SvgT fs={fs} fsk={fsk} muted={MUTED} x={x + 7} y={pt + 2} s={F.num(d.v) + T_("lab.ui.off_axis")} fill={FCC} />
                </>
              ) : null}
            </g>
          );
        })}
        <rect x={pl} y={pt} width={W - pl - pr} height={Hh - pt - pb} fill="transparent" />
        {tip ? <line x1={X(tip.i)} x2={X(tip.i)} y1={pt} y2={Hh - pb} stroke={FCC} strokeOpacity=".35" /> : null}
      </svg>
      {tip ? (
        <div className={cx("lb-tip", all[tip.i]?.kind === "fc" && "fc")} style={{ left: tip.left, top: 8 }}>
          {tipBody(tip.i)}
        </div>
      ) : null}
    </>
  );
}

/* ── 모형 성능(연도 빼기 검증 · 한 달 앞 뒷검증) — 스냅숏 값 그대로 ── */
function Hind(c: LabCtx) {
  const { FC, F, T_, selAoi } = c;
  const [setBox, W0] = useWidth<HTMLDivElement>();
  const tok = useTok();
  const o = selAoi && FC ? (FC.ix.get(selAoi) ?? null) : null;
  if (!o || !FC) return <p className={cx("lb-empty")}>{T_("lab.ui.no_months_to_hindcast")}</p>;
  const R = hindRows(o, FC.m.hindcast.months);
  const { mae, mae0, cov, n } = skill(o);
  const better = mae < mae0;
  const dpct = mae0 ? (Math.abs(mae - mae0) / mae0) * 100 : null;
  const mx = Math.max(mae, mae0) * 1.08 || 1;
  const Wd = (v: number) => `${((v / mx) * 100).toFixed(1)}%`;
  const hit = R.filter((r) => r.hit).length;
  /* 구간 위로 벗어난 달 중 실측이 가장 큰 달 — 고른 지역 뒷검증 값에서 고른다(고정 사례 달 아님) */
  const bigMiss = R.filter((r) => !r.hit && r.actual > r.hi80).reduce<(typeof R)[number] | null>((m, r) => (!m || r.actual > m.actual ? r : m), null);
  return (
    <>
      <SumList
        pairs={[
          [T_("lab.ui.vs_climatology"), dpct == null ? "–" : <><span className={cx("num")}>{dpct.toFixed(0)}%</span> {better ? T_("lab.ui.lower") : T_("lab.ui.higher")}</>],
          [T_("lab.ui.80_interval_hit_rate"), <><span className={cx("num")}>{(cov * 100).toFixed(1)}%</span>{T_("lab.ui.target_80")}</>],
          [T_("lab.ui.sample"), <><span className={cx("num")}>{n}</span>{T_("lab.ui.months")} <span className={cx("num")}>2012–2025</span></>],
          [T_("lab.g6.lim"), bigMiss ? T_("lab.g6.lim_t", { m: F.ymS(bigMiss.ym) }) : T_("lab.g6.lim_none")],
        ]}
      />
      <div className={cx("lb-pfmae")} role="img" aria-label={`${T_("lab.g6.mae_log")} ${mae.toFixed(3)} / ${mae0.toFixed(3)}`}>
        <div className={cx("lb-pfr")}>
          <span>{T_("lab.ui.this_model")}</span>
          <i className={cx("lb-pfb lb-pfb-m")} style={{ width: Wd(mae) }} />
          <b className={cx("num")}>{mae.toFixed(3)}</b>
        </div>
        <div className={cx("lb-pfr")}>
          <span>{T_("lab.ui.climatology2")}</span>
          <i className={cx("lb-pfb lb-pfb-c")} style={{ width: Wd(mae0) }} />
          <b className={cx("num")}>{mae0.toFixed(3)}</b>
        </div>
      </div>
      <p className={cx("lb-cap")}>{T_("lab.g6.mae_log")}</p>
      <div className={cx("lb-sub")}>
        <h3>{T_("lab.ui.forecast_vs_actual")}</h3>
        <span className={cx("lb-hkeys")}>
          <span>
            <i className={cx("lb-hk-b")} />
            {T_("lab.ui.80_interval2")}
          </span>
          <span>
            <i className={cx("lb-hk-in")} />
            {T_("lab.ui.inside_interval")}
          </span>
          <span>
            <i className={cx("lb-hk-out")} />
            {T_("lab.ui.outside_interval")}
          </span>
        </span>
      </div>
      <div className={cx("lb-hchart")} ref={setBox} data-hchart="" data-hit={`${hit}/${R.length}`}>
        {tok && W0 ? <HindSvg c={c} R={R} W0={W0} tok={tok} /> : null}
      </div>
      <p className={cx("lb-cap")}>{T_("lab.g6.hc_cap", { a: F.ymS(R[0]!.ym), b: F.ymS(R[R.length - 1]!.ym), h: hit, n: R.length })}</p>
    </>
  );
}

function HindSvg({ c, R, W0, tok }: { c: LabCtx; R: ReturnType<typeof hindRows>; W0: number; tok: Tok }) {
  const { F, T_ } = c;
  const W = Math.max(260, W0);
  const Hh = 160, pl = 34, pr = 8, pt = 22, pb = 22;
  const fs = parseFloat(tok["fs-1"]) || 11;
  const fsk = parseFloat(tok["fs-2"]) || 12;
  const FCC = tok["text-1"], MUTED = tok["text-2"], DIM = tok["text-3"];
  const hs = R.map((r) => Math.max(r.hi80, r.actual)).sort((a, b) => a - b);
  const capY = niceMax((hs[Math.floor(hs.length * 0.85)] ?? 1) * 1.4);
  const X = (i: number) => pl + ((i + 0.5) * (W - pl - pr)) / R.length;
  const Y = (v: number) => pt + (1 - Math.min(v, capY) / capY) * (Hh - pt - pb);
  const bw = Math.max(3, ((W - pl - pr) / R.length) * 0.55);
  const hit = R.filter((r) => r.hit).length;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} width={W} height={Hh} role="img" aria-label={`${T_("lab.ui.hindcast_forecast_vs_actual")}${F.ymS(R[0]!.ym)}–${F.ymS(R[R.length - 1]!.ym)}${T_("lab.ui.months_with_actual_inside_th")}${hit}${T_("lab.ui.s405")}${R.length}${T_("lab.ui.s406")}`}>
      {[0, 0.5, 1].map((k) => (
        <g key={k}>
          <line x1={pl} x2={W - pr} y1={Y(capY * k).toFixed(1)} y2={Y(capY * k).toFixed(1)} stroke={k ? tok["line-soft"] : tok["line-strong"]} strokeDasharray={k ? "2 3" : undefined} />
          <SvgT fs={fs} fsk={fsk} muted={MUTED} x={pl - 5} y={Y(capY * k) + 3.5} s={F.axis(capY * k)} anchor="end" />
        </g>
      ))}
      {R.map((r, i) => {
        const x = X(i);
        const m = +r.ym.slice(5, 7);
        const y = Y(r.actual);
        const out = r.actual > capY;
        return (
          <g key={r.ym}>
            {r.hi80 > capY ? <path d={`M${(x - 3.5).toFixed(1)},${pt + 3}L${x.toFixed(1)},${pt - 2}L${(x + 3.5).toFixed(1)},${pt + 3}Z`} fill={FCC} fillOpacity=".5" /> : null}
            <rect x={(x - bw / 2).toFixed(1)} y={Y(r.hi80).toFixed(1)} width={bw.toFixed(1)} height={Math.max(2, Y(r.lo80) - Y(r.hi80)).toFixed(1)} rx="1" fill={FCC} fillOpacity=".16">
              <title>{`${r.ym}${T_("lab.ui.forecast4")}${F.n1(r.median)}${T_("lab.ui.80_interval")}${F.n1(r.lo80, r.hi80)}–${F.n1(r.hi80, r.lo80)}${T_("lab.ui.actual")}${r.actual}${r.hit ? T_("lab.ui.inside") : T_("lab.ui.outside")}`}</title>
            </rect>
            <line x1={(x - bw / 2).toFixed(1)} x2={(x + bw / 2).toFixed(1)} y1={Y(r.median).toFixed(1)} y2={Y(r.median).toFixed(1)} stroke={FCC} strokeOpacity=".7" strokeDasharray="2 1.5" />
            {r.hit ? <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.9" fill={tok["data-harm"]} /> : <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.2" fill={tok["surface-0"]} stroke={tok["data-viirs"]} strokeWidth="1.8" />}
            {out ? (
              <>
                <line x1={x.toFixed(1)} x2={x.toFixed(1)} y1={pt - 5} y2={pt - 13} stroke={tok["data-viirs"]} strokeWidth="1.2" />
                <SvgT fs={fs} fsk={fsk} muted={MUTED} x={x + (i > R.length - 5 ? -6 : 6)} y={pt - 9} s={F.num(r.actual) + "↑"} anchor={i > R.length - 5 ? "end" : undefined} fill={FCC} />
              </>
            ) : null}
            {m === 1 ? <SvgT fs={fs} fsk={fsk} muted={MUTED} x={x} y={Hh - 6} s={r.ym.slice(0, 4)} anchor="middle" fill={FCC} /> : m === 7 ? <SvgT fs={fs} fsk={fsk} muted={MUTED} x={x} y={Hh - 6} s={F.month(7)} anchor="middle" fill={DIM} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

/* ── 보정 검증: /methods/current 검증 행(실서버에 meta.validation 이 없으면 korea_pooled 를 행으로 옮긴 것) ── */
function Validation(c: LabCtx) {
  const { T_, F } = c;
  const mq = useQuery(methodQuery());
  if (mq.isError) {
    const code = (mq.error as { code?: string } | null)?.code;
    return <p className={cx("lb-md")}>{c.t(code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.network")}</p>;
  }
  const M = mq.data as { method_version?: string; meta?: Parameters<typeof valRows>[0] } | undefined;
  if (!M) return null;
  const rows = valRows(M.meta);
  const COLS = ([["mae_month_total", "lab.g3.mae", 1], ["bias_ratio", "lab.g3.bias", 2], ["rank_corr_month", "lab.g3.rank", 2], ["ratio", "lab.g3.ratio", 3]] as const).filter(([k]) => rows.some((v) => v.metrics[k] != null));
  const empty = (v: (typeof rows)[number]) => Object.keys(v.metrics).every((k) => v.metrics[k] == null);
  const scopeW = (sc: string) => {
    const k = "lab.g3.sc." + sc;
    const w = c.t(k);
    return w === k ? sc : w;
  };
  return (
    <>
      <div className={cx("tbl-wrap")}>
        <table className={cx("tbl lb-vt")}>
          <thead>
            <tr>
              <th>{T_("lab.g3.model")}</th>
              {COLS.map(([k, t]) => (
                <th key={k} className={cx("r")}>
                  {T_(t)}
                </th>
              ))}
              <th className={cx("r")}>n</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const e = empty(v);
              return (
                <tr key={v.model + v.scope} className={e ? cx("lb-vt-na") : undefined}>
                  <td>
                    <span className={cx("num")}>{v.model}</span>
                    {e ? <> <span className={cx("lb-md")}>{T_("lab.g3.pending")}</span></> : v.selected ? <> <span className={cx("lb-md")}>{T_("lab.g3.selected")}</span></> : null}
                    <small className={cx("lb-vsc")}>{scopeW(v.scope)}</small>
                  </td>
                  {COLS.map(([k, , d]) => (
                    <td key={k} className={cx("r num")}>
                      {v.metrics[k] == null ? "–" : F.num(v.metrics[k] as number, d)}
                    </td>
                  ))}
                  <td className={cx("r num")}>{v.n == null ? "–" : F.num(v.n)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={cx("lb-cf")}>
        <span>
          NASA FIRMS · <span className={cx("num")}>{M.method_version ?? ""}</span>
        </span>
      </div>
    </>
  );
}

/* ── 자료와 방법(접힘): 고른 지역 또는 권역의 계산 과정 ── */
function How(c: LabCtx) {
  const { FC, F, T_, selRow } = c;
  const r = selRow;
  const o = r?.ol;
  const M = FC?.m;
  let body: ReactNode = <p className={cx("lb-empty")}>{T_("lab.ui.insufficient_data")}</p>;
  if (r && o && M) {
    const rx = (o.rx[o.rx.length - 1] ?? 0) / 100;
    const LVW = { high: c.t("data.fc.level.high"), normal: c.t("data.fc.level.normal"), low: c.t("data.fc.level.low"), na: T_("lab.ui.insufficient_data") };
    const steps: [string, string, string][] = [
      [T_("lab.g6.h_base"), T_("lab.g6.h_base_d", { m: F.ymS(M.targets[0] ?? ""), a: M.base_years[0], b: M.base_years[1] }), `p10 ${F.n1(r.baseline.p10)}, p50 ${F.n1(r.baseline.p50)}, p90 ${F.n1(r.baseline.p90)}`],
      [T_("lab.g6.h_recent"), T_("lab.g6.h_recent_d", { m: F.ymS(M.origin) }), `(1+${F.n1((o.rv[o.rv.length - 1] ?? 0) / 10)}) / (1+p50) = ${rx.toFixed(2)}`],
      [T_("lab.ui.forecast"), T_("lab.g6.h_fc_d"), `β ${(M.beta[0] ?? 0).toFixed(3)} · b0 ${(M.b0[0] ?? 0).toFixed(3)} → ${F.n1(r.median)}`],
      [T_("lab.g6.h_int"), T_("lab.g6.h_int_d"), `λ ${(M.lambda[0] ?? 0).toFixed(3)} → ${F.n1(r.lo80)} – ${F.n1(r.hi80)}`],
      [T_("lab.ui.level"), T_("lab.g6.h_vd_d"), LVW[lvOf(r)]],
    ];
    body = (
      <>
        <ol className={cx("lb-steps")}>
          {steps.map((st) => (
            <li key={st[0]}>
              <div>
                <b>{st[0]}</b>
                <span>{st[1]}</span>
              </div>
              <code className={cx("num")}>{st[2]}</code>
            </li>
          ))}
        </ol>
        <ul className={cx("lb-lims")}>
          {["lim_1", "lim_2", "lim_3"].map((k) => (
            <li key={k}>{T_("lab.g6." + k)}</li>
          ))}
        </ul>
      </>
    );
  }
  const base = FC ? `${FC.m.base_years[0]}–${FC.m.base_years[1]}` : "";
  return (
    <details className={cx("disclosure")}>
      <summary>
        <ChevronRight aria-hidden="true" />
        <span>{T_("lab.ui.data_method")}</span>
        <span className={cx("dc-m")}>{c.allLabel}</span>
      </summary>
      <div className={cx("dc-b")}>
        <div>{body}</div>
        <div className={cx("lb-src")}>
          <SumList
            pairs={[
              [T_("lab.ui.baseline_distribution"), base + T_("lab.ui.same_period")],
              [T_("lab.ui.unit"), T_("lab.ui.satellite_detections_not_fir")],
              [T_("lab.ui.area_value"), T_("lab.ui.computed_for_the_whole_area")],
            ]}
          />
        </div>
      </div>
    </details>
  );
}
