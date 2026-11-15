"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { countryName, useCountry, type CountryInfo } from "@/entities/country";
import { useAoiScope, type Bbox } from "@/features/pick-aoi";
import { ApiError } from "@/shared/api";
import { usePath, useQueryParams } from "@/shared/lib/nav";
import { MapCanvas, adm1RegionsQuery, aoiGeometry, type DrawnAoi, type MapCanvasHandle, type MapRegion } from "@/widgets/map-canvas";
import { forecastQuery } from "../api/forecast";
import {
  DEFAULT_REGION,
  MAX_VERTICES,
  aoiOfFace,
  asOfMD,
  closeRing,
  cnt,
  leadKind,
  md,
  parseRegion,
  pct1,
  regionParams,
  selfIndustrial,
  summaryMode,
  vertexCount,
  type FcRegion,
  type Forecast,
  type ForecastDay,
} from "../model/forecast";
import { cx } from "./cx";
import { downloadText, toCSV } from "./use-lab";

type T = (k: string, p?: Record<string, string | number>) => string;

/** 고른 지역이 지금 나라 것인가(나라를 바꾸면 그 나라 기본 지역으로) */
function belongs(iso3: string, id: string) {
  if (iso3 === "KOR") return id === "KR" || /^(SIDO|SGG)_/.test(id);
  return id === `ADM0_${iso3}` || id.startsWith(`ADM1_${iso3}-`);
}

/**
 * 예측 분석(lab) 기본 보기 — FireOutlook Planner 30일 전망(결정 F17, 계약 POST /api/v1/forecast).
 * 지역(시도·주 기본, 지도 면 누르기) · 사각형 · 다각형(공통 지도 그리기 도구)을 고르면 오늘(KST)부터 30일 전망을 받는다.
 * 숫자는 응답 그대로(A1). 표시 규칙은 모델팀 계약 그대로 — model/forecast.ts.
 */
