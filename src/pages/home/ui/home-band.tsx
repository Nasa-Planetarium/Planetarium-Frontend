"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { comparisonQuery } from "@/entities/month-value";
import { ApiError } from "@/shared/api";
import { useDevice } from "@/shared/lib/use-device";
import { summaryDayQuery } from "../api/queries";
import { annual, daysIn, FIRST_YEAR, grid, LAST_YEAR, monthEnd, scaleMaxOf, SENSORS, ymKey, type Cell, type Sensor } from "../model/home";
import { AnnualLine, CalendarSvg, DaysSvg } from "./charts";
import { cx } from "./cx";
import type { Ctx } from "./home-page";
import { useSize } from "./use-ui";

const VIEW_KEY: Record<Sensor, string> = { harmonized: "value", modis: "raw_modis", viirs: "raw_viirs" };
const UNIT_KEY: Record<Sensor, string> = { harmonized: "shell.unit.snpp_equiv", modis: "shell.unit.modis_raw", viirs: "shell.unit.viirs_raw" };

/**
 * 관측 활동 캘린더 띠 — 실제 API(/aois/{id}/calendar 2001–2026)를 judgeMonth 로 칸 상태만 갈라 그린다.
 * 요약 줄(가장 많았던 달·해) → 달 일별(/summary freq=day · 그 달 예년 비교 /comparison) 또는 연간 합계.
 */
