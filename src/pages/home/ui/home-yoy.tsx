"use client";

import { useQuery } from "@tanstack/react-query";
import type { Bbox } from "@/features/pick-aoi";
import type { Fire } from "@/shared/agency";
import { ApiError } from "@/shared/api";
import { hotspotsQuery, summaryDayQuery } from "../api/queries";
import { dayCount, FIRST_DAY, niceMax, yoyMetric } from "../model/home";
import { cx } from "./cx";
import type { Ctx } from "./home-page";

type Sum = { series?: { date: string; value: number | null }[]; total?: { value?: number | null; n_missing?: number } };
type Metric = ReturnType<typeof yoyMetric>;
const MINUS = "−";
const r20 = (b: Bbox) => b.map((v) => Math.round(v * 20) / 20) as unknown as Bbox;
/** 실서버 무거운 경로 한도(429 rate_limited · 10초 뒤 다시) — 두 번까지 기다려 다시 받는다 */
export const RETRY_429 = { retry: (n: number, e: unknown) => e instanceof ApiError && e.status === 429 && n < 2, retryDelay: 10500 } as const;

/** 한 기간의 일별 합(API 그대로) → 지표 몫: 합계 = total.value(결측 날이 있으면 없음) · 평균 = 합계 / 값 있는 날 · 가장 많은 날 · 관측 있는 날 */
function side(d: Sum | undefined) {
  if (!d?.series) return null;
  const xs = d.series.filter((x): x is { date: string; value: number } => x.value != null);
  const tot = d.total?.n_missing ? null : (d.total?.value ?? null);
  let peak: { date: string; value: number } | null = null;
  for (const x of xs) if (!peak || x.value > peak.value) peak = x;
  return { series: d.series, tot, mean: tot != null && xs.length ? Math.round((tot / xs.length) * 10) / 10 : null, peak, active: tot != null ? xs.filter((x) => x.value > 0).length : null };
}

/**
 * 전년 대비 지표 넷(목업 renderYoY) — 값은 API 그대로:
 *  통합 합계·하루 평균·가장 많은 날·관측 있는 날 = /aois/{id}/summary?freq=day 의 total·series(올해 기간 · 1년 전 같은 날짜) ·
 *  원시 VIIRS·MODIS = /hotspots 점 수(지역 상자 · 센서별, 더하지 않음 · 31일·100 제곱도 안) · 산불 기록 = 기관 원장(한국 시나리오).
 * 1년 전이 2001-01-01 앞이면 「비교 불가 · 1년 전이 자료 기간(2001-01-01~) 밖」.
 */