export function ForecastView({ t, lang, tabs }: { t: T; lang: string; tabs: ReactNode }) {
  const { iso3, info } = useCountry();
  const S = useAoiScope();
  const sp = useQueryParams();
  const router = useRouter();
  const pathname = usePath();
  const mapRef = useRef<MapCanvasHandle>(null);

  /* 지역: 주소(?region · ?bbox · ?poly) → 없거나 다른 나라 것이면 기본(한국 강원 · 아르헨티나 코르도바 · 그 밖 나라 전체) */
  const fromUrl = parseRegion(sp);
  const fallback: FcRegion = { kind: "aoi", id: DEFAULT_REGION[iso3] ?? `ADM0_${iso3}` };
  const region: FcRegion = fromUrl && (fromUrl.kind !== "aoi" || belongs(iso3, fromUrl.id)) ? fromUrl : fallback;
  const setRegion = useCallback(
    (r: FcRegion) => {
      const q = new URLSearchParams(sp.toString());
      ["region", "bbox", "poly"].forEach((k) => q.delete(k));
      Object.entries(regionParams(r)).forEach(([k, v]) => q.set(k, v));
      const qs = q.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [sp, router, pathname],
  );

  const tooComplex = vertexCount(region) > MAX_VERTICES;
  const fq = useQuery({ ...forecastQuery(tooComplex ? null : region) });
  const r = fq.data ?? null;

  /* 지도 면: 나라 1급(public/geo/c/<ISO3>.json) — id 를 계약 aoi_id 로 */
  const faces = useQuery(adm1RegionsQuery(iso3, lang));
  const regions: MapRegion[] = useMemo(() => (faces.data ?? []).map((f) => ({ ...f, id: aoiOfFace(f.id) })), [faces.data]);
  const nameOf = useCallback(
    (id: string) => {
      const sn = S.byId.has(id) ? S.nameOf(id) : "";
      return sn || regions.find((x) => x.id === id)?.name || (id === `ADM0_${iso3}` ? countryName(info, lang, iso3) : id);
    },
    [S, regions, iso3, info, lang],
  );
  const options = useMemo(() => [...regions].sort((a, b) => a.name.localeCompare(b.name, lang)), [regions, lang]);

  const drawn: DrawnAoi | null = region.kind === "bbox" ? { type: "bbox", west: region.b[0], south: region.b[1], east: region.b[2], north: region.b[3] } : region.kind === "poly" ? { type: "polygon", pts: region.ring.slice(0, -1).map(([x, y]) => [y, x] as [number, number]) } : null;
  const onDraw = (a: DrawnAoi) => {
    if (a.type === "bbox") setRegion({ kind: "bbox", b: [a.west, a.south, a.east, a.north] });
    else if (a.type === "polygon") setRegion({ kind: "poly", ring: closeRing((aoiGeometry(a).coordinates[0] ?? []) as [number, number][]) });
  };
  const regionLabel = region.kind === "aoi" ? nameOf(region.id) : region.kind === "bbox" ? t("fc30.pick.bbox_label") : t("fc30.pick.poly_label", { n: vertexCount(region) });

  const inf = info as (CountryInfo & { bbox_main?: Bbox }) | undefined;
  const view = (inf?.bbox_main ?? inf?.bbox ?? null) as Bbox | null;

  const grey = !!r && selfIndustrial(r, region);
  const mode = r ? summaryMode(r) : null;
  const err = fq.error instanceof ApiError ? fq.error : null;

  const csv = () => {
    if (!r) return;
    downloadText(
      `emberline_forecast30_${region.kind === "aoi" ? region.id : region.kind}_${r.start}.csv`,
      toCSV(r.daily, [
        { label: "date", get: (d) => d.date },
        { label: "lead_days_from_as_of", get: (d) => d.lead_days_from_as_of },
        { label: "p_day", get: (d) => d.p_day },
        { label: "base_p_day", get: (d) => d.base_p_day },
        { label: "expected_count_day", get: (d) => d.expected_count_day },
        { label: "skill", get: (d) => d.skill },
        { label: "source", get: (d) => d.source },
        { label: "value_source", get: () => r.value_source },
        { label: "as_of", get: () => r.as_of },
        { label: "region", get: () => r.region },
      ]),
      undefined,
      { aoi: region.kind === "aoi" ? region.id : region.kind, period: r.daily.length ? `${r.daily[0]!.date}/${r.daily[r.daily.length - 1]!.date}` : r.start, as_of: r.as_of, source: "/api/v1/forecast" },
    );
  };

  return (
    <div className={cx("lb fo")} data-testid="lab-fc" data-ready={r ? "1" : "0"} data-mode={mode ?? ""} data-region={region.kind === "aoi" ? region.id : region.kind}>
      <div className={cx("fo-screen")}>
        <header className={cx("pghd fo-head")}>
          <div className={cx("ph-1")}>
            <h1>{t("lab.ui.forecast2")}</h1>
            <b className={cx("fo-title")} data-fc-title="">
              {t("fc30.title", { d: asOfMD(r?.as_of) })}
            </b>
            <span className={cx("ph-scope")} data-scope="">
              {r ? t("fc30.scope", { a: regionLabel, s: md(r.start, lang), e: md(r.end, lang) }) : regionLabel}
            </span>
            <div className={cx("ph-tools")}>{tabs}</div>
          </div>
        </header>

        <section className={cx("lb-stage fo-stage")} aria-label={t("fc30.map_aria")}>
          <MapCanvas
            ref={mapRef}
            className={cx("map lb-map")}
            testId="fc-map"
            iso3={iso3}
            view={view}
            regions={regions}
            hiRegions={region.kind === "aoi" ? [region.id] : []}
            layers={{ labels: true, heat: false, hotspots: false, cells: false }}
            onRegion={(id) => setRegion({ kind: "aoi", id })}
            aoi={drawn}
            onDraw={onDraw}
            tools={["layers", "bbox", "polygon"]}
            ticks
          >
            <div className={cx("map-key fo-key")}>
              <span>{t("fc30.map_key")}</span>
            </div>
          </MapCanvas>
        </section>

        <aside className={cx("lb-side fo-side")} aria-label={t("fc30.side_aria")}>
          <section className={cx("panel fo-pick")} data-pick="">
            <h2 className={cx("fo-h")}>{t("fc30.pick.title")}</h2>
            <label className={cx("fo-lbl")}>
              <span>{iso3 === "KOR" ? t("fc30.pick.sido") : t("fc30.pick.adm1")}</span>
              <select
                className={cx("fo-sel")}
                data-fc-select=""
                value={region.kind === "aoi" && options.some((o) => o.id === region.id) ? region.id : ""}
                onChange={(e) => e.target.value && setRegion({ kind: "aoi", id: e.target.value })}
              >
                <option value="">{region.kind === "aoi" && !options.some((o) => o.id === region.id) ? nameOf(region.id) : t("fc30.pick.choose")}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {nameOf(o.id)}
                  </option>
                ))}
              </select>
            </label>
            <div className={cx("fo-draw")} role="group" aria-label={t("fc30.pick.draw_aria")}>
              <button type="button" className={cx("btn sm ghost", region.kind === "bbox" && "on")} data-fc-draw="bbox" aria-pressed={region.kind === "bbox"} onClick={() => mapRef.current?.startDraw("bbox")}>
                {t("fc30.pick.bbox")}
              </button>
              <button type="button" className={cx("btn sm ghost", region.kind === "poly" && "on")} data-fc-draw="polygon" aria-pressed={region.kind === "poly"} onClick={() => mapRef.current?.startDraw("polygon")}>
                {t("fc30.pick.poly")}
              </button>
              {region.kind !== "aoi" ? (
                <button type="button" className={cx("btn sm ghost")} data-fc-draw="clear" onClick={() => setRegion(fallback)}>
                  {t("fc30.pick.clear")}
                </button>
              ) : null}
            </div>
            <p className={cx("lb-cap")}>{t("fc30.pick.hint")}</p>
          </section>

          <section className={cx("panel fo-sum")} data-sum="">
            {tooComplex ? (
              <p className={cx("oc-nodata")} data-err="vertices">
                {t("fc30.err.vertices", { n: MAX_VERTICES })}
              </p>
            ) : fq.isPending ? (
              <p className={cx("lb-empty")}>{t("fc30.loading")}</p>
            ) : err || !r ? (
              <p className={cx("oc-nodata")} data-err={err?.code ?? "x"}>
                {err?.code === "unknown_aoi" ? t("fc30.err.unknown") : err?.code === "polygon_too_complex" ? t("fc30.err.vertices", { n: MAX_VERTICES }) : err?.status === 503 ? t("fc30.err.unavailable") : t("fc30.err.failed")}
              </p>
            ) : (
              <Summary t={t} lang={lang} r={r} grey={grey} nameOf={nameOf} />
            )}
          </section>
        </aside>

        <section className={cx("panel fo-band")} aria-label={t("fc30.band_aria")} data-band="">
          <div className={cx("listhead")}>
            <h3 className={cx("lh-t")}>{t("fc30.band.title")}</h3>
            <span className={cx("lh-a")}>
              <button type="button" className={cx("btn sm ghost")} data-x="csv" onClick={csv} disabled={!r}>
                {t("fc30.csv")}
              </button>
            </span>
          </div>
          {r ? <DayBand t={t} lang={lang} days={r.daily} baseline={r.value_source === "baseline"} /> : <div className={cx("fo-band-empty")} />}
        </section>
      </div>
    </div>
  );
}

