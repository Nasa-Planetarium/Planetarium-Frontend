"use client";

import { useState } from "react";
import { ChevronLeft, Download, FileText } from "lucide-react";
import { api } from "@/shared/api";
import { toast } from "@/shared/ui/toast";
import { LIM_BASE, RESULT_COLS, calendarCSV, isoD, lastDay, monthRec, safeName, toCSV, trDefault } from "../model/analysis";
import { ymIso } from "../model/core";
import { Status } from "./bits";
import { saveText } from "./charts";
import { cx } from "./cx";
import { Detail, Sentence, sentText, trendCSVMonth, unitOf } from "./s2";
import type { Ctx } from "./types";
import { VdMark } from "./vd-mark";

/** 원본 핫스팟 CSV 열 수(핸드오프 §1-1, 목업 EM.api.CSV_COLS.hotspots) */
const HOT_COLS = 19;

/* ═════════ 3 근거·보고 ═════════ */
export function S3({ x }: { x: Ctx }) {
  const { T, W, c, M, cal, rec, y, m } = x;
  const [rawNote, setRawNote] = useState<string | null>(null);
  const rawOk = !(M?.files && M.files.hotspots === false);
  const name = x.aoiName(rec);
  const sy = cal?.months.find((r) => r.status !== "out_of_range")?.year ?? 2000;
  const ey = [...(cal?.months ?? [])].reverse().find((r) => r.status !== "out_of_range")?.year ?? 2026;
  const tr = { ...trDefault(y, m), freq: "month" as const };

  const resultCSV = () => {
    if (!c) return;
    const B = x.base;
    saveText(
      `emberline_result_${safeName(x.aoi)}_${ymIso(y, m)}.csv`,
      toCSV(
        [
          {
            aoi_id: x.aoi, aoi_name: name, year: y, month: m, value: c.value, value_lo: c.value_lo, value_hi: c.value_hi, value_source: c.value_source, status: c.status, verdict: c.verdict, percentile: c.percentile,
            ratio_to_median: c.ratio_to_median, baseline_median: c.baseline_median, baseline_p25: c.baseline_p25, baseline_p75: c.baseline_p75, n_baseline_years: c.n_baseline_years, baseline_from: B.from, baseline_to: B.to,
            sentence: sentText(x), method_version: M?.method_version ?? c.method_version ?? "", release: M?.data_version ?? "",
          },
        ],
        RESULT_COLS,
      ),
    );
  };
  const rawCSV = async () => {
    const ym = ymIso(y, m);
    const q = { aoi_id: x.aoi, start: `${ym}-01`, end: isoD(y, m, lastDay(y, m)), layer: "all", limit: 10000, format: "csv" };
    try {
      const r = await api.GET("/hotspots", { params: { query: q as never }, parseAs: "text" });
      if (r.error || typeof r.data !== "string") throw new Error("hotspots");
      saveText(`emberline_hotspots_${safeName(x.aoi)}_${ym}.csv`, r.data);
    } catch {
      setRawNote(W("err.network"));
    }
  };
  /* 인쇄(목업 data-print): 인쇄 전용 6절 문서(PrintDoc)가 화면 대신 나간다. 인쇄 창을 못 열면 토스트 */
  const print = () => {
    try {
      window.print();
    } catch {
      toast({ text: T("ui.couldn_t_open_the_print_dial"), icon: "alert" });
    }
  };

  return (
    <div className={cx("an-s3")}>
      <div className={cx("an-s3main an-screen")}>
        <article className={cx("panel an-doc")} aria-label={T("ui.analysis_result")}>
          <div className={cx("an-res")}>{c ? <ResultLine x={x} /> : null}</div>
          <div className={cx("an-s3dist")}>{c ? <Detail x={x} light width={640} /> : null}</div>
          <details className={cx("an-ev an-meth")}>
            <summary>
              <b>{T("g3.method_full")}</b>
            </summary>
            <div className={cx("an-evb")}>
              <MethodBody x={x} />
            </div>
          </details>
        </article>
      </div>
      <aside className={cx("an-s3side an-screen")}>
        <section className={cx("panel an-exp")}>
          <div className={cx("panel-h")}>
            <h3>{T("ui.export")}</h3>
          </div>
          <div className={cx("panel-b")}>
            <button type="button" className={cx("an-xb")} data-csv="" disabled={!cal} onClick={() => cal && saveText(`emberline_calendar_${safeName(x.aoi)}_${sy}-${ey}.csv`, calendarCSV(cal))}>
              <span>
                <b>{T("g3.csv_same")}</b>
                <small>{`${name} · ${sy}–${ey} · ${T("g3.csv_fields")}`}</small>
              </span>
              <Download className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
            <button type="button" className={cx("an-xb")} data-sumcsv="" onClick={resultCSV}>
              <span>
                <b>{T("g6.sum_csv")}</b>
                <small>{`${name} · ${ymIso(y, m)} · ${T("g6.sum_csv_d")}`}</small>
              </span>
              <Download className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
            <button type="button" className={cx("an-xb")} data-trcsv="" onClick={() => saveText(`emberline_summary_${safeName(x.aoi)}_${tr.start}_${tr.end}_month.csv`, trendCSVMonth(x, tr))}>
              <span>
                <b>{T("g6.tr_csv_b")}</b>
                <small>{`${tr.start} – ${tr.end} · ${T("g6.tr_month")}`}</small>
              </span>
              <Download className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
            <button type="button" className={cx("an-xb")} data-print="" onClick={print}>
              <span>
                <b>{T("ui.print_summary")}</b>
                <small>{T("g3.print_meta")}</small>
              </span>
              <FileText className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
            <button type="button" className={cx("an-xb sub")} data-raw="" disabled={!rawOk} aria-disabled={!rawOk || undefined} onClick={() => void rawCSV()}>
              <span>
                <b>{T("g3.raw_csv")}</b>
                <small>{rawNote ?? (rawOk ? `${ymIso(y, m)} · ${T("g3.cols_n", { n: HOT_COLS })}` : T("g3.raw_none"))}</small>
              </span>
              <Download className={cx("ic ic-btn")} aria-hidden="true" />
            </button>
          </div>
        </section>
        <div className={cx("an-back")}>
          <button type="button" className={cx("btn")} data-back="" onClick={() => x.go(2)}>
            <ChevronLeft aria-hidden="true" />
            {T("g3.to_cal")}
          </button>
          <button type="button" className={cx("btn")} data-s1="" onClick={() => x.go(1)}>
            {T("ui.change_scope")}
          </button>
        </div>
      </aside>
      <PrintDoc x={x} />
    </div>
  );
}

