"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { useT } from "@/shared/i18n";
import type { Band, CalendarData, CalView, GridRow, MonthCase } from "../model/calendar";
import { FIRST, fmtCell, fmtVal, inRange, LAST, partialOf, vsCls, Y0, Y1, ymIso, ymWord, monthWord } from "../model/calendar";
import { StIcon } from "./bits";
import { CalSvg } from "./cal-svg";
import { cx } from "./cx";
import { exportCalendarPng } from "./png";

/**
 * C 연×월 캘린더 칸(목업 drawGrid · drawPhone · drawLegend · exportPNG).
 * 웹 = 27 연 × 12 달 SVG — g9: 지도 오른쪽 열의 작은 캘린더(칸 10–40px, 폭 맞춤). 칸 22px 미만이면 숫자 없이 색만(값은 칸 제목·선택 달 상세). 터치 기기 = 개관(숫자 없음, 보기만) → 연 고르기 → 12 달 격자(누름 칸 44 이상).
 */
export interface CalGridProps {
  cal: CalendarData;
  aoi: string;
  aoiName: string;
  /** 자료 판(data_version) — PNG 출처 줄 */
  release: string;
  view: CalView;
  grid: { rows: GridRow[]; max: number; p95: number | null };
  bands: Band[];
  y: number;
  m: number;
  only: string | null;
  ramp: (t: number) => string;
  phone: boolean;
  onPick: (y: number, m: number) => void;
}