const SKW = (t: T, k: string) => t(`fc30.skill.${k}`);

function Summary({ t, lang, r, grey, nameOf }: { t: T; lang: string; r: Forecast; grey: boolean; nameOf: (id: string) => string }) {
  const mode = summaryMode(r);
  const range = t("fc30.sum.range", { a: cnt(r.expected_count_q10, lang), b: cnt(r.expected_count_q90, lang) });
  return (
    <div className={cx("fo-sumb", grey && "is-grey")} data-grey={grey ? "1" : undefined}>
      {mode === "hint" ? (
        <div className={cx("fo-big")} data-big="hint">
          <b className={cx("fo-hint")} data-hint="">
            {r.display_hint}
          </b>
          <span className={cx("fo-bigv")}>
            <span>{t("fc30.sum.count")}</span> <b className={cx("num")} data-count="">{cnt(r.expected_count, lang)}</b>
            <span className={cx("num")}>{range}</span>
          </span>
          <span className={cx("fo-chip", "sk-" + r.count_skill)} data-count-skill="">
            {t("fc30.sum.count_skill")} {SKW(t, r.count_skill)}
          </span>
        </div>
      ) : mode === "baseline" ? (
        <div className={cx("fo-big")} data-big="baseline">
          <b className={cx("fo-basew")} data-baseline-label="">
            {t("fc30.sum.baseline_level")}
          </b>
          <span className={cx("fo-bigv")}>
            <b className={cx("num")} data-p="">{pct1(r.p_any, lang)}</b>
            <span>{t("fc30.sum.p_baseline")}</span>
          </span>
        </div>
      ) : (
        <div className={cx("fo-big")} data-big="model">
          <span className={cx("fo-bigv")}>
            <b className={cx("num")} data-p="">{pct1(r.p_any, lang)}</b>
            <span>{t("fc30.sum.p_model")}</span>
          </span>
          <span className={cx("fo-chip", "sk-" + r.skill)} data-skill="">
            {t("fc30.sum.skill")} {SKW(t, r.skill)}
          </span>
          {r.skill === "low" ? <span className={cx("lb-cap")}>{t("fc30.sum.low_note")}</span> : null}
        </div>
      )}
      <dl className={cx("sumlist")}>
        {mode !== "hint" ? (
          <>
            <dt>{t("fc30.sum.count")}</dt>
            <dd>
              <b className={cx("num")} data-count="">{cnt(r.expected_count, lang)}</b> <span className={cx("num")}>{range}</span>{" "}
              <span className={cx("fo-chip", "sk-" + r.count_skill)} data-count-skill="">
                {t("fc30.sum.count_skill")} {SKW(t, r.count_skill)}
              </span>
            </dd>
          </>
        ) : (
          <>
            <dt>{t("fc30.sum.p_any")}</dt>
            <dd className={cx("num")} data-p="">
              {pct1(r.p_any, lang)}
            </dd>
          </>
        )}
        <dt>{t("fc30.sum.fire_days")}</dt>
        <dd className={cx("num")} data-fire-days="">
          {t("fc30.sum.days_v", { n: cnt(r.expected_fire_days, lang) })}
        </dd>
        <dt>{t("fc30.sum.base")}</dt>
        <dd data-base="">
          <span className={cx("num")}>{pct1(r.baseline.p_any, lang)}</span> · <span className={cx("num")}>{t("fc30.sum.count_v", { n: cnt(r.baseline.count, lang) })}</span> ·{" "}
          <span className={cx("num")}>{t("fc30.sum.days_v", { n: cnt(r.baseline.expected_fire_days, lang) })}</span>
        </dd>
      </dl>
      {grey ? (
        <p className={cx("oc-grey")} data-grey-note="">
          {t("fc30.sum.self_industrial")}
        </p>
      ) : null}
      {r.suspected_industrial_sgg.length && !grey ? (
        <p className={cx("fo-greyl")} data-industrial="">
          <span>{t("fc30.sum.industrial")}</span>
          {r.suspected_industrial_sgg.map((id) => (
            <span key={id} className={cx("fo-chip sk-grey")} data-sgg={id}>
              {nameOf(id)}
            </span>
          ))}
        </p>
      ) : null}
      {r.persistent_source_cells.count > 0 ? (
        <p className={cx("fo-greyl")} data-persistent="">
          {t("fc30.sum.persistent", { n: r.persistent_source_cells.count, p: pct1(r.persistent_source_cells.area_share, lang) })}
        </p>
      ) : null}
      <p className={cx("lb-cap")} data-unit="">
        {t("fc30.sum.unit")}
      </p>
      <p className={cx("lb-cap fo-basis")}>{t("fc30.sum.basis", { b: r.skill_basis })}</p>
      <p className={cx("fo-notice")} data-notice="">
        {t("fc30.notice")}
      </p>
    </div>
  );
}