/* 인쇄 전용(@media print) — 목업 printDoc 6절: ①지역·기간 ②결과 ③방법 ④검증 수치 ⑤한계 ⑥출처. 결과가 없으면 「인쇄할 결과 없음」 */
export function PrintDoc({ x }: { x: Ctx }) {
  const { T, W, c, M, base } = x;
  const name = x.aoiName(x.rec);
  const ym = ymIso(x.y, x.m);
  const li = (k: string, v: React.ReactNode) => (
    <li key={k}>
      <b>{k}</b> {v}
    </li>
  );
  if (!c)
    return (
      <div className={cx("an-print")} aria-hidden="true" data-printdoc="empty">
        <header>
          <div className={cx("pt-brand")}>{T("ui.emberline_analysis")}</div>
          <h1>{T("ui.nothing_to_print")}</h1>
        </header>
      </div>
    );
  const r = c.rule ?? M?.verdict_rule ?? null;
  const lims = x.rec?.derived ? [...LIM_BASE, "group_sum_rule"] : LIM_BASE;
  const ds = monthRec(x.cal, x.y, x.m)?.data_source ?? null;
  const mv = M?.method_version ?? c.method_version ?? "";
  return (
    <div className={cx("an-print")} aria-hidden="true" data-printdoc="">
      <header>
        <div className={cx("pt-brand")}>{T("ui.emberline_analysis")}</div>
        <h1>
          {name} {ym}
        </h1>
      </header>
      <section>
        <h2>{T("g3.p_scope")}</h2>
        <ul>
          {li(T("ui.region"), `${name} (${x.aoi})`)}
          {li(T("ui.analysis_month"), ym)}
          {li(T("ui.baseline"), T("g3.baseline_fixed", { a: base.from, b: base.to }))}
          {li(T("g3.m_month"), T("g3.month_local"))}
        </ul>
      </section>
      <section>
        <h2>{T("g3.p_result")}</h2>
        <ul>
          {li(
            T("g3.k_value"),
            `${x.nf(c.value)}${c.value_lo != null && c.value_lo !== c.value_hi ? ` (${T("g3.range_lohi", { lo: x.nf(c.value_lo), hi: x.nf(c.value_hi) })})` : ""} ${W("unit.snpp_equiv")} · ${W(`st.${c.status}`)}`,
          )}
          {li(T("g3.k_verdict"), c.verdict ? W(`verdict.${c.verdict}`) : "–")}
          {sentText(x) ? <li key="sent">{sentText(x)}</li> : null}
          {li(T("g3.k_pct"), x.nf(c.percentile))}
          {li(T("ui.vs_median"), c.ratio_to_median != null ? `${c.ratio_to_median.toFixed(1)}${T("ui.s101")} (${T("ui.median")} ${x.nf(c.baseline_median)})` : "–")}
          {li("n", c.n_baseline_years ?? "–")}
          {li(T("g3.c_source"), c.value_source ? `${W(`vsrc.${c.value_source}`)}${ds ? ` · ${W(`dsrc.${String(ds).toLowerCase()}`)}` : ""}` : "–")}
        </ul>
        <div className={cx("pt-chart")}>
          <Detail x={x} light width={640} />
        </div>
      </section>
      <section>
        <h2>{T("g3.p_method")}</h2>
        <ul>
          {li(T("g3.m_version"), mv || "–")}
          {li(T("g3.m_data"), M?.data_version ?? "–")}
          {li(T("g3.m_rule"), r ? `${T("g3.rule", { a: r.above_if_percentile_ge ?? 80, b: r.below_if_percentile_le ?? 20, n: r.uncertain_if_years_lt ?? 10 })}${r.id ? ` (${r.id})` : ""}` : "–")}
          {li(T("g3.m_unit"), W("unit.snpp_equiv"))}
        </ul>
      </section>
      <section>
        <h2>{T("g3.p_val")}</h2>
        <ValTable x={x} />
      </section>
      <section>
        <h2>{T("g3.p_lim")}</h2>
        <ul>
          {lims.map((k) => (
            <li key={k}>{W(`lim.${k}`)}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>{T("g3.p_src")}</h2>
        <ul>
          <li>NASA FIRMS — https://firms.modaps.eosdis.nasa.gov/</li>
          <li>Natural Earth — https://www.naturalearthdata.com/</li>
        </ul>
      </section>
      <footer>{`EMBERLINE · ${x.aoi} · ${ym} · ${mv} · ${M?.data_version ?? ""}`}</footer>
    </div>
  );
}

function ResultLine({ x }: { x: Ctx }) {
  const { T, W, c } = x;
  if (!c) return null;
  const ds = monthRec(x.cal, x.y, x.m)?.data_source ?? null;
  const kv = (k: string, v: React.ReactNode) => (
    <div className={cx("an-rk")} key={k}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <>
      <h2 className={cx("an-rh")}>
        {x.aoiName(x.rec)} <span className={cx("num")}>{ymIso(x.y, x.m)}</span>
      </h2>
      <Sentence x={x} />
      <dl className={cx("an-rkv")}>
        {kv(
          T("g3.k_value"),
          <span className={cx("nw")}>
            <b className={cx("num")}>{x.nf(c.value)}</b> <Status st={c.status} />
          </span>,
        )}
        {kv(T("g3.k_verdict"), c.verdict ? <VdMark v={c.verdict} p={c.percentile ?? null} /> : <Status st={c.status} />)}
        {kv(T("g3.k_pct"), <b className={cx("num")}>{x.nf(c.percentile)}</b>)}
        {kv(
          T("ui.vs_median"),
          c.ratio_to_median != null ? (
            <>
              <b className={cx("num")}>{c.ratio_to_median.toFixed(1)}</b>
              {T("ui.s101")}
            </>
          ) : (
            "–"
          ),
        )}
        {kv("n", <b className={cx("num")}>{c.n_baseline_years ?? "–"}</b>)}
      </dl>
      <p className={cx("an-srcw")}>
        {unitOf({ ...x, view: "value" })}
        {c.value_source ? ` · ${W(`vsrc.${c.value_source}`)}${ds ? ` · ${W(`dsrc.${String(ds).toLowerCase()}`)}` : ""}` : ""}
      </p>
    </>
  );
}

const VCOLS: [string, string, number][] = [
  ["mae_month_total", "g3.c_mae", 1],
  ["bias_ratio", "g3.c_bias", 2],
  ["rank_corr_month", "g3.c_rank", 2],
  ["ratio", "g3.c_ratio", 3],
];
/** 검증 수치 표 — 화면(방법 접기)과 인쇄 문서가 같은 표를 쓴다 */
function ValTable({ x }: { x: Ctx }) {
  const { T, M } = x;
  const rows = (M?.meta?.validation ?? []).slice().sort((a, b) => Number(b.scope === x.aoi) - Number(a.scope === x.aoi));
  const cols = VCOLS.filter(([k]) => rows.some((v) => v.metrics?.[k] != null));
  const f = (v: number | null | undefined, d: number) => (v == null ? "–" : v.toFixed(d));
  if (!rows.length) return <p>–</p>;
  return (
    <table className={cx("tbl an-vt2")}>
      <thead>
        <tr>
          <th>{T("g3.c_model")}</th>
          {cols.map(([k, w]) => (
            <th key={k} className={cx("r")}>
              {T(w)}
            </th>
          ))}
          <th className={cx("r")}>n</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => (
          <tr key={v.model + v.scope}>
            <td>
              <span className={cx("num")}>{v.model}</span>
              {v.selected ? ` · ${T("g3.selected")}` : ""} <small className={cx("an-vsc")}>{v.scope}</small>
            </td>
            {cols.map(([k, , d]) => (
              <td key={k} className={cx("r num")}>
                {f(v.metrics?.[k], d)}
              </td>
            ))}
            <td className={cx("r num")}>{v.n ?? "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MethodBody({ x }: { x: Ctx }) {
  const { T, W, M, c, base } = x;
  const r = c?.rule ?? M?.verdict_rule ?? null;
  const lims = x.rec?.derived ? [...LIM_BASE, "group_sum_rule"] : LIM_BASE;
  return (
    <>
      <dl className={cx("an-mdl")}>
        <dt>{T("g3.m_version")}</dt>
        <dd className={cx("num")}>{M?.method_version ?? c?.method_version ?? "–"}</dd>
        <dt>{T("g3.m_data")}</dt>
        <dd className={cx("num")}>{M?.data_version ?? "–"}</dd>
        <dt>{T("ui.baseline")}</dt>
        <dd>{T("g3.baseline_fixed", { a: base.from, b: base.to })}</dd>
        <dt>{T("g3.m_rule")}</dt>
        <dd>{r ? `${T("g3.rule", { a: r.above_if_percentile_ge ?? 80, b: r.below_if_percentile_le ?? 20, n: r.uncertain_if_years_lt ?? 10 })}${r.id ? ` (${r.id})` : ""}` : "–"}</dd>
        <dt>{T("g3.m_unit")}</dt>
        <dd>{W("unit.snpp_equiv")}</dd>
        <dt>{T("g3.m_month")}</dt>
        <dd>{T("g3.month_local")}</dd>
      </dl>
      <h4 className={cx("an-mh")}>{T("g3.h_val")}</h4>
      <ValTable x={x} />
      <h4 className={cx("an-mh")}>{T("g3.h_lim")}</h4>
      <ul className={cx("an-lims")}>
        {lims.map((k) => (
          <li key={k}>{W(`lim.${k}`)}</li>
        ))}
      </ul>
      <p className={cx("an-mlinks")}>
        <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">
          NASA FIRMS
        </a>
        <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">
          Natural Earth
        </a>
        <a className={cx("an-pvgo")} href={`/${x.lang}/method/?aoi=${encodeURIComponent(x.aoi)}`} data-tomethod="">
          {T("g5.to_method")}
        </a>
      </p>
    </>
  );
}