export function CalGrid(o: CalGridProps) {
  const t = useT();
  const lang = useLocale();
  const W = (k: string, v?: Record<string, string | number>) => t(`shell.${k}`, v);
  const T = (k: string, v?: Record<string, string | number>) => t(`calendar.${k}`, v);
  const rec = useCallback((yy: number, mm: number) => o.cal.months.find((r) => r.year === yy && r.month === mm) ?? null, [o.cal]);
  const stWord = (st: string) => t(`shell.st.${st}`);
  const nf = (x: number | null | undefined) => fmtVal(lang, x);
  const vsWord = (vs: string) => t(`shell.vsrc.${vs}`);
  const partialText = (r: ReturnType<typeof rec>) => partialLine(t, lang, o.view === "value" ? partialOf(r) : null);
  const cellTitle = (yy: number, mm: number) => {
    const r = rec(yy, mm);
    const row = o.grid.rows.find((x) => x.year === yy);
    const c = row?.cs[mm - 1] as MonthCase | undefined;
    if (!r || !inRange(yy, mm) || !c) return `${ymWord(lang, yy, mm)} · ${W("st.out_of_range")}`;
    const bits = [ymWord(lang, yy, mm), c.value == null ? stWord(c.st) : nf(c.value)];
    if (c.value != null) bits.push(c.st === "ok" ? W("st.ok") : stWord(c.st));
    const pt = partialText(r);
    if (pt) bits.push(pt);
    if (o.view === "value" && r.value_source) bits.push(vsWord(r.value_source));
    if (o.view === "value" && r.verdict) bits.push(W(`verdict.${r.verdict}`));
    if (c.io) bits.push(T("flag.interval_out"));
    return bits.join(" · ");
  };
  const bandL = useMemo(() => o.bands.map((b) => ({ ...b, label: `${vsWord(b.vs)} · ${ymIso(b.from[0], b.from[1])} – ${ymIso(b.to[0], b.to[1])}` })), [o.bands, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = o.aoi === "WORLD" && o.view === "value" ? `${T("ui.world_value")} · ${W("unit.snpp_equiv")}` : unitWord(t, o.view);

  /* 웹: 칸 크기 = 폭 맞춤(10–40) — 오른쪽 열 작은 캘린더 */
  const wrap = useRef<HTMLDivElement>(null);
  const [wpx, setW] = useState(900);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, [o.phone]);
  const cs = o.phone ? Math.max(8, Math.floor((wpx - 34 - 8) / (Y1 - Y0 + 1)) - 2) : Math.max(10, Math.min(40, Math.floor((wpx - 34 - 8) / (Y1 - Y0 + 1)) - 2));
  /* 칸 숫자(목업 규칙): 칸에 다 들어가면 전부, 아니면 고른 해 한 열, 칸이 22px 미만이면 숫자 없음 */
  const maxLen = cs >= 36 ? 5 : cs >= 30 ? 4 : cs >= 22 ? 3 : 0;
  const fitAll = maxLen > 0 && o.grid.rows.every((r) => r.cs.every((c) => c.value == null || fmtCell(lang, c.value).length <= maxLen));

  /* PNG */
  const [busy, setBusy] = useState(false);
  const png = async () => {
    setBusy(true);
    try {
      const pr = o.cal.months.find((r) => r.status === "partial");
      const pt = pr ? partialText(pr) : "";
      await exportCalendarPng({
        rows: o.grid.rows,
        ramp: o.ramp,
        scaleMax: o.grid.p95,
        bands: o.bands.map((b) => ({ ...b, label: `${vsWord(b.vs)} ${ymIso(b.from[0], b.from[1])} – ${ymIso(b.to[0], b.to[1])}` })),
        title: T("png.title", { a: o.aoiName, v: t(`shell.view.${o.view}`) }),
        sub: `${ymIso(FIRST[0], FIRST[1])} – ${ymIso(LAST[0], LAST[1])} · ${unitWord(t, o.view)}`,
        low: T("ui.low"),
        high: `${T("ui.high")}${o.grid.p95 ? ` · ${T("ui.p95", { n: nf(o.grid.p95) })}` : ""}`,
        zero: T("ui.zero"),
        missing: W("st.missing"),
        partial: W("st.partial"),
        partialLine: pt && pr ? `${ymIso(pr.year, pr.month)} · ${pt}` : null,
        source: T("png.source", { r: o.release, m: o.cal.method_version }),
        label: `${t(`shell.view.${o.view}`)} · ${T("ui.grid")}`,
        fileName: `emberline_calendar_${o.aoi}_${o.view}_${ymIso(FIRST[0], FIRST[1])}_${ymIso(LAST[0], LAST[1])}.png`,
      });
    } finally {
      setBusy(false);
    }
  };

  const svgProps = {
    rows: o.grid.rows,
    ramp: o.ramp,
    scaleMax: o.grid.p95,
    bands: bandL,
    cellTitle,
    highlight: { y: o.y, m: o.m },
    erasLabel: t("shell.eras.label"),
    eraTip: (sat: string, ym: string) => `${sat} · ${t("shell.eras.start", { d: ym })}`,
  };

  /* 폰: 연 고르기 + 12 달 격자 */
  const row = o.grid.rows.find((r) => r.year === o.y);
  const sMax = o.grid.p95 || 1;
  const canY = (yy: number) => yy >= FIRST[0] && yy <= LAST[0];
  const toYear = (yy: number) => {
    let mm = o.m;
    if (!inRange(yy, mm)) mm = yy === FIRST[0] ? FIRST[1] : LAST[1];
    o.onPick(yy, mm);
  };

  return (
    <section className={cx("panel cl-calp")} aria-labelledby="cl-h-cal">
      <div className={cx("panel-h")}>
        <h2 id="cl-h-cal">{T("ui.grid")}</h2>
        <span className={cx("cl-unit")}>{unit}</span>
        <button type="button" className={cx("btn sm cl-png")} aria-label={T("act.png_l")} disabled={busy} onClick={() => void png()} data-png="">
          <ImageIcon aria-hidden="true" />
          <span>{T("act.png")}</span>
        </button>
      </div>
      <div className={cx("panel-b")}>
        {o.phone ? (
          <>
            <div className={cx("cl-ov chart")} ref={wrap}>
              <CalSvg {...svgProps} cs={cs} yearEvery={4} label={T("ui.overview")} bandText={false} hidden viirsStart="VIIRS" />
            </div>
            <div className={cx("cl-yr")}>
              <button type="button" className={cx("iconbtn")} aria-label={T("act.prev_year")} disabled={!canY(o.y - 1)} onClick={() => toYear(o.y - 1)}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <b className={cx("num")} aria-live="polite">
                {o.y}
              </b>
              <button type="button" className={cx("iconbtn")} aria-label={T("act.next_year")} disabled={!canY(o.y + 1)} onClick={() => toYear(o.y + 1)}>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <div className={cx("cl-m12")} role="group" aria-label={T("ui.months_grid", { y: o.y })}>
              {Array.from({ length: 12 }, (_, k) => {
                const mm = k + 1;
                const c = row?.cs[k];
                if (!c) return null;
                const r = rec(o.y, mm);
                const on = mm === o.m;
                const inR = inRange(o.y, mm);
                const tt = c.value == null || c.value === 0 ? 0 : Math.sqrt(Math.min(1, c.value / sMax));
                const fill = c.value == null ? undefined : c.value === 0 ? "var(--data-zero)" : o.ramp(tt);
                return (
                  <button
                    key={mm}
                    type="button"
                    className={cx("cl-mc", on && "is-sel", c.value != null && c.value > 0 && tt > 0.62 && "is-warm")}
                    data-st={c.st}
                    data-m={mm}
                    disabled={!inR}
                    aria-pressed={on}
                    title={cellTitle(o.y, mm)}
                    style={fill ? ({ ["--cf" as string]: fill } as React.CSSProperties) : undefined}
                    onClick={() => o.onPick(o.y, mm)}
                  >
                    <span className={cx("cl-mn")}>{monthWord(lang, mm)}</span>
                    <b className={cx("num")}>{c.value == null ? (c.st === "out_of_range" ? "" : stWord(c.st)) : fmtCell(lang, c.value)}</b>
                    {c.st !== "ok" && c.st !== "out_of_range" ? <StIcon st={c.st === "before_sensor" ? "out_of_range" : c.st} /> : null}
                    {o.view === "value" && r?.value_source && inR ? <i className={cx("cl-vsb")} data-b={vsCls(r.value_source)} aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className={cx("cal-wrap cl-calw")} ref={wrap}>
            <div className={cx("cl-calsvg chart")}>
              <CalSvg
                {...svgProps}
                cs={cs}
                yearEvery={cs >= 30 ? 1 : cs >= 18 ? 2 : 5}
                bandText={cs >= 18}
                eras
                keyboard
                zeroMark
                only={o.only}
                showValues={!maxLen ? () => false : fitAll ? () => true : (yy) => yy === o.y}
                fmtVal={(v) => fmtCell(lang, v)}
                label={`${t(`shell.view.${o.view}`)} · ${T("ui.grid")}`}
                onPick={(yy, mm) => inRange(yy, mm) && o.onPick(yy, mm)}
              />
            </div>
          </div>
        )}
        <Legend view={o.view} p95={o.grid.p95} bands={o.bands} ramp={o.ramp} />
      </div>
    </section>
  );
}

/** 진행 중 달 한 줄: 추정이 있으면 「…까지 X (이 추세면 한 달 약 Y)」, 없으면 「…까지 X」, 날짜도 없으면 비움 */
export function partialLine(t: (k: string, v?: Record<string, string | number>) => string, lang: string, p: ReturnType<typeof partialOf>) {
  if (!p || !p.date) return "";
  return p.p != null ? t("calendar.ui.partial_line", { d: p.date, v: fmtVal(lang, p.v), p: fmtVal(lang, p.p) }) : t("shell.partial.mtd", { date: p.date, v: fmtVal(lang, p.v) });
}

export function unitWord(t: (k: string) => string, view: CalView) {
  const k: Record<string, string> = { raw_modis: "shell.unit.modis_raw", raw_viirs: "shell.unit.viirs_raw", raw_stitched: "shell.unit.stitched_raw" };
  return t(k[view] ?? "shell.unit.snpp_equiv");
}

/** 범례(HTML): 램프 + 상태 모양 + 값 출처 구간(행에서 잰 경계) */
function Legend({ view, p95, bands, ramp }: { view: CalView; p95: number | null; bands: Band[]; ramp: (t: number) => string }) {
  const t = useT();
  const lang = useLocale();
  const it = (cls: string, label: string) => (
    <span key={cls}>
      <i className={cx("cl-lg", cls)} aria-hidden="true" />
      {label}
    </span>
  );
  return (
    <div className={cx("cl-leg")}>
      <div className={cx("cl-lr")}>
        <span className={cx("cl-ramp")}>
          <em>{t("calendar.ui.low")}</em>
          <span className={cx("cl-rsw")}>
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ background: ramp(i / 6) }} />
            ))}
          </span>
          <em>
            {t("calendar.ui.high")} {p95 ? <span className={cx("num")}>{t("calendar.ui.p95", { n: fmtVal(lang, p95) })}</span> : null}
          </em>
        </span>
      </div>
      <div className={cx("cl-ls")}>
        {it("z", t("calendar.ui.zero"))}
        {it("x", t("shell.st.missing"))}
        {it("p", t("shell.st.partial"))}
        {it("n", t("shell.st.nrt"))}
        {view === "raw_viirs" ? it("o", t("shell.st.before_sensor")) : it("o", t("shell.st.out_of_range"))}
      </div>
      {bands.length ? (
        <div className={cx("cl-vs")} role="list" aria-label={t("calendar.ui.bands")}>
          {bands.map((b) => (
            <span role="listitem" key={`${b.vs}${b.from.join("")}`} data-vs={b.vs}>
              <i className={cx("cl-vsw")} data-b={vsCls(b.vs)} aria-hidden="true" />
              <b>{t(`shell.vsrc.${b.vs}`)}</b>
              <span className={cx("num")}>{`${ymIso(b.from[0], b.from[1])} – ${ymIso(b.to[0], b.to[1])}`}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
