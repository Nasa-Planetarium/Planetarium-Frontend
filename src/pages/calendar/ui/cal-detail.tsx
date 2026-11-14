"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/shared/i18n";
import { useQueryParams } from "@/shared/lib/nav";
import { comparisonQuery } from "../api/queries";
import type { CalendarData, CalView, MonthRow } from "../model/calendar";
import { caseOf, fmtVal, inRange, monthWord, partialOf, Y0, Y1, ymIso } from "../model/calendar";
import { Status, Verdict } from "./bits";
import { partialLine, unitWord } from "./cal-grid";
import { cx } from "./cx";
import { DistChart, type DistItem } from "./dist-chart";

/**
 * D 선택 달 상세(목업 drawDetail · vdLine · drawDist). 값은 /calendar 행 그대로, 판정 기준 연수·같은 달 분포는 /comparison.
 * 진행 중 달: 「…까지 X (이 추세면 한 달 약 Y)」 한 줄 · 백분위·배수는 누계로 계산된 값이라 「–」.
 */
export function CalDetail({ cal, aoi, view, y, m, mv, onPick, touch }: { cal: CalendarData; aoi: string; view: CalView; y: number; m: number; mv: string | null; onPick: (y: number, m: number) => void; touch: boolean }) {
  const t = useT();
  const lang = useLocale();
  const router = useRouter();
  const sp = useQueryParams();
  const W = (k: string, v?: Record<string, string | number>) => t(`shell.${k}`, v);
  const T = (k: string, v?: Record<string, string | number>) => t(`calendar.${k}`, v);
  const nf = (x: number | null | undefined) => fmtVal(lang, x);
  const rec = (yy: number, mm: number): MonthRow | null => cal.months.find((r) => r.year === yy && r.month === mm) ?? null;
  const ym = ymIso(y, m);
  const isWorld = !!cal.local;
  const cmpQ = useQuery(comparisonQuery(aoi, ym, mv, !isWorld && inRange(y, m)));
  const cmp = cmpQ.data ?? null;

  const r = rec(y, m) ?? { year: y, month: m, status: "out_of_range" };
  const c = caseOf(r, view);
  const cv = caseOf(r, "value");
  const cm = caseOf(r, "raw_modis");
  const cr = caseOf(r, "raw_viirs");
  const stWord = (st: string) => t(`shell.st.${st}`);
  const valNode = (k: ReturnType<typeof caseOf>) => (k.value == null ? <span className={cx("cl-na")}>{stWord(k.st)}</span> : <b className={cx("num")}>{nf(k.value)}</b>);
  const ivl =
    cv.value == null ? "–" : cv.io ? <span className={cx("cl-flag")}>{T("flag.interval_out")}</span> : cv.lo != null && cv.hi != null ? (cv.lo === cv.hi ? <span className={cx("cl-na")}>{T("ui.no_interval")}</span> : <span className={cx("num")}>{`${nf(cv.lo)} – ${nf(cv.hi)}`}</span>) : "–";
  const p = view === "value" ? partialOf(r) : null;
  const partLine = partialLine(t, lang, p);
  const kv = (k: string, v: React.ReactNode) => (
    <div key={k}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );

  /* 판정 줄: 값 없는 달·진행 중 달은 백분위·배수를 「–」 */
  const noV = cv.value == null || r.status === "partial";
  const pct = noV ? null : (r.percentile ?? null);
  const rat = noV ? null : (r.ratio_to_median ?? null);

  /* 같은 달 연도별 막대 */
  const lh = (yy: number) => {
    const k = caseOf(rec(yy, m), "value", yy, m);
    return k.lo != null && k.hi != null && k.lo !== k.hi ? { value_lo: k.lo, value_hi: k.hi } : {};
  };
  const dist: DistItem[] = [];
  /* 통합 보기 + 비교 응답: 기준 분포(p25–p75·중앙값). 막대는 baseline[] 이 있으면 그것(실서버), 없으면(목) 같은 기준 기간(2001–2025)의 /calendar 행 */
  const band = view === "value" && !!cmp && cmp.baseline_median != null;
  if (band && cmp?.baseline) {
    cmp.baseline.forEach((b) => {
      if (b.used) dist.push({ year: b.year, value: b.value, state: "baseline", ...lh(b.year) });
      else if (b.status === "missing") dist.push({ year: b.year, value: null, state: "missing" });
    });
    dist.push({ year: y, value: cv.value, state: "evaluated", partial: cv.st === "partial", ...lh(y) });
  } else {
    for (let yy = Y0; yy <= Y1; yy++) {
      if (!inRange(yy, m) || (band && yy !== y && (yy < 2001 || yy > 2025))) continue;
      const rr = rec(yy, m);
      if (!rr) continue;
      const k = caseOf(rr, view);
      if (k.st === "out_of_range" || k.st === "before_sensor") continue;
      dist.push({ year: yy, value: k.value, state: yy === y ? "evaluated" : k.st === "missing" ? "missing" : "baseline", partial: k.st === "partial", ...(view === "value" ? lh(yy) : {}) });
    }
  }
  dist.sort((a, b) => a.year - b.year);

  const host = useRef<HTMLDivElement>(null);
  const [hw, setHw] = useState(420);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHw(el.clientWidth || 420));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toAnalysis = () => {
    const q = new URLSearchParams(sp.toString());
    q.set("step", "2");
    q.set("aoi", aoi);
    q.set("ym", ym);
    if (view === "value") q.delete("view");
    else q.set("view", view);
    q.delete("mode");
    router.push(`/${lang}/analysis/?${q.toString()}`);
  };
  const prevOk = inRange(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
  const nextOk = inRange(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
  const step = (d: number) => {
    let yy = y;
    let mm = m + d;
    if (mm < 1) {
      mm = 12;
      yy--;
    }
    if (mm > 12) {
      mm = 1;
      yy++;
    }
    if (inRange(yy, mm)) onPick(yy, mm);
  };

  return (
    <section className={cx("panel cl-det")} aria-labelledby="cl-h-det">
      <div className={cx("panel-h")}>
        <h2 id="cl-h-det">
          <span className={cx("num")}>{ym}</span>
        </h2>
        <div className={cx("cl-mstep")}>
          <button type="button" className={cx("iconbtn")} aria-label={T("act.prev_month")} disabled={!prevOk} onClick={() => step(-1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className={cx("iconbtn")} aria-label={T("act.next_month")} disabled={!nextOk} onClick={() => step(1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={cx("panel-b")} data-det="">
        <div className={cx("cl-dv")}>
          <span className={cx("cl-dk")}>{t(`shell.view.${view}`)}</span>
          {c.value == null ? <b className={cx("cl-na big")}>{stWord(c.st)}</b> : <b className={cx("num")} data-v="">{nf(c.value)}</b>}
          {c.st !== "ok" && c.value != null ? <Status st={c.st} /> : null}
        </div>
        <p className={cx("cl-du")}>{unitWord(t, view)}</p>
        {partLine ? (
          <p className={cx("cl-part num")} data-part="">
            {partLine}
          </p>
        ) : null}
        <dl className={cx("cl-kv")}>
          {view !== "value" ? kv(t("shell.view.value"), valNode(cv)) : null}
          {kv(T("k.interval"), ivl)}
          {!isWorld && view !== "raw_modis" ? kv(t("shell.view.raw_modis"), valNode(cm)) : null}
          {!isWorld && view !== "raw_viirs" ? kv(t("shell.view.raw_viirs"), valNode(cr)) : null}
          {kv(T("k.source"), r.value_source ? `${t(`shell.vsrc.${r.value_source}`)}${r.data_source ? ` · ${t(`shell.dsrc.${String(r.data_source).toLowerCase()}`)}` : ""}` : "–")}
          {kv(T("k.status"), r.status && r.status !== "out_of_range" ? <Status st={r.status} ok /> : W("st.out_of_range"))}
        </dl>
        <div className={cx("cl-vd")} data-vd="">
          <dl className={cx("cl-kv cl-kv4")}>
            {kv(
              T("k.verdict"),
              r.verdict ? (
                <>
                  <Verdict v={r.verdict} /> {cmp?.low_sample ? <Status st="low_sample" word={false} /> : null}
                </>
              ) : (
                "–"
              ),
            )}
            {kv(T("k.pct"), pct != null ? <b className={cx("num")}>{nf(pct)}</b> : "–")}
            {kv(T("k.ratio"), rat != null ? <b className={cx("num")}>{T("k.ratio_v", { r: nf(rat) })}</b> : "–")}
            {kv(T("k.n"), cmp?.n_baseline_years != null ? <span className={cx("num")}>{T("k.n_v", { n: cmp.n_baseline_years, a: 2001, b: 2025 })}</span> : "–")}
          </dl>
        </div>
        <div className={cx("cl-same")}>
          <h3>
            {T("ui.same")} <span className={cx("num")}>{monthWord(lang, m)}</span>
          </h3>
          <div className={cx("cl-dist chart")} ref={host}>
            {dist.length ? (
              <DistChart
                dist={dist}
                median={band ? (cmp?.baseline_median ?? null) : null}
                bandLo={band ? (cmp?.baseline_p25 ?? null) : null}
                bandHi={band ? (cmp?.baseline_p75 ?? null) : null}
                unit={unitWord(t, view)}
                width={Math.round(Math.max(300, Math.min(560, hw)))}
                height={200}
                label={`${T("ui.same")} · ${monthWord(lang, m)}`}
                whiskerLabel={T("k.interval")}
                onBar={touch ? null : (yy) => inRange(yy, m) && onPick(yy, m)}
              />
            ) : (
              <div className={cx("cl-empty sm")}>–</div>
            )}
          </div>
          {dist.length ? (
            <div className={cx("cl-dleg")}>
              <span>
                <i className={cx("b")} />
                {T("ui.base")}
              </span>
              <span>
                <i className={cx("e")} />
                {T("ui.eval")}
              </span>
              <span>
                <i className={cx("x")} />
                {W("st.missing")}
              </span>
              {band ? (
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
                    {T("k.interval")}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <button type="button" className={cx("btn primary cl-go")} onClick={toAnalysis}>
          {T("act.to_analysis")}
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
