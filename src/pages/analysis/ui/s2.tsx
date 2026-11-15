"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useCountry } from "@/entities/country";
import { useCoarseCells } from "@/entities/world-grid";
import { ApiError, cellsTooMany } from "@/shared/api";
import { API_BASE, DATA_MODE } from "@/shared/config";
import { aoisQuery, cellsQuery, monthPointsQuery, summaryQuery, type CellsData } from "../api/queries";
import {
  TRMAX,
  daysBetween,
  distOf,
  distRaw,
  isoD,
  lastDay,
  monthRec,
  presetStart,
  safeName,
  selectable,
  stepNumbers,
  stepSeries,
  toCSV,
  trDefault,
  trMonths,
  viewCell,
} from "../model/analysis";
import { calInput, cellCase, fmtCompact, inRange, monthWord, VIEWS, ymIso, type CalView } from "../model/core";
import { Status, useRamp } from "./bits";
import { CalSvg } from "./cal-svg";
import { Bars, CellDots, Lines, saveText, svgToPng, type CellDot, type CellPt } from "./charts";
import { useCellLand } from "./cell-land";
import { cx } from "./cx";
import { DistChart } from "./dist-chart";
import { VdMark } from "./vd-mark";
import type { Ctx } from "./types";
import { displayInterval, hasSpread } from "@/shared/lib/interval";

/** 보기 낱말 = 셸 사전 한 곳(shell.view.* — 캘린더 탭과 같은 낱말, 목업 g7 EM.viewWord) */
export const viewWord = (x: Pick<Ctx, "W">, v: CalView) => x.W(`view.${v}`);
/** 캘린더 칸 숫자(목업 EM.fmt.cell): 1,000–9,999 는 정수, 1만 이상만 짧은 표기 */
const cellNum = (lang: string, v: number) => (Math.abs(v) >= 1000 && Math.abs(v) < 10000 ? String(Math.round(v)) : fmtCompact(lang, v));
export const unitOf = (x: Ctx) => (x.view === "raw_stitched" ? x.T("g6.u_raw") : x.W(({ raw_modis: "unit.modis_raw", raw_viirs: "unit.viirs_raw" } as Record<string, string>)[x.view] ?? "unit.snpp_equiv"));
const srcText = (x: Ctx, vs: string | null | undefined, ds: string | null | undefined) => [x.W(`vsrc.${vs || "raw"}`), ds ? x.W(`dsrc.${String(ds).toLowerCase()}`) : ""].filter(Boolean).join(" · ");