/** 30일 띠 + 그래프: 막대 = 그날 탐지 확률(p_day), 점선 = 예년(base_p_day). 1~7일 「모델 예측」 · 8일~ 「평년 패턴 기반」 구역 */
function DayBand({ t, lang, days, baseline }: { t: T; lang: string; days: ForecastDay[]; baseline: boolean }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(720);
  const [hov, setHov] = useState<number | null>(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const H = 132;
  const padL = 40;
  const padR = 8;
  const padT = 18;
  const padB = 22;
  const n = days.length;
  const bw = (w - padL - padR) / Math.max(1, n);
  const mx = Math.max(0.01, ...days.map((d) => Math.max(d.p_day, d.base_p_day)));
  const top = mx <= 0.05 ? Math.ceil(mx * 100) / 100 : mx <= 0.5 ? Math.ceil(mx * 20) / 20 : 1;
  const y = (p: number) => padT + (H - padT - padB) * (1 - p / top);
  const split = days.findIndex((d) => leadKind(d) === "pattern");
  const xs = (i: number) => padL + i * bw;
  const basePath = days.map((d, i) => `${i ? "L" : "M"}${(xs(i) + bw / 2).toFixed(1)},${y(d.base_p_day).toFixed(1)}`).join("");
  /* 날짜 글자: 첫날·끝날·7일마다(끝날과 3칸 안이면 끝날만) */
  const label = (i: number) => i === 0 || i === n - 1 || (i % 7 === 0 && n - 1 - i >= 3);
  const h = hov == null ? null : days[hov];
  return (
    <div className={cx("fo-chart")} ref={setEl}>
      <div className={cx("fo-legend")}>
        <span>
          <i className={cx("fo-sw fo-sw-m")} />
          {t("fc30.band.model")}
        </span>
        <span>
          <i className={cx("fo-sw fo-sw-p")} />
          {t("fc30.band.pattern")}
        </span>
        <span>
          <i className={cx("fo-sw fo-sw-b")} />
          {t("fc30.band.base")}
        </span>
        {baseline ? <span className={cx("fo-legnote")}>{t("fc30.band.baseline_note")}</span> : null}
      </div>
      <svg width={w} height={H} role="img" aria-label={t("fc30.band.aria", { n })} className={cx("fo-svg")} onMouseLeave={() => setHov(null)}>
        {split > 0 ? <rect x={xs(split)} y={padT - 14} width={w - padR - xs(split)} height={H - padB - padT + 14} className={cx("fo-zone")} /> : null}
        {split > 0 ? (
          <>
            <text x={xs(0) + 2} y={padT - 4} className={cx("fo-zt")} data-zone="model">
              {t("fc30.band.model")}
            </text>
            <text x={xs(split) + 4} y={padT - 4} className={cx("fo-zt")} data-zone="pattern">
              {t("fc30.band.pattern")}
            </text>
          </>
        ) : null}
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} className={cx("fo-grid")} />
            <text x={padL - 4} y={y(v) + 3} textAnchor="end" className={cx("fo-ax")}>
              {pct1(v, lang).replace(".0%", "%")}
            </text>
          </g>
        ))}
        {days.map((d, i) => (
          <rect
            key={d.date}
            x={xs(i) + 1}
            y={y(d.p_day)}
            width={Math.max(1, bw - 2)}
            height={Math.max(0.5, y(0) - y(d.p_day))}
            className={cx(leadKind(d) === "model" ? "fo-bar-m" : "fo-bar-p", hov === i && "on")}
            data-day={d.date}
            data-lead={d.lead_days_from_as_of}
            onMouseEnter={() => setHov(i)}
          />
        ))}
        <path d={basePath} className={cx("fo-base")} />
        {days.map((d, i) =>
          label(i) ? (
            <text key={d.date} x={xs(i) + bw / 2} y={H - 6} textAnchor="middle" className={cx("fo-ax")}>
              {md(d.date, lang)}
            </text>
          ) : null,
        )}
      </svg>
      <p className={cx("fo-read")} aria-live="polite" data-read="">
        {h ? t("fc30.band.read", { d: md(h.date, lang), k: t(`fc30.band.${leadKind(h)}`), p: pct1(h.p_day, lang), b: pct1(h.base_p_day, lang), c: cnt(h.expected_count_day, lang) }) : t("fc30.band.read_idle")}
      </p>
      <div className={cx("fo-strip")} role="list" aria-label={t("fc30.band.strip_aria")}>
        {days.map((d, i) => (
          <span
            key={d.date}
            role="listitem"
            className={cx("fo-cell", leadKind(d) === "model" ? "k-m" : "k-p", hov === i && "on")}
            style={{ ["--a" as string]: String(Math.min(1, d.p_day / top)) }}
            title={`${md(d.date, lang)} ${pct1(d.p_day, lang)}`}
            data-cell={d.date}
            onMouseEnter={() => setHov(i)}
          >
            <span className={cx("lb-sr")}>
              {md(d.date, lang)} {t(`fc30.band.${leadKind(d)}`)} {pct1(d.p_day, lang)}
            </span>
          </span>
        ))}
      </div>
      <table className={cx("lb-sr")} data-days="">
        <caption>{t("fc30.band.title")}</caption>
        <thead>
          <tr>
            <th>{t("fc30.band.col_date")}</th>
            <th>{t("fc30.band.col_kind")}</th>
            <th>{t("fc30.band.col_p")}</th>
            <th>{t("fc30.band.col_base")}</th>
            <th>{t("fc30.band.col_count")}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} data-d={d.date} data-kind={leadKind(d)}>
              <td>{d.date}</td>
              <td>{t(`fc30.band.${leadKind(d)}`)}</td>
              <td>{pct1(d.p_day, lang)}</td>
              <td>{pct1(d.base_p_day, lang)}</td>
              <td>{cnt(d.expected_count_day, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