export function YoyKpis(c: Ctx & { curr: { start: string; end: string }; prev: { start: string; end: string }; width: number }) {
  const prevOk = c.prev.start >= FIRST_DAY;
  const cq = useQuery({ ...summaryDayQuery(c.aoi, c.curr.start, c.curr.end, c.mv), ...RETRY_429 });
  const pq = useQuery({ ...summaryDayQuery(c.aoi, c.prev.start, c.prev.end, prevOk ? c.mv : null), ...RETRY_429 });
  const info = c.info as { bbox_main?: Bbox; bbox?: Bbox } | undefined;
  const box = c.aoiBbox ?? info?.bbox_main ?? info?.bbox ?? null;
  const days = dayCount(c.curr.start, c.curr.end);
  const rawOk = !!box && Math.abs((box[2] - box[0]) * (box[3] - box[1])) <= 100 && days <= 31;
  const hb: Bbox = box ? r20(box) : [0, 0, 0, 0];
  const hc = useQuery({ ...hotspotsQuery(hb, c.curr.start, c.curr.end, c.mv), ...RETRY_429, enabled: rawOk && !!c.mv });
  const hp = useQuery({ ...hotspotsQuery(hb, c.prev.start, c.prev.end, c.mv), ...RETRY_429, enabled: rawOk && prevOk && !!c.mv });
  /* 점을 못 받으면(503 자료 준비 중·429·그 밖) 결측이 아니라 그 까닭을 쓴다 · 범위가 31일·100 제곱도를 넘으면 「확대」 안내 */
  const hErr = [hc.error, hp.error].find((e) => e instanceof ApiError) as ApiError | undefined;
  const rawWhy = !rawOk ? c.t("maplab.zoom_for_points") : hErr ? c.t(hErr.code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.request") : null;
  const C = side(cq.data as Sum | undefined);
  const P = prevOk ? side(pq.data as Sum | undefined) : null;
  const cnt = (d: unknown) => {
    const hs = (d as { hotspots?: { instrument?: string }[] } | undefined)?.hotspots;
    if (!hs) return null;
    const v = hs.filter((h) => (h.instrument ?? "VIIRS") !== "MODIS").length;
    return { v, m: hs.length - v };
  };
  const rc = rawOk ? cnt(hc.data) : null;
  const rp = rawOk && prevOk ? cnt(hp.data) : null;
  const inR = (f: Fire, r: { start: string; end: string }) => {
    const d = f.detected_at.slice(0, 10);
    return d >= r.start && d <= r.end && (!c.region || f.region === c.region);
  };
  const fc = c.kor ? c.fires.filter((f) => inR(f, c.curr)).length : null;
  const fp = c.kor && prevOk ? c.fires.filter((f) => inR(f, c.prev)).length : null;
  const OUT_WHY = c.t("data.yoy.out_why", { d: FIRST_DAY });
  const why = (m: Metric, raw?: boolean) => (!prevOk ? OUT_WHY : raw && rawWhy ? rawWhy : m.curr == null ? c.t("data.yoy.why.missing") : c.t("data.yoy.why.missing_prev"));
  const n = (v: number | null | undefined, d = 0) => (v == null ? "–" : c.fmt.num(v, d));
  const dg = (v: number | null | undefined) => (v != null && Math.abs(v) < 100 && v % 1 ? 1 : 0);
  const yv = (v: number | null | undefined, d = 0) => (v == null ? <span className={cx("hm-miss-v")}>–</span> : c.fmt.num(v, d));
  const sgn = (v: number, d = 0) => (v > 0 ? "+" : v < 0 ? MINUS : "±") + c.fmt.num(Math.abs(v), d);
  const delta = (m: Metric, d = 0, raw?: boolean) => {
    if (m.na) {
      const w = why(m, raw);
      return (
        <>
          <span className={cx("hm-yd hm-yd-na")} title={w}>
            {c.t("home.yoy_delta.not_comparable")}
          </span>
          <span className={cx("hm-yd-why")}>{w.split(" · ")[0]}</span>
        </>
      );
    }
    const cls = m.delta! > 0 ? "up" : m.delta! < 0 ? "down" : "muted";
    return (
      <>
        <b className={cx("num", cls)}>{sgn(m.delta!, d)}</b>
        {m.zero ? (
          <span className={cx("hm-yd hm-yd-z")} title={c.t("home.yoy_delta.last_year_was_0")}>
            {c.t("home.yoy_delta.last_year_0")}
          </span>
        ) : (
          <span className={cx("num", cls)}>{`${m.pct! > 0 ? "+" : m.pct! < 0 ? MINUS : "±"}${c.fmt.num(Math.abs(m.pct!), 1)}%`}</span>
        )}
      </>
    );
  };
  const yprev = (m: Metric, d = 0) => (
    <span className={cx("hm-yprev")}>
      {c.t("home.yoy_prev.last_year")}
      <b className={cx("num")}>{n(m.prev, d)}</b>
    </span>
  );
  const H = yoyMetric(C?.tot ?? null, P?.tot ?? null);
  const MEAN = yoyMetric(C?.mean ?? null, P?.mean ?? null);
  const V = yoyMetric(rc?.v ?? null, rp?.v ?? null);
  const M = yoyMetric(rc?.m ?? null, rp?.m ?? null);
  const FR = yoyMetric(fc, fp);
  const live = c.curr.end === c.today;
  const cw = Math.max(240, (c.width || 368) - 32);
  return (
    <>
      <div className={cx("hm-kpi hm-yk")} data-yk="harmonized" data-v={C?.tot ?? ""} data-p={P?.tot ?? ""}>
        <div className={cx("hm-kpi-k")}>
          {c.t("home.render_yo_y.harmonized_total")}
          {live ? <span className={cx("hm-badge hm-badge-part")}> {c.t("home.render_yo_y.to_date")}</span> : null}
        </div>
        <div className={cx("hm-kpi-v num")}>
          {cq.isPending && c.mv ? "–" : yv(C?.tot, dg(C?.tot))}
          <small>{c.t("home.val.viirs_eq")}</small>
        </div>
        <div className={cx("hm-yrow")}>
          {yprev(H, dg(H.prev))}
          {delta(H, 1)}
        </div>
        <div className={cx("hm-ysub")} title={c.t("data.yoy.active_days.label")}>
          {c.t("home.render_yo_y.days_with_detections")}
          <b className={cx("num")}>{n(C?.active)}</b>/{days}
          {c.t("home.render_yo_y.days_last_year_2")}
          <b className={cx("num")}>{n(P?.active)}</b>
        </div>
      </div>
      <div className={cx("hm-kpi hm-yk hm-yk-raw")} data-yk="raw">
        <div className={cx("hm-kpi-k")}>
          {c.t("home.render_yo_y.raw_detections")}
          <span className={cx("hm-badge")}>{c.t("home.render_yo_y.by_sensor")}</span>
        </div>
        {(
          [
            [V, "VIIRS", "v"],
            [M, "MODIS", "m"],
          ] as const
        ).map(([m, k, s]) => (
          <div key={k} className={cx("hm-yraw")}>
            <span className={cx("hm-yraw-k")}>
              <i className={cx("hm-sn", `hm-sn-${s}`)} aria-hidden="true" />
              {k}
            </span>
            <b className={cx("num")}>{yv(m.curr)}</b>
            <span className={cx("hm-yrow")}>
              {yprev(m)}
              {delta(m, 0, true)}
            </span>
          </div>
        ))}
      </div>
      <div className={cx("hm-kpi hm-yk")} data-yk="mean">
        <div className={cx("hm-kpi-k")}>
          {c.t("home.render_yo_y.daily_mean")}
          <span className={cx("dim")}>{c.t("home.render_yo_y.harmonized")}</span>
        </div>
        <div className={cx("hm-kpi-v num")}>
          {yv(C?.mean, 1)}
          <small>{c.t("home.render_yo_y.day")}</small>
        </div>
        <div className={cx("hm-yrow")}>
          {yprev(MEAN, 1)}
          {delta(MEAN, 1)}
        </div>
        <div className={cx("hm-ysub")} title={c.t("data.yoy.peak_day.label")}>
          {c.t("home.render_yo_y.peak_day")}
          <b className={cx("num")}>{n(C?.peak?.value, dg(C?.peak?.value))}</b>
          {C?.peak ? ` (${C.peak.date.slice(5).replace("-", ".")})` : ""}
          {c.t("home.render_yo_y.last_year")}
          <b className={cx("num")}>{n(P?.peak?.value, dg(P?.peak?.value))}</b>
        </div>
      </div>
      <div className={cx("hm-kpi hm-yk")} data-yk="fire_records">
        <div className={cx("hm-kpi-k")}>{c.t("home.render_yo_y.fire_records")}</div>
        <div className={cx("hm-kpi-v num")}>
          {FR.curr == null ? (
            <span className={cx("hm-miss-v")}>{c.t("home.render_yo_y.outside_coverage")}</span>
          ) : (
            <>
              {c.fmt.num(FR.curr)}
              <small>{c.t("home.svc_val.x_2")}</small>
            </>
          )}
        </div>
        {FR.curr == null ? null : (
          <div className={cx("hm-yrow")}>
            {yprev(FR)}
            {delta(FR)}
          </div>
        )}
      </div>
      <div className={cx("hm-ych")} data-ych="">
        <div className={cx("hm-ych-h")}>
          <span className={cx("hm-ych-k")}>{c.t("home.render_yo_y.daily_harmonized")}</span>
          <span className={cx("hm-ych-lg")}>
            <span title={`${c.curr.start} – ${c.curr.end}`}>
              <i className={cx("hm-ylg hm-ylg-c")} aria-hidden="true" />
              {c.t("home.render_yo_y.this_period")}
            </span>
            <span title={`${c.prev.start} – ${c.prev.end}`}>
              <i className={cx("hm-ylg hm-ylg-p")} aria-hidden="true" />
              {c.t("home.render_yo_y.same_period_last_year")}
            </span>
          </span>
        </div>
        <div className={cx("hm-ych-b")} data-ychb="">
          {c.tok && C ? <YoyChart c={c} curr={C.series} prev={P?.series ?? []} W={cw} H={Math.round(Math.max(44, Math.min(96, cw * 0.075)))} range={c.curr} ct={H.curr} ptot={H.prev} /> : null}
        </div>
      </div>
    </>
  );
}

/** 일별 선(목업 yoyChart): 올해 기간(실선·통합 색) + 전년 같은 기간(점선·회색). 같은 순번끼리 · 120일 넘으면 묶어 합친다 */
function YoyChart(p: { c: Ctx; curr: { date: string; value: number | null }[]; prev: { date: string; value: number | null }[]; W: number; H: number; range: { start: string; end: string }; ct: number | null; ptot: number | null }) {
  const { c, curr, prev, W, H, range } = p;
  const C = c.tok!;
  const k = curr.length > 120 ? Math.ceil(curr.length / 120) : 1;
  const bucket = (a: (number | null)[]) => {
    if (k === 1) return a;
    const out: (number | null)[] = [];
    for (let i = 0; i < a.length; i += k) {
      const sl = a.slice(i, i + k);
      out.push(sl.some((v) => v == null) ? null : sl.reduce<number>((s, v) => s + (v ?? 0), 0));
    }
    return out;
  };
  const cv = bucket(curr.map((d) => d.value));
  const pv = bucket(prev.map((d) => d.value));
  const n = Math.max(cv.length, pv.length);
  const pl = 26;
  const pr = 4;
  const pt = 6;
  const pb = 14;
  const mx = niceMax(Math.max(4, ...[...cv, ...pv].filter((v): v is number => v != null)));
  const X = (i: number) => (n <= 1 ? pl + (W - pl - pr) / 2 : pl + (i / (n - 1)) * (W - pl - pr));
  const Y = (v: number) => pt + (1 - v / mx) * (H - pt - pb);
  const path = (a: (number | null)[]) => {
    let d = "";
    let pen = false;
    a.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const ds = (d: string, yr: boolean) => (yr ? `${d.slice(2, 4)}.` : "") + d.slice(5).replace("-", ".");
  const miss = c.t("home.val.missing");
  const nf = (v: number | null | undefined) => (v == null ? miss : c.fmt.num(v, v % 1 ? 1 : 0));
  const pc = path(cv);
  const cw = n > 1 ? (W - pl - pr) / (n - 1) : 0;
  const mono = { fontFamily: "var(--font-data)", fontSize: 11 } as const;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={c.t("home.path.daily_harmonized_this_period") + nf(p.ct) + c.t("home.path.same_period_last_year") + nf(p.ptot)}>
      {[0, mx / 2, mx].map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? C["line-strong"] : C["line-soft"]} />
          <text x={pl - 4} y={Y(v) + 3} textAnchor="end" fill={C["text-3"]} style={mono}>
            {c.fmt.num(v, v % 1 ? 1 : 0)}
          </text>
        </g>
      ))}
      {n <= 1 ? (
        <>
          {pv[0] != null ? <circle cx={X(0)} cy={Y(pv[0])} r={3} fill="none" stroke={C["text-2"]} strokeDasharray="2 1.5" /> : null}
          {cv[0] != null ? <circle cx={X(0)} cy={Y(cv[0])} r={3.5} fill={C["data-harm"]} /> : null}
        </>
      ) : (
        <>
          {pc && !cv.some((v) => v == null) ? <path d={`${pc}L${X(cv.length - 1).toFixed(1)} ${Y(0).toFixed(1)}L${X(0).toFixed(1)} ${Y(0).toFixed(1)}Z`} fill={C["data-harm"]} fillOpacity={0.12} /> : null}
          <path d={path(pv)} fill="none" stroke={C["text-2"]} strokeWidth={1.4} strokeDasharray="4 3" strokeLinejoin="round" data-prev="" />
          <path d={pc} fill="none" stroke={C["data-harm"]} strokeWidth={1.8} strokeLinejoin="round" data-curr="" />
          {Array.from({ length: n }, (_, i) => {
            const dc = curr[i * k];
            const dpv = prev[i * k];
            const lab = dc ? ds(dc.date, k > 1 || range.start.slice(0, 4) !== range.end.slice(0, 4)) + (k > 1 ? c.t("home.path.onward") + k + c.t("home.path.day_total") : "") : "";
            return (
              <rect key={i} x={X(i) - cw / 2} y={0} width={cw} height={H} fill="transparent">
                <title>{lab + c.t("home.path.this_year") + nf(cv[i]) + c.t("home.render_yo_y.last_year") + nf(pv[i]) + (dpv ? ` (${dpv.date})` : "")}</title>
              </rect>
            );
          })}
        </>
      )}
      <text x={pl} y={H - 2} fill={C["text-2"]} style={mono}>
        {ds(range.start, true)}
      </text>
      <text x={W - pr} y={H - 2} textAnchor="end" fill={C["text-2"]} style={mono}>
        {ds(range.end, true) + (k > 1 ? ` · ${k}${c.t("home.path.day_bins")}` : "")}
      </text>
    </svg>
  );
}