/* ═════════ 2 캘린더·비교 ═════════ */
export function S2({ x }: { x: Ctx }) {
  const { T, W, cal, c, view, y, m } = x;
  const touch = x.device !== "web";
  const setView = (v: CalView) => v !== view && x.writeQ({ view: v === "value" ? null : v });
  const pick = (yy: number, mm: number) => selectable(cal, yy, mm) && x.writeQ({ ym: ymIso(yy, mm) });
  const step = (d: number) => {
    let yy = y;
    let mm = m;
    for (let i = 0; i < 400; i++) {
      mm += d;
      if (mm < 1) {
        mm = 12;
        yy--;
      }
      if (mm > 12) {
        mm = 1;
        yy++;
      }
      if (!monthRec(cal, yy, mm)) return;
      if (selectable(cal, yy, mm)) return pick(yy, mm);
    }
  };
  return (
    <div className={cx("an-s2")}>
      <div className={cx("an-bar")}>
        <div className={cx("an-barl")}>
          <div className={cx("seg an-view")} role="group" aria-label={T("ui.display")}>
            {VIEWS.map((v) => (
              <button key={v} type="button" data-view={v} aria-pressed={view === v} onClick={() => setView(v)}>
                {viewWord(x, v)}
              </button>
            ))}
          </div>
          <span className={cx("an-unit")}>{unitOf(x)}</span>
        </div>
        {touch ? (
          <div className={cx("an-mstep")}>
            <button type="button" className={cx("iconbtn")} aria-label={T("g3.prev_month")} onClick={() => step(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <b className={cx("num")}>{ymIso(y, m)}</b>
            <button type="button" className={cx("iconbtn")} aria-label={T("g3.next_month")} onClick={() => step(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {/* QA 2026-11-15: [근거·보고] → [데이터 내보내기] — 누르면 3단계(근거·보고: 인쇄·CSV 내보내기)로 */}
        <button type="button" className={cx("btn primary an-vgo")} data-s3="" onClick={() => x.go(3)}>
          {T("qx.export")}
        </button>
      </div>
      <div className={cx("an-s2out")}>
        {!c || !cal ? (
          <div className={cx("an-empty sm")}>
            <i className={cx("miss-sw big")} />
            <span>{x.errWord ?? W("err.network")}</span>
          </div>
        ) : (
          <>
            {/* 맨 위 줄 = 칸 지도 | 연도×월 캘린더 나란히(QA 2026-11-15: 지도를 먼저, 캘린더를 바로 옆에). 연도별 값은 그 아래 한 줄 전체 */}
            <div className={cx("an-grid an-top")}>
              <div className={cx("an-gl")}>
                <CellPanel x={x} />
              </div>
              <div className={cx("an-gl")}>
                <CalPanel x={x} onPick={pick} />
              </div>
            </div>
            <div className={cx("an-grid an-detrow")}>
              <section className={cx("panel an-det")} aria-busy={x.stale || undefined}>
                <div className={cx("panel-h")}>
                  <h3>
                    {T("ui.yearly")}
                    {monthWord(x.lang, m)}
                    {T("ui.values")}
                  </h3>
                </div>
                <div className={cx("panel-b")}>
                  <div className={cx("an-vline")}>
                    <VerdictLine x={x} />
                  </div>
                  <Detail x={x} onBar={touch ? null : (yy) => pick(yy, m)} />
                  <DistLegend x={x} harm={view === "value"} />
                </div>
              </section>
            </div>
            <Trend x={x} />
            <StepChart x={x} />
            <div className={cx("an-srcfoot")}>
              <p className={cx("an-src1")}>
                <span>
                  NASA FIRMS · <span className={cx("num")}>{c.method_version ?? x.M?.method_version ?? ""}</span> · <span className={cx("num")}>{String(x.M?.data_version ?? "").split("#")[0]}</span>
                </span>
                <button type="button" className={cx("an-pvgo")} data-s3src="" onClick={() => x.go(3)}>
                  {T("g3.method")}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 한 달 한 줄(목업 cellLine) */
export function cellLine(x: Ctx, yy: number, mm: number) {
  const r = monthRec(x.cal, yy, mm);
  const k = viewCell(r, x.view);
  if (!r || !k) return ymIso(yy, mm);
  if (r.status === "partial" && r.value_projected != null && x.view === "value")
    return `${ymIso(yy, mm)} · ${x.T("g6.partial", { d: r.as_of_date ?? "", v: x.nf(r.value), p: x.nf(r.value_projected) })}`;
  const md = r.missing_dates?.length ? x.W("st.missing_days_n", { n: r.missing_dates.length }) : "";
  return [
    ymIso(yy, mm),
    k.value == null ? x.W(`st.${k.status}`) : `${x.nf(k.value)}${k.status !== "ok" ? ` · ${x.W(`st.${k.status}`)}` : ""}`,
    k.value_source || k.data_source ? srcText(x, k.value_source, k.data_source) : "",
    md,
  ]
    .filter(Boolean)
    .join(" · ");
}

function CalPanel({ x, onPick }: { x: Ctx; onPick: (y: number, m: number) => void }) {
  const { T, W, cal, view, y, m } = x;
  const ramp = useRamp();
  const svg = useRef<SVGSVGElement>(null);
  const grid = useMemo(() => calInput(cal, view), [cal, view]);
  const [detSt, setDetSt] = useState<{ k: string; v: [number, number] } | null>(null);
  const det: [number, number] = detSt && detSt.k === ymIso(y, m) ? detSt.v : [y, m];
  const setDet = (v: [number, number]) => setDetSt({ k: ymIso(y, m), v });
  const fitAll = grid.rows.every((r) => r.cs.every((k) => k.value == null || cellNum(x.lang, k.value).length <= 3));
  /* 분석 월(같은 달 줄)만 제 색, 나머지 11개 달은 바탕색 덮개로 낮춘다(값·title·누름은 그대로) — 목업 quietOtherMonths */
  /* 좁은 폭(520px 밑)이면 세로 배치(연도 = 줄) — 목업 CAL_X_MIN */
  const box = useRef<HTMLDivElement>(null);
  const [bw, setBw] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vert = bw > 0 && bw < 520;
  const vcs = vert ? Math.max(14, Math.min(28, Math.floor((bw - 42 - 8) / 12) - 2)) : 22;
  useEffect(() => quietOtherMonths(svg.current, m, vert), [m, grid, ramp, vert]);
  return (
    <section className={cx("panel an-calp")}>
      <div className={cx("panel-h")}>
        <h3>{T("ui.year_month_calendar")}</h3>
        <button type="button" className={cx("btn ghost sm")} data-calpng="" aria-label={T("g6.cal_png_aria")} onClick={() => svg.current && void svgToPng(svg.current, `emberline_calendar_${safeName(x.aoi)}_${view}.png`)}>
          <Download aria-hidden="true" />
          PNG
        </button>
      </div>
      <div className={cx("panel-b")}>
        <div className={cx("an-calbox", vert && "v")} ref={box}>
          <div className={cx("cal-wrap")}>
            <div className={cx("an-calsvg chart")}>
              {ramp ? (
                <CalSvg
                  ref={svg}
                  rows={grid.rows}
                  cs={vcs}
                  vert={vert}
                  ramp={ramp}
                  scaleMax={grid.p95}
                  yearEvery={5}
                  eras={!vert}
                  keyboard
                  zeroMark
                  highlight={{ y, m }}
                  showValues={vert ? (_yy, mm) => mm === m : fitAll ? () => true : (yy) => yy === y}
                  fmtVal={(v) => cellNum(x.lang, v)}
                  cellTitle={(yy, mm) => cellLine(x, yy, mm)}
                  label={`${viewWord(x, view)}${T("ui.calendar")}`}
                  erasLabel={W("eras.label")}
                  eraTip={(sat, ym) => `${sat} · ${W("eras.start", { d: ym })}`}
                  onPick={(yy, mm) => {
                    setDet([yy, mm]);
                    if (inRange(yy, mm)) onPick(yy, mm);
                  }}
                />
              ) : null}
            </div>
          </div>
          <CalLegend x={x} p95={grid.p95} ramp={ramp} />
        </div>
        <p className={cx("an-cdet")} aria-live="polite">
          {cellLine(x, det[0], det[1])}
        </p>
      </div>
    </section>
  );
}

function quietOtherMonths(svg: SVGSVGElement | null, month: number, vert: boolean) {
  if (!svg) return;
  svg.querySelectorAll("[data-an-calq]").forEach((g) => g.remove());
  const cells = Array.from(svg.querySelectorAll<SVGRectElement>("rect[data-m]"));
  if (!cells.length) return;
  const n = (q: Element, k: string) => Number(q.getAttribute(k));
  const x0 = Math.min(...cells.map((c) => n(c, "x")));
  const x1 = Math.max(...cells.map((c) => n(c, "x") + n(c, "width")));
  const y0 = Math.min(...cells.map((c) => n(c, "y")));
  const y1 = Math.max(...cells.map((c) => n(c, "y") + n(c, "height")));
  const NS = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(NS, "g");
  g.setAttribute("data-an-calq", "");
  g.setAttribute("pointer-events", "none");
  g.setAttribute("aria-hidden", "true");
  for (let mm = 1; mm <= 12; mm++) {
    if (mm === month) continue;
    const c = cells.find((q) => Number(q.dataset.m) === mm);
    if (!c) continue;
    const r = document.createElementNS(NS, "rect");
    const at = vert ? [n(c, "x") - 1, y0 - 1, n(c, "width") + 2, y1 - y0 + 2] : [x0 - 1, n(c, "y") - 1, x1 - x0 + 2, n(c, "height") + 2];
    [["x", at[0]], ["y", at[1]], ["width", at[2]], ["height", at[3]], ["fill", "var(--surface-0)"], ["fill-opacity", ".58"]].forEach(([k, v]) => r.setAttribute(String(k), String(v)));
    g.appendChild(r);
  }
  svg.appendChild(g);
}

function CalLegend({ x, p95, ramp }: { x: Ctx; p95: number | null; ramp: ((t: number) => string) | null }) {
  const { T, W } = x;
  const it = (cls: string, w: string) => (
    <span key={cls}>
      <i className={cx("lg", cls)} />
      {w}
    </span>
  );
  return (
    <div className={cx("an-cleg")} aria-label={T("ui.calendar_legend")}>
      <div className={cx("an-clr")}>
        <span className={cx("an-ramp")}>
          <em>{T("ui.low")}</em>
          <span className={cx("an-rsw")}>
            {ramp ? Array.from({ length: 7 }, (_, i) => <i key={i} style={{ background: ramp(i / 6) }} />) : null}
          </span>
          <em>
            {T("ui.high")}
            {p95 != null ? ` (${x.t("shell.chart.more", { n: fmtCompact(x.lang, p95) })})` : ""}
          </em>
        </span>
      </div>
      <div className={cx("an-cls")}>
        {[it("z", T("ui.0_detections")), it("x", W("st.missing")), it("p", W("st.partial")), it("n", W("st.nrt")), it("l", W("st.low_sample")), it("o", W("st.out_of_range")), it("h", T("ui.analysis_month"))]}
      </div>
    </div>
  );
}

/** ③ 비교 한 문장(F10): 「예년 중앙값의 1.7배, 백분위 100 → 많음」 — 숫자는 /compare 그대로 */
const VD_SHORT: Record<string, string> = { above: "g6.vd_above", similar: "g6.vd_similar", below: "g6.vd_below", uncertain: "g6.vd_uncertain" };
export function sentText(x: Ctx) {
  const c = x.c;
  if (!c || c.value == null || c.percentile == null) return "";
  const v = x.T(VD_SHORT[c.verdict ?? "uncertain"] ?? "g6.vd_uncertain");
  return c.ratio_to_median != null ? x.T("g6.sent", { r: c.ratio_to_median.toFixed(1), p: x.nf(c.percentile), v }) : x.T("g6.sent_p", { p: x.nf(c.percentile), v });
}
/** 문장 안 숫자·낱말만 굵게: 사전 문장을 자리표로 나눠 끼운다 */
export function Sentence({ x }: { x: Ctx }) {
  const c = x.c;
  if (!c || c.value == null || c.percentile == null) return null;
  const v = x.T(VD_SHORT[c.verdict ?? "uncertain"] ?? "g6.vd_uncertain");
  const key = c.ratio_to_median != null ? "g6.sent" : "g6.sent_p";
  const raw = x.T(key, { r: "\u0001r\u0001", p: "\u0001p\u0001", v: "\u0001v\u0001" });
  const val: Record<string, string> = { r: c.ratio_to_median?.toFixed(1) ?? "", p: x.nf(c.percentile), v };
  return (
    <p className={cx("an-vsent")}>
      {raw.split("\u0001").map((s, i) => (i % 2 ? <b key={i} className={cx(s !== "v" && "num")}>{val[s]}</b> : s))}
    </p>
  );
}

function VerdictLine({ x }: { x: Ctx }) {
  const { T, c, view, base } = x;
  if (!c) return null;
  const mk = view !== "value" ? viewCell(monthRec(x.cal, x.y, x.m), view) : null;
  const ds = monthRec(x.cal, x.y, x.m)?.data_source ?? null;
  return (
    <>
      <Sentence x={x} />
      <div className={cx("an-vhd")}>
        {c.verdict ? <VdMark v={c.verdict} p={c.percentile ?? null} /> : <Status st={c.status} />}
        {view !== "value" ? <span className={cx("an-vtag")}>{T("g3.harm_basis")}</span> : null}
      </div>
      <div className={cx("an-vbits")}>
        {c.value != null ? (
          <span>
            {view !== "value" ? `${T("g3.k_value_harm")} ` : ""}
            <b className={cx("num")}>{x.nf(c.value)}</b>
            {((iv) => (hasSpread(iv) ? <span className={cx("num")}> {T("g3.range_lohi", { lo: x.nf(iv.lo), hi: x.nf(iv.hi) })}</span> : null))(displayInterval(c.value, c.value_lo, c.value_hi))} <Status st={c.status} />
          </span>
        ) : null}
        {mk ? (
          <span>
            {viewWord(x, view)} <b className={cx("num")}>{mk.value == null ? "–" : x.nf(mk.value)}</b> {mk.status !== "ok" ? <Status st={mk.status} /> : null}
          </span>
        ) : null}
        {c.value != null && c.percentile != null ? (
          <span>
            {T("g3.k_pct")} <b className={cx("num")}>{x.nf(c.percentile)}</b>
          </span>
        ) : null}
        {c.value != null && c.ratio_to_median != null ? <span>{T("g3.median_x", { m: x.nf(c.baseline_median), r: c.ratio_to_median.toFixed(1) })}</span> : null}
        <span className={cx("an-vn")}>{T("g3.base_n", { n: c.n_baseline_years ?? "–", a: base.from, b: base.to })}</span>
      </div>
      {c.value_source ? (
        <p className={cx("an-srcw")}>
          <span className={cx("src-l")}>{srcText(x, c.value_source, ds)}</span>
        </p>
      ) : null}
    </>
  );
}

/** 같은 달 연도별 분포: 보정 지표 = /compare baseline · 원자료 = /calendar 같은 달 */
export function Detail({ x, onBar, light, width }: { x: Ctx; onBar?: ((y: number) => void) | null; light?: boolean; width?: number }) {
  const { T, c, cal, view, y, m } = x;
  const host = useRef<HTMLDivElement>(null);
  const [hw, setHw] = useState(width ?? 520);
  useEffect(() => {
    const el = host.current;
    if (!el || width) return;
    const ro = new ResizeObserver(() => setHw(el.clientWidth || 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  if (!c || !cal) return null;
  const harm = light || view === "value";
  const lh = (yy: number) => {
    const r = monthRec(cal, yy, m);
    const iv = r ? displayInterval(r.value, r.value_lo, r.value_hi) : null;
    return hasSpread(iv) ? { value_lo: iv.lo, value_hi: iv.hi } : {};
  };
  const dist = harm ? distOf(c, y, lh) : distRaw(cal, view, y, m, x.base.to);
  return (
    <div ref={host}>
      {!dist.length ? (
        <div className={cx("an-empty sm")}>
          <i className={cx("miss-sw big")} />
          <span>{T("ui.no_data_to_plot")}</span>
        </div>
      ) : (
        <DistChart
          dist={dist}
          median={harm ? (c.baseline_median ?? null) : null}
          bandLo={harm ? (c.baseline_p25 ?? null) : null}
          bandHi={harm ? (c.baseline_p75 ?? null) : null}
          unit={harm ? x.W("unit.snpp_equiv") : unitOf(x)}
          width={width ?? Math.round(Math.max(340, Math.min(520, hw)))}
          height={light ? 200 : 240}
          label={T(light ? "ui.harmonized_by_year_same_mont" : "ui.same_month_harmonized_distri")}
          whiskerLabel={T("g3.lohi")}
          onBar={onBar}
        />
      )}
    </div>
  );
}

function DistLegend({ x, harm }: { x: Ctx; harm: boolean }) {
  const { T, W } = x;
  return (
    <div className={cx("an-dleg")}>
      <span>
        <i className={cx("b")} />
        {T("ui.baseline_years2")}
      </span>
      <span>
        <i className={cx("e")} />
        {T("ui.analysis_year")}
      </span>
      <span>
        <i className={cx("miss-sw")} />
        {W("st.missing")}
      </span>
      {harm ? (
        <>
          <span>
            <i className={cx("band")} />
            p25–p75
          </span>
          <span>
            <i className={cx("med")} />
            {T("ui.median")}
          </span>
          <span>
            <i className={cx("q")} />
            {T("g3.lohi")}
          </span>
        </>
      ) : null}
    </div>
  );
}

/** 폭 재기(그림 폭 = 칸 폭, 320–1200) */
function useWidth(def = 960) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(def);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || def));
    ro.observe(el);
    return () => ro.disconnect();
  }, [def]);
  return [ref, Math.round(Math.max(320, Math.min(1200, w)))] as const;
}

/* ⑤ 날짜 범위 추이: 일별 = /summary(칸 일 합 · 한국 지역), 월별 = /calendar 값 */
export interface TrState {
  start: string;
  end: string;
  freq: "day" | "month";
}
export function trendRows(x: Ctx, tr: TrState) {
  const ms = trMonths(x.cal, tr.start.slice(0, 7), tr.end.slice(0, 7));
  return ms;
}
export function trendCSVMonth(x: Ctx, tr: TrState) {
  const ms = trendRows(x, tr);
  const mv = x.M?.method_version ?? "";
  const rel = String(x.M?.data_version ?? "");
  const rows: Record<string, unknown>[] = ms.map((r) => ({
    row_type: "month",
    aoi_id: x.aoi,
    date: ymIso(r.year, r.month),
    value: r.value,
    value_projected: r.value_projected ?? r.value,
    as_of_date: r.as_of_date ?? isoD(r.year, r.month, lastDay(r.year, r.month)),
    freq: "month",
    method_version: mv,
    release: rel,
  }));
  rows.push({ row_type: "total", aoi_id: x.aoi, date: `${tr.start.slice(0, 7)}/${tr.end.slice(0, 7)}`, value: Math.round(ms.reduce((s, r) => s + (r.value ?? 0), 0) * 1000) / 1000, freq: "month", method_version: mv, release: rel });
  return toCSV(rows, ["row_type", "aoi_id", "date", "value", "value_projected", "as_of_date", "days_in_range", "days_in_month", "residual_prorated", "freq", "method_version", "release"]);
}
const isKorAoi = (id: string) => /^(KR|SIDO_|SGG_|group:)/.test(id);

function Trend({ x }: { x: Ctx }) {
  const { T, W, y, m } = x;
  const kor = isKorAoi(x.aoi);
  /* 기간은 지역·달이 바뀌면 기본(분석 월 포함 3개월)으로 돌아간다 */
  const trKey = `${x.aoi}|${ymIso(y, m)}`;
  const [trSt, setTrSt] = useState<{ k: string; v: TrState } | null>(null);
  const tr: TrState = trSt && trSt.k === trKey ? trSt.v : { ...trDefault(y, m), freq: kor ? "day" : "month" };
  const setTr = (v: TrState) => setTrSt({ k: trKey, v });
  const tooLong = daysBetween(tr.start, tr.end) > TRMAX;
  const freq = tr.freq === "day" && (tooLong || !kor) ? "month" : tr.freq;
  const lastD = x.cal?.months.find((r) => r.status === "partial")?.as_of_date ?? "2026-11-13";
  const sq = useQuery(summaryQuery(x.aoi, tr.start, tr.end, x.M?.method_version ?? null, freq === "day"));
  const [box, wid] = useWidth();
  const set = (p: Partial<TrState>) => {
    const n = { ...tr, ...p };
    if (n.start > n.end) [n.start, n.end] = [n.end, n.start];
    setTr(n);
  };
  let sum: React.ReactNode = null;
  let chart: React.ReactNode = null;
  let note = "";
  if (freq === "month") {
    const ms = trendRows(x, tr);
    const items = ms.map((r) => ({
      key: ymIso(r.year, r.month),
      label: ms.length <= 14 ? ymIso(r.year, r.month).slice(2) : r.month === 1 ? String(r.year) : "",
      value: r.value ?? null,
      partial: r.status === "partial",
      title: cellLine(x, r.year, r.month),
    }));
    const tot = ms.reduce((s, r) => s + (r.value ?? 0), 0);
    const miss = ms.filter((r) => r.value == null).length;
    const part = ms.find((r) => r.status === "partial");
    sum = (
      <>
        <span className={cx("num")}>
          {tr.start.slice(0, 7)} – {tr.end.slice(0, 7)}
        </span>{" "}
        · {T("g6.tr_nm", { n: ms.length })} · {T("g6.tr_total")} <b className={cx("num")}>{x.nf(tot)}</b>
        {miss ? (
          <>
            {" "}
            · {W("st.missing")} <span className={cx("num")}>{miss}</span>
          </>
        ) : null}
      </>
    );
    note = part && part.value != null ? T("g6.partial", { d: part.as_of_date ?? "", v: x.nf(part.value), p: x.nf(part.value_projected) }) : "";
    chart = ms.length ? <Bars items={items} width={wid} height={200} label={T("g6.tr_title")} /> : <div className={cx("an-empty sm")}><span>{T("ui.no_data_to_plot")}</span></div>;
  } else if (sq.isPending) {
    chart = (
      <div className={cx("an-empty sm")}>
        <span>…</span>
      </div>
    );
  } else if (!sq.data) {
    chart = (
      <div className={cx("an-empty sm")}>
        <i className={cx("miss-sw big")} />
        <span>{T("g6.tr_noday")}</span>
      </div>
    );
  } else {
    const R = sq.data;
    const n = R.series.length;
    const items = R.series.map((d) => ({
      key: d.date,
      label: n <= 31 ? String(+d.date.slice(8, 10)) : d.date.slice(8, 10) === "01" ? (n > 200 ? d.date.slice(2, 7) : `${d.date.slice(5, 7)}/01`) : "",
      value: d.value,
      title: `${d.date} · ${x.nf(d.value)}`,
    }));
    const T0 = R.total ?? null;
    const resid = T0?.residual_included ?? 0;
    /* E1: 일별 합은 칸 일 값의 합 + 월 추정분 포함분(api_contract /summary). 추정분이 있으면 「일별 합 p + 월 추정분 r」로 나눠 보인다(목업 tr_split) */
    const tot = T0?.value ?? R.series.reduce((s, d) => s + (d.value ?? 0), 0) + resid;
    const pts = R.series.reduce((s, d) => s + (d.value ?? 0), 0);
    const mFull = trMonths(x.cal, R.start.slice(0, 7), R.end.slice(0, 7));
    const endOf = (r: (typeof mFull)[number]) => (r.status === "partial" && r.as_of_date ? r.as_of_date : isoD(r.year, r.month, lastDay(r.year, r.month)));
    const whole = mFull.length > 0 && R.start.slice(8) === "01" && endOf(mFull[mFull.length - 1] as (typeof mFull)[number]) <= R.end && mFull.every((r) => r.value != null);
    const amSum = whole ? mFull.reduce((s, r) => s + (r.value ?? 0), 0) : null;
    sum = (
      <>
        <span className={cx("num")}>
          {R.start} – {R.end}
        </span>{" "}
        · {T("g6.tr_nd", { n })} · {T("g6.tr_total_cells")} <b className={cx("num")}>{x.nf(tot)}</b>
        {resid ? (
          <span className={cx("an-trr")} data-tsplit="">
            {" "}
            ({T("g6.tr_split", { p: x.nf(pts), r: x.nf(resid) })}
            {T0?.residual_prorated ? ` · ${T("g6.tr_prorated")}` : ""})
          </span>
        ) : null}
        {amSum != null ? (
          <>
            {" "}
            · {T("g6.tr_total_aoi")} <b className={cx("num")}>{x.nf(amSum)}</b>
          </>
        ) : null}
      </>
    );
    const part = mFull.find((r) => r.status === "partial");
    /* 월 추정분 종류(release residual_type): 2012-01 까지 modis_unseen · 2012-02 부터 missing_day_fill */
    const rn = resid ? [R.start.slice(0, 7) < "2012-02" ? T("g6.tr_rnote") : "", R.end.slice(0, 7) >= "2012-02" ? T("g6.tr_rnote_fill") : ""].filter(Boolean).join(" · ") : "";
    note = [rn, part && part.value != null ? T("g6.partial", { d: part.as_of_date ?? "", v: x.nf(part.value), p: x.nf(part.value_projected) }) : ""].filter(Boolean).join(" · ");
    chart = n ? <Bars items={items} width={wid} height={200} ticks={n <= 31 ? 16 : 12} allLabels={n > 31 && n <= 400} label={T("g6.tr_title")} /> : <div className={cx("an-empty sm")}><span>{T("ui.no_data_to_plot")}</span></div>;
  }
  const csv = () => {
    if (freq === "month") return saveText(`emberline_summary_${safeName(x.aoi)}_${tr.start}_${tr.end}_month.csv`, trendCSVMonth(x, tr));
    if (!sq.data) return;
    const mv = x.M?.method_version ?? "";
    const rel = String(x.M?.data_version ?? "");
    /* 행 종류 day | month_residual | total — 월 추정분은 날짜 행에 섞지 않는다(목업 trendCSV) */
    const R = sq.data;
    const rows: Record<string, unknown>[] = R.series.map((d) => ({ row_type: "day", aoi_id: x.aoi, date: d.date, value: d.value, freq: "day", method_version: mv, release: rel }));
    (R.month_residual ?? []).forEach((q) => {
      if (q.month_residual) rows.push({ row_type: "month_residual", aoi_id: x.aoi, date: ymIso(q.year, q.month), value: q.month_residual, days_in_range: q.included_days ?? "", days_in_month: q.days_in_month ?? "", freq: "day", method_version: mv, release: rel });
    });
    const tv = R.total?.value ?? R.series.reduce((s, d) => s + (d.value ?? 0), 0);
    rows.push({ row_type: "total", aoi_id: x.aoi, date: `${R.start}/${R.end}`, value: Math.round(tv * 1000) / 1000, residual_prorated: R.total?.residual_prorated ?? "", freq: "day", method_version: mv, release: rel });
    saveText(`emberline_summary_${safeName(x.aoi)}_${tr.start}_${tr.end}_day.csv`, toCSV(rows, ["row_type", "aoi_id", "date", "value", "value_projected", "as_of_date", "days_in_range", "days_in_month", "residual_prorated", "freq", "method_version", "release"]));
  };
  return (
    <section className={cx("panel an-trend")} aria-label={T("g6.tr_title")} aria-busy={(freq === "day" && sq.isPlaceholderData) || undefined}>
      <div className={cx("panel-h")}>
        <h3>{T("g6.tr_title")}</h3>
        <div className={cx("seg an-trf")} role="group" aria-label={T("g6.tr_freq")}>
          <button type="button" data-f="day" aria-pressed={freq === "day"} disabled={!kor} onClick={() => set({ freq: "day" })}>
            {T("g6.tr_day")}
          </button>
          <button type="button" data-f="month" aria-pressed={freq === "month"} onClick={() => set({ freq: "month" })}>
            {T("g6.tr_month")}
          </button>
        </div>
      </div>
      <div className={cx("panel-b")}>
        <div className={cx("an-trc")}>
          <label className={cx("an-trl")}>
            <span>{T("g6.tr_start")}</span>
            <input type="date" min="2000-11-01" max={lastD} value={tr.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
          </label>
          <label className={cx("an-trl")}>
            <span>{T("g6.tr_end")}</span>
            <input type="date" min="2000-11-01" max={lastD} value={tr.end} onChange={(e) => e.target.value && set({ end: e.target.value })} />
          </label>
          <div className={cx("seg an-trp")} role="group" aria-label={T("g6.tr_preset")}>
            {[1, 3, 12].map((k) => (
              <button key={k} type="button" data-tp={k} onClick={() => set({ start: presetStart(y, m, k), end: isoD(y, m, lastDay(y, m)) })}>
                {T(`g6.tr_p${k}`)}
              </button>
            ))}
          </div>
          <button type="button" className={cx("btn ghost sm an-trx")} data-tcsv="" onClick={csv}>
            <Download aria-hidden="true" />
            {T("g6.tr_csv")}
          </button>
        </div>
        <p className={cx("an-trs")} aria-live="polite">
          {sum}
        </p>
        <div className={cx("an-trchart chart")} ref={box}>
          {chart}
        </div>
        <p className={cx("an-trn")}>{note}</p>
      </div>
    </section>
  );
}

/* ⑥ 위성 교체 전후 — 원래 감지 수 vs 통합 감지량 */
const COL: Record<CalView, string> = { value: "var(--data-harm)", raw_stitched: "var(--text-1)", raw_modis: "var(--data-modis)", raw_viirs: "var(--data-viirs)" };
function StepChart({ x }: { x: Ctx }) {
  const { T, cal, view } = x;
  const [gran, setGran] = useState<"year" | "month">("year");
  const [box, wid] = useWidth();
  const se = Object.fromEntries(VIEWS.map((v) => [v, stepSeries(cal, gran, v)])) as Record<CalView, ReturnType<typeof stepSeries>>;
  const hasRaw = se.raw_modis.some((p) => p.y != null) || se.raw_viirs.some((p) => p.y != null);
  const st = stepNumbers(cal);
  const series = VIEWS.filter((v) => hasRaw || v === "value").map((v) => ({ name: v, color: COL[v], values: se[v], width: v === view ? 2.6 : 1.2, opacity: v === view ? 1 : 0.38, dash: v === "raw_stitched" ? "5 3" : undefined }));
  const B = (s: string, b = false) => (b ? <b className={cx("num")}>{s}</b> : <span className={cx("num")}>{s}</span>);
  let sumNode: React.ReactNode = hasRaw ? "" : T("g6.st_noraw");
  if (st) {
    const vals: Record<string, React.ReactNode> = { rb: B(x.nf(st.rb)), ra: B(x.nf(st.ra)), rx: B((st.ra / st.rb).toFixed(1), true), vb: B(x.nf(st.vb)), va: B(x.nf(st.va)), vx: B((st.va / st.vb).toFixed(1), true) };
    const raw = T("g6.st_sum", Object.fromEntries(Object.keys(vals).map((k) => [k, `\u0001${k}\u0001`])));
    sumNode = raw.split("\u0001").map((s, i) => (i % 2 ? <span key={i}>{vals[s]}</span> : s));
  }
  return (
    <section className={cx("panel an-stepp")} aria-label={T("g6.st_title")}>
      <div className={cx("panel-h")}>
        <h3>{T("g6.st_title")}</h3>
        <div className={cx("seg an-stg")} role="group" aria-label={T("g6.st_gran")}>
          <button type="button" data-g="year" aria-pressed={gran === "year"} onClick={() => setGran("year")}>
            {T("g6.st_year")}
          </button>
          <button type="button" data-g="month" aria-pressed={gran === "month"} onClick={() => setGran("month")}>
            {T("g6.st_month")}
          </button>
        </div>
      </div>
      <div className={cx("panel-b")}>
        <p className={cx("an-sts")}>{sumNode}</p>
        <ul className={cx("an-stlg")} aria-label={T("g6.st_lg")}>
          {series.map((s) => (
            <li key={s.name} data-on={s.name === view ? "1" : "0"}>
              <svg width="22" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="21" y2="4" stroke={s.color} strokeWidth={s.name === view ? 2.6 : 1.6} strokeDasharray={s.dash} />
              </svg>
              {T(`g6.st_lg_${s.name}`)}
            </li>
          ))}
        </ul>
        <div className={cx("an-schart chart")} ref={box}>
          <Lines series={series} width={wid} height={240} label={`${T("g6.st_title")} · ${viewWord(x, view)}`} marker={{ x: 2012 + 1 / 12, label: T("g6.st_mark") }} />
        </div>
      </div>
    </section>
  );
}

/* 칸 지도(F9 점(원)): /cells 칸 중심 원. 칸 1만 개를 넘는 범위(대륙·큰 나라 — 실서버 400 range_too_large)는 정적 world-1deg 의 1° 묶음으로(목업 hCells 나라 몫).
   목(MSW)은 503 data_not_loaded → 「자료 준비 중」, 그 밖 오류는 통신 오류 낱말 */
function CellPanel({ x }: { x: Ctx }) {
  const { T, W, view, y, m } = x;
  const ramp = useRamp();
  const ym = ymIso(y, m);
  const mv = x.M?.method_version ?? null;
  /* 칸 1만 개를 넘는 지역(/aois n_cells · level)은 /cells 를 보내지 않고 바로 1° 묶음으로 — 보냈다 400 을 받으면 콘솔 오류가 남았다(2026-11-15 운영 USA·BRA).
     목록을 받기 전에는 /cells 를 미룬다. 목록에 없거나 값이 빈 지역은 전처럼 보내 보고 400 이면 넘어간다(안전망) */
  const aq = useQuery(aoisQuery(mv));
  const cellsWide = cellsTooMany((aq.data ?? []).find((a) => a.aoi_id === x.aoi));
  const q0 = useQuery(cellsQuery(x.aoi, ym, mv, !aq.isPending && !cellsWide));
  /* 넓은 범위(400 range_too_large → 1° 묶음) 판정은 지역마다 하나 — 달이 바뀌어 새 응답을 기다리는 동안 앞 판정을 그대로 써서
     「…」 빈 판으로 갔다 오지 않게(2026-11-15 깜빡임). 응답이 오면(성공·오류) 그 판정으로 바꾼다 */
  const wideNow = cellsWide || (q0.error instanceof ApiError && q0.error.code === "range_too_large");
  const settled = cellsWide || ((q0.isError || q0.isSuccess) && !q0.isPlaceholderData);
  const [wideSt, setWideSt] = useState<{ a: string; w: boolean } | null>(null);
  if (settled && (wideSt?.a !== x.aoi || wideSt.w !== wideNow)) setWideSt({ a: x.aoi, w: wideNow });
  const wide = settled ? wideNow : wideSt?.a === x.aoi ? wideSt.w : false;
  const co = useCoarseCells({ aoiId: x.aoi, aois: aq.data, y, m, on: wide });
  const q: { data: CellsData | undefined; error: unknown; isPending: boolean } = wide ? { data: (co.data ?? undefined) as CellsData | undefined, error: co.isError ? (q0.error ?? new ApiError(400, "range_too_large", null)) : null, isPending: co.isPending } : q0;
  const [box, wid] = useWidth(640);
  /* 바탕 땅(나라 1급 · 세계 윤곽) — 고른 지역 1급(시군구면 부모 1급) 테두리 강조 */
  const { list: countries } = useCountry();
  const parent = x.rec?.parent_id ? ((aq.data ?? []).find((a) => a.aoi_id === x.rec?.parent_id) ?? null) : null;
  const base = useCellLand({ aoi: x.aoi, rec: x.rec, parent, countries });
  /* 점 층(목업 ptsMode): 실서버 = FIRMS 최근 24시간(WMS 그림) · 목 = 그 달 release 감지 점(/hotspots) — 둘 다 한국 지역만 */
  const pm = isKorAoi(x.aoi) ? (DATA_MODE === "http" ? "firms" : "month") : null;
  const [lyrOn, setLyrOn] = useState(false);
  const on = !!pm && lyrOn;
  const hq = useQuery(monthPointsQuery(x.aoi, ym, mv, on && pm === "month"));
  const points: CellPt[] = on && pm === "month" ? (hq.data ?? []).map((p) => ({ lon: p.lon, lat: p.lat, title: `${p.t.replace("T", " ").replace(/Z$/, "")} UTC · FRP ${p.frp == null ? "–" : x.nf(p.frp)} MW · ${p.sat}` })) : [];
  const WMS_BB: [number, number, number, number] = [127.8, 35.9, 129.6, 37.2];
  const image = on && pm === "firms" ? { href: `${API_BASE}/firms/wms-tiles?layer=viirs_noaa20_24h&bbox=${WMS_BB.join(",")}&width=640&height=470`, bbox: WMS_BB } : null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const cells: CellDot[] = [];
  let noField = false;
  (q.data?.features ?? []).forEach((f) => {
    const p = f.properties;
    const k = cellCase(p, view, y, m);
    let lat = p.cell_lat;
    let lon = p.cell_lon;
    if ((lat == null || lon == null) && f.geometry?.coordinates?.[0]) {
      const ring = f.geometry.coordinates[0];
      lat = ring.reduce((s, c) => s + (c[1] ?? 0), 0) / ring.length;
      lon = ring.reduce((s, c) => s + (c[0] ?? 0), 0) / ring.length;
    }
    if (k.value == null || k.value <= 0 || lat == null || lon == null) return;
    cells.push({ lat, lon, value: k.value, title: `${x.nf(k.value)}${p.status && p.status !== "ok" ? ` · ${W(`st.${p.status}`)}` : ""}${view === "value" && p.value_source ? ` · ${W(`vsrc.${p.value_source}`)}` : ""}` });
  });
  if (q.data?.features.length && !cells.length && view !== "value") noField = q.data.features.every((f) => (view === "raw_modis" ? f.properties.raw_modis : f.properties.raw_viirs) == null);
  const st = q.data?.properties?.month_status ?? (q.data ? "ok" : "out_of_range");
  const vmax = Math.max(1, ...cells.map((c) => c.value));
  const err = q.error ? W(q.error instanceof ApiError && (q.error.code === "data_not_loaded" || q.error.code === "rate_limited") ? `err.${q.error.code}` : "err.network") : null;
  return (
    <section className={cx("panel an-cellp")} aria-busy={(wide ? false : q0.isPlaceholderData) || undefined}>
      <div className={cx("panel-h")}>
        <h3>
          {T("g3.cell_map")} <span className={cx("num")}>{ym}</span>
        </h3>
        {pm ? (
          <button type="button" className={cx("an-lyr")} data-lyr={pm} aria-pressed={lyrOn} onClick={() => setLyrOn((v) => !v)}>
            {/* 목업 아이콘 「pass」(위성 통과 호) */}
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 20A14 14 0 0 1 15 6.2" />
              <path d="M19 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
              <path d="M3 20h4" />
            </svg>
            <span>{T(pm === "month" ? "g6.pts_layer" : "g3.firms_layer")}</span>
          </button>
        ) : null}
      </div>
      <div className={cx("panel-b an-cellb")}>
        <div className={cx("an-cellsvg")} ref={box}>
          {ramp && cells.length ? (
            <CellDots
              cells={cells}
              ramp={ramp}
              scaleMax={vmax}
              width={Math.min(wid, 640)}
              maxH={x.device === "phone" ? 420 : 520}
              cellDeg={q.data?.properties?.cell_size_deg ?? 0.1}
              land={base.land}
              c0={base.c0}
              label={`${T("g3.cell_map")} ${ym}`}
              points={points}
              image={image}
            />
          ) : (
            <div className={cx("an-empty sm")}>
              <i className={cx("miss-sw big")} />
              <span>{err ?? (q.isPending ? "…" : T("ui.no_data_to_plot"))}</span>
            </div>
          )}
        </div>
        <div className={cx("an-cleg")}>
          <div className={cx("an-clr")}>
            <span className={cx("an-ramp")}>
              <em>{T("ui.low")}</em>
              <span className={cx("an-rsw")}>{ramp ? Array.from({ length: 7 }, (_, i) => <i key={i} style={{ background: ramp(i / 6) }} />) : null}</span>
              <em>{T("ui.high")}</em>
            </span>
            <span className={cx("an-cmeta")}>
              {noField ? T("g6.no_field") : (
                <>
                  <span className={cx("num")}>{cells.length}</span> {T("g3.cells_n")}
                </>
              )}{" "}
              · {q.data?.properties?.cell_size_deg ?? 0.1}°
            </span>
            {st !== "ok" && q.data ? <Status st={st} /> : null}
            {on && pm === "firms" ? (
              <span className={cx("an-cmeta")} data-lyrmeta="firms">
                <i className={cx("an-pt")} aria-hidden="true" />
                {T("g3.firms_layer")} <span className={cx("an-firmsd")}>{T("g3.firms_24h", { d: today })}</span>
              </span>
            ) : null}
            {on && pm === "month" ? (
              <span className={cx("an-cmeta")} data-lyrmeta="month">
                <i className={cx("an-pt")} aria-hidden="true" />
                {T("g6.pts_layer")} {hq.data ? <span className={cx("num")}>{x.nf(hq.data.length)}</span> : hq.isError ? W("err.data_not_loaded") : "…"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