export function HomeBand(c: Ctx) {
  const dev = useDevice();
  const col = dev === "phone" || dev === "foldable";
  const [bref, bw] = useSize<HTMLDivElement>();
  const [qref, qw] = useSize<HTMLDivElement>();
  const [tab, setTab] = useState<"month" | "year">("month");
  const [focus, setFocus] = useState<{ year: number; month: number } | null>(null);
  const g = useMemo(() => grid(c.months, c.sensor), [c.months, c.sensor]);
  const gH = useMemo(() => grid(c.months, "harmonized"), [c.months]);
  const smax = useMemo(() => scaleMaxOf(g), [g]);
  const ann = useMemo(() => annual(gH), [gH]);
  const topYear = useMemo(() => ann.slice().sort((a, b) => b.total - a.total)[0] ?? null, [ann]);
  const cs = col ? Math.max(c.vals ? 16 : 10, Math.min(18, Math.floor((bw - 32 - 42) / 26) - 2)) : c.vals ? 16 : 11;
  const partial = c.partial;
  const unitShort = c.t({ harmonized: "home.regs.viirs_equivalent_hotspots_month", modis: "home.render_cal.modis_month", viirs: "home.render_cal.viirs_month" }[c.sensor]);
  const nMiss = g.flat().filter((x) => x.st === "missing").length;
  const nSmall = c.sensor !== "viirs" ? g.flat().filter((x) => x.year < 2012 && x.v === 0).length : 0;
  const pop = c.pop;
  const cellTitle = (x: Cell) => {
    const ym = c.fmt.ym(x.year, x.month);
    if (x.st === "out_of_range") return `${ym} · ${c.t("shell.st.out_of_range")}`;
    if (x.st === "before_sensor") return `${ym} · ${c.t("shell.chart.not_operating")}`;
    if (x.v == null) return `${ym} · ${c.t("shell.chart.missing_cell")}`;
    let s = `${ym} · ${c.t(`shell.view.${VIEW_KEY[c.sensor]}`)} ${c.fmt.num(x.v, x.v < 10 && x.v % 1 ? 1 : 0)}`;
    if (c.sensor === "harmonized" && x.ratio != null) s += ` · ${c.t("home.ratio.short", { x: c.fmt.ratio(x.ratio) })}`;
    if (x.st === "partial" && x.row?.as_of_date) s += ` · ${c.t("shell.st.partial")} (${x.row.as_of_date})`;
    if (x.st === "nrt") s += ` · ${c.t("shell.st.nrt")}`;
    return s;
  };
  return (
    <section className={cx("panel hm-band")} aria-label={c.t("home.short_label.detection_calendar")}>
      <div className={cx("hm-band-h")}>
        <div className={cx("hm-band-t")}>
          <h2>
            {c.t("home.short_label.detection_calendar_2")}
            <small className={cx("num")}>{`${FIRST_YEAR}–${LAST_YEAR}`}</small>
          </h2>
          <span className={cx("hm-aoi-tag")} data-caltag="" title={c.dataAoiName}>
            <b>{c.dataAoiName}</b>
          </span>
        </div>
        <div className={cx("hm-band-tools")}>
          <button type="button" className={cx("chip hm-vals")} data-vals="" aria-pressed={c.vals} title={c.t("home.short_label.show_monthly_values_in")} onClick={() => c.setVals(!c.vals)}>
            {c.t("home.short_label.values")}
          </button>
          <div className={cx("utabs hm-sensor")} role="tablist" aria-label={c.t("home.short_label.metric")} data-sensor="">
            {SENSORS.map((s) => (
              <button key={s} type="button" role="tab" data-s={s} aria-selected={c.sensor === s} tabIndex={c.sensor === s ? 0 : -1} title={c.t(UNIT_KEY[s])} onClick={() => c.setSensor(s)}>
                {c.t(`shell.view.${VIEW_KEY[s]}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={cx("hm-band-b")} ref={bref}>
        <div className={cx("hm-calbox")}>
          <div className={cx("hm-cal chart", c.vals && "is-vals")} data-cal="" data-testid="home-cal" data-sensor={c.sensor} data-n={c.months.length} aria-label={c.t("home.short_label.detection_calendar_arrow_keys")}>
            {c.tok && c.months.length ? (
              <CalendarSvg
                g={g}
                cs={cs}
                sensor={c.sensor}
                scaleMax={smax}
                highlight={pop}
                focus={focus ?? pop}
                showValues={c.vals}
                tok={c.tok}
                ramp={c.ramp}
                fmt={c.fmt}
                label={`${c.t("shell.chart.cal")} ${FIRST_YEAR}–${LAST_YEAR} · ${c.t("shell.chart.cal_kb")}`}
                cellTitle={cellTitle}
                onCell={(y, m) => {
                  setFocus({ year: y, month: m });
                  c.setPop({ year: y, month: m });
                  setTab("month");
                }}
                onFocus={(y, m) => setFocus({ year: y, month: m })}
                eraTip={(sat, sensor, start) => `${sat} ${sensor} · ${c.t("shell.eras.start", { d: start.slice(0, 7) })}`}
                eraLabel={c.t("shell.eras.label")}
                maxW={bw ? bw - 32 : undefined}
              />
            ) : (
              <CalState {...c} />
            )}
          </div>
          <div className={cx("hm-cal-lg")} data-callg="">
            <span className={cx("hm-lg-ramp")}>
              <span className={cx("dim")}>{c.t("home.render_cal.low")}</span>
              <span className={cx("hm-lg-sw")} aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} style={{ background: c.tok ? c.ramp(i / 6) : undefined }} />
                ))}
              </span>
              <span className={cx("dim")}>{c.t("home.render_cal.high")}</span>
              <span className={cx("dim")}>
                · <b className={cx("num")}>{c.fmt.num(Math.round(smax))}</b> {unitShort}
                {c.t("home.render_cal.or_more")}
              </span>
            </span>
            <span>
              <i className={cx("hm-lg-zero")} aria-hidden="true" />0 ={c.t("home.render_cal.no_detections")}
            </span>
            {nMiss ? (
              <span>
                <i className={cx("hm-lg-miss")} aria-hidden="true" />
                {c.t("home.render_cal.missing_tap_a_cell")}
              </span>
            ) : null}
            {nSmall ? (
              <span title={c.t("home.render_cal.modis_0_cells_before")}>
                <i className={cx("hm-lg-small")} aria-hidden="true" />
                {c.t("home.render_cal.modis_0_undetermined")}
              </span>
            ) : null}
            {c.sensor === "harmonized" ? (
              <span>
                <i className={cx("hm-lg-dot")} aria-hidden="true" />
                {c.t("home.render_cal.2_same_month_median")}
              </span>
            ) : null}
            {partial ? (
              <span>
                <i className={cx("hm-lg-part")} aria-hidden="true" />
                {c.t("home.render_cal.month_in_progress")}
                {partial.as_of_date ? +partial.as_of_date.slice(8, 10) : ""}
                {c.t("home.render_cal.days")}
              </span>
            ) : null}
            {c.sensor === "viirs" ? (
              <span>
                <i className={cx("hm-lg-none")} aria-hidden="true" />
                {c.t("home.render_cal.not_operating_before_2012")}
              </span>
            ) : null}
          </div>
        </div>
        <div className={cx("hm-qa", qw > 0 && qw < 420 && "is-narrow")} data-qa="" ref={qref}>
          <p className={cx("hm-qtabs hm-qline")} aria-label={c.t("home.short_label.calendar_summary")}>
            <span className={cx("hm-qi")}>
              {c.t("home.short_label.peak_month")}
              <button type="button" className={cx("hm-qt")} data-qt="month" aria-pressed={tab === "month"} onClick={() => setTab("month")}>
                <b className={cx("hm-qans")} data-qans="month">
                  {c.worst ? c.fmt.ym(c.worst.year, c.worst.month) : "–"}
                </b>
              </button>
              <small className={cx("hm-qsub")} data-qsub="month" />
            </span>
            <span className={cx("hm-sep")}> · </span>
            <span className={cx("hm-qi")}>
              {c.t("home.short_label.peak_year")}
              <button type="button" className={cx("hm-qt")} data-qt="year" aria-pressed={tab === "year"} onClick={() => setTab("year")}>
                <b className={cx("hm-qans")} data-qans="year">
                  {topYear ? c.t("home.year", { y: topYear.year }) : "–"}
                </b>
              </button>
              <small className={cx("hm-qsub")} data-qsub="year">
                {topYear ? c.fmt.num(topYear.total) : ""}
              </small>
            </span>
          </p>
          {tab === "month" ? <MonthPane {...c} width={qw} /> : <YearPane {...c} ann={ann} width={qw} top={topYear?.year ?? null} />}
        </div>
      </div>
    </section>
  );
}

function CalState(c: Ctx) {
  const e = c.calError instanceof ApiError ? c.calError : null;
  return <div className={cx("hm-days-miss")} style={{ height: 120 }}>{c.calPending ? "…" : c.t(e?.code === "data_not_loaded" ? "shell.err.data_not_loaded" : e ? "shell.err.request" : "home.render_cal.no_data")}</div>;
}

/** 달 일별 보기(목업 renderMonth) */
function MonthPane(c: Ctx & { width: number }) {
  const pop = c.pop;
  const y = pop?.year ?? LAST_YEAR;
  const m = pop?.month ?? 1;
  const ym = ymKey(y, m);
  const row = c.months.find((r) => r.year === y && r.month === m) ?? null;
  const cmpQ = useQuery(comparisonQuery(c.aoi, ym, pop ? c.mv : null));
  const cmp = cmpQ.data as { baseline_median?: number | null; ratio_to_median?: number | null; n_baseline_years?: number | null; value?: number | null; status?: string } | undefined;
  const end = row?.status === "partial" && row.as_of_date ? row.as_of_date : monthEnd(y, m);
  const sumQ = useQuery(summaryDayQuery(c.aoi, `${ym}-01`, end, pop && row && row.status !== "out_of_range" ? c.mv : null));
  const series = (sumQ.data as unknown as { series?: { date: string; value: number | null }[] } | undefined)?.series ?? [];
  const nd = daysIn(y, m);
  const fires = c.fires.filter((f) => f.detected_at.slice(0, 7) === ym && (!c.region || f.region === c.region));
  const days = Array.from({ length: nd }, (_, i) => {
    const d = `${ym}-${String(i + 1).padStart(2, "0")}`;
    const s = series.find((x) => x.date === d);
    return { day: i + 1, value: s ? s.value : null, fires: fires.filter((f) => f.detected_at.slice(0, 10) === d).map((f) => f.id) };
  });
  const sumErr = sumQ.error instanceof ApiError ? sumQ.error : null;
  const v = row ? (c.sensor === "harmonized" ? row.value : c.sensor === "modis" ? row.raw_modis : row.raw_viirs) : null;
  const med = cmp?.baseline_median ?? null;
  const ratio = cmp?.ratio_to_median ?? row?.ratio_to_median ?? null;
  const atFirst = y === FIRST_YEAR && m === 1;
  const last = c.months.filter((r) => r.value != null || r.status === "partial").at(-1);
  const atLast = !!last && y === last.year && m === last.month;
  const step = (d: number) => {
    let yy = y;
    let mm = m + d;
    if (mm < 1) {
      mm = 12;
      yy--;
    } else if (mm > 12) {
      mm = 1;
      yy++;
    }
    c.setPop({ year: yy, month: mm });
  };
  /* 계절 최다: 달별 중앙값이 가장 큰 달 — 그 달 비교 응답이 아니라 캘린더 행의 ratio 로는 못 고르므로, 끝난 해들의 같은 달 값 중앙값을 본다(표시용 고르기) */
  const peak = useMemo(() => {
    let best = 1;
    let bv = -1;
    for (let mm = 1; mm <= 12; mm++) {
      const xs = c.months
        .filter((r) => r.month === mm && r.year < LAST_YEAR && r.value != null)
        .map((r) => r.value!)
        .sort((a, b) => a - b);
      if (!xs.length) continue;
      const h = (xs.length - 1) / 2;
      const md = (xs[Math.floor(h)]! + xs[Math.ceil(h)]!) / 2;
      if (md > bv) {
        bv = md;
        best = mm;
      }
    }
    return best;
  }, [c.months]);
  const w = Math.max(260, (c.width || 420) - 0);
  const isPart = row?.status === "partial";
  return (
    <div className={cx("hm-qp")} role="region" data-qp="month" data-testid="home-month" data-ym={ym}>
      <div className={cx("hm-mh")}>
        <div className={cx("hm-mh-t")}>
          <button type="button" className={cx("hm-step is-prev")} data-step="-1" aria-label={c.t("home.ym_of.previous_month")} disabled={atFirst} onClick={() => step(-1)}>
            <ChevronRight className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
          </button>
          <h3 className={cx("tn")}>{c.fmt.ym(y, m)}</h3>
          <button type="button" className={cx("hm-step")} data-step="1" aria-label={c.t("home.ym_of.next_month")} disabled={atLast} onClick={() => step(1)}>
            <ChevronRight className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
          </button>
          {isPart ? (
            <span className={cx("hm-tag hm-tag-ref")}>
              {c.t("home.render_month.in_progress")}
              {row?.as_of_date ? +row.as_of_date.slice(8, 10) : ""}
              {c.t("home.render_cal.days")}
            </span>
          ) : null}
        </div>
        <div className={cx("hm-mh-a")}>
          <button
            type="button"
            className={cx("btn sm")}
            data-month=""
            title={c.t("home.render_month.set_the_period_to")}
            onClick={() => {
              const e = monthEnd(y, m);
              c.setRange({ start: `${ym}-01`, end: c.today && e > c.today ? c.today : e });
            }}
          >
            {c.t("home.render_month.show_on_map")}
          </button>
        </div>
      </div>
      <div className={cx("hm-mres")}>
        <span className={cx("hm-mres-v")}>
          <b className={cx("tn")} data-testid="home-month-v">
            {v == null ? c.t("home.val.missing") : c.fmt.num(v, v < 100 && v % 1 ? 1 : 0)}
          </b>
          <span className={cx("muted")}>{c.t(`shell.view.${VIEW_KEY[c.sensor]}`)}</span>
        </span>
        {c.sensor === "harmonized" ? (
          <span className={cx("hm-mres-r")}>
            <b className={cx("tn", ratio != null && (ratio >= 1.5 ? "up" : ratio < 0.9 ? "down" : "muted"))} title={cmp?.n_baseline_years ? `${c.t("home.render_month.baseline")}${cmp.n_baseline_years}${c.t("home.render_month.years")}` : undefined} data-testid="home-month-r">
              {isPart && row?.value != null && row.as_of_date
                ? row.value_projected != null
                  ? c.t("shell.partial.mtd_proj", { date: row.as_of_date ?? "", v: c.fmt.num(row.value, 1), p: c.fmt.num(row.value_projected, 1) })
                  : c.t("shell.partial.mtd", { date: row.as_of_date ?? "", v: c.fmt.num(row.value, 1) })
                : ratio != null && med != null
                  ? c.t("home.ratio.long", { m: c.fmt.num(med, med < 10 ? 1 : 0), x: c.fmt.ratio(ratio) })
                  : ratio != null
                    ? c.t("home.ratio.short", { x: c.fmt.ratio(ratio) })
                    : c.t("home.ratio_text.insufficient_data")}
            </b>
          </span>
        ) : null}
      </div>
      <div className={cx("hm-days chart")} data-days="" aria-label={c.t("home.daily.aria2", { ym: c.fmt.ym(y, m) })}>
        {c.tok && series.length ? (
          <DaysSvg
            days={days}
            width={w}
            height={70}
            median={med != null ? med / nd : null}
            highlight={c.daySel && c.daySel.slice(0, 7) === ym ? +c.daySel.slice(8, 10) : null}
            tok={c.tok}
            ramp={c.ramp}
            fmt={c.fmt}
            label={c.t("shell.chart.daily", { ym: c.fmt.ym(y, m) })}
            dayTitle={(d) => `${c.fmt.md(m, d.day)} · ${c.t("home.daily.pts", { n: d.value == null ? "–" : c.fmt.num(d.value, d.value % 1 ? 1 : 0) })}`}
            fireTitle={(ids) => ids.map((id) => c.tl("fire", id, "name", c.fires.find((f) => f.id === id)?.name ?? id)).join(", ")}
            onDay={(d) => {
              const ds = `${ym}-${String(d).padStart(2, "0")}`;
              c.setDaySel(ds);
              c.setRange({ start: ds, end: ds });
            }}
          />
        ) : (
          <div className={cx("hm-days-miss")} style={{ height: 70 }} data-testid="home-days-state">
            {sumQ.isPending && pop && row ? "…" : v == null ? c.t("home.render_month.missing_month") : c.t(sumErr?.code === "data_not_loaded" ? "shell.err.data_not_loaded" : sumErr ? "shell.err.request" : "home.render_cal.no_data")}
          </div>
        )}
      </div>
      <div className={cx("hm-mf")}>
        <span className={cx("hm-mf-k")}>{c.t("home.render_yo_y.fire_records")}</span>
        {fires.length ? (
          fires.slice(0, 3).map((f) => (
            <button
              key={f.id}
              type="button"
              className={cx("hm-fchip")}
              data-f={f.id}
              title={`${c.tl("fire", f.id, "name", f.name)} · ${f.detected_at}`}
              onClick={() => {
                const d = f.detected_at.slice(0, 10);
                c.setDaySel(d);
                c.setRange({ start: d, end: d });
                c.fly(f.lat, f.lon, 9.6);
              }}
            >
              <span className={cx("lv", `l${f.level}`)}>{c.t(`shell.level.${f.level}`)}</span>
              <span className={cx("hm-fchip-n")}>{c.tl("fire", f.id, "name", f.name)}</span>
              <span className={cx("tn dim")}>{c.t("home.dom", { d: +f.detected_at.slice(8, 10) })}</span>
            </button>
          ))
        ) : (
          <span className={cx("dim")}>{c.t("home.render_month.no_fire_records_this")}</span>
        )}
        <span className={cx("hm-mf-s dim")}>
          {med != null && c.sensor === "harmonized" ? (
            <>
              <i className={cx("hm-avg-sw")} aria-hidden="true" />
              {c.t("home.render_month.same_month_median_daily")}
              <b className={cx("num")}>{c.fmt.num(med / nd, 1)}</b>,{" "}
            </>
          ) : null}
          {c.t("home.render_month.seasonal_peak")}
          <b className={cx("tn")}>{c.fmt.month(peak)}</b>
        </span>
      </div>
    </div>
  );
}

/** 연간 합계(목업 renderAnnual) — 지금 센서 보기 하나만(단위가 다른 선을 한 축에 섞지 않음) */
function YearPane(c: Ctx & { ann: { year: number; total: number }[]; width: number; top: number | null }) {
  const g = useMemo(() => annual(grid(c.months, c.sensor)), [c.months, c.sensor]);
  const top3 = g.slice().sort((a, b) => b.total - a.total).slice(0, 3);
  const color = c.tok ? (c.sensor === "modis" ? c.tok["data-modis"] : c.sensor === "viirs" ? c.tok["data-viirs"] : c.tok["data-harm"]) : "#888";
  const w = Math.max(300, c.width || 420);
  return (
    <div className={cx("hm-qp hm-annual")} role="region" data-qp="year">
      <div className={cx("hm-annual-h")}>
        <span className={cx("hm-annual-top")} data-annualtop="">
          <span className={cx("eyebrow")}>{c.t("home.v.top_annual_totals")}</span>
          {top3.map((r, i) => (
            <span key={r.year} className={cx("hm-top", i === 0 && "is-1")}>
              <b className={cx("num")}>{r.year}</b>
              <span className={cx("num")}>{c.fmt.num(r.total)}</span>
            </span>
          ))}
        </span>
        <span className={cx("hm-annual-s muted")} data-annuals="">
          {c.t(`shell.view.${VIEW_KEY[c.sensor]}`)}
        </span>
      </div>
      <div data-annual="">
        {c.tok ? <AnnualLine pts={g.map((r) => ({ x: r.year, y: r.total }))} width={w} height={130} color={color} tok={c.tok} fmt={c.fmt} label={c.t("home.v.annual_total")} viirsLabel={c.t("home.v.viirs_start")} top={c.top} /> : null}
      </div>
      <p className={cx("hm-annual-note")} data-annualnote="">
        <span>{c.t(UNIT_KEY[c.sensor])}</span>
        <span>{c.dataAoiName}</span>
      </p>
    </div>
  );
}
