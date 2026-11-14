"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import { useCountry, type CountryInfo } from "@/entities/country";
import { MapCanvas, type Bbox, type Geom, type MapCanvasHandle, type MapRegion } from "@/widgets/map-canvas";
import { CLS_TOK, clsOf, lvOf } from "../model/outlook";
import type { LabCtx } from "./lab-page";
import { cx } from "./cx";
import { useTok } from "./use-lab";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });

/**
 * 지역별 전망 지도 — 공통 지도(widgets/map-canvas · 목업 map3d) 바탕(지형 음영·하천·경계·눈금) 위에 목업 lab.js 몫:
 * 지역 면 단계 채움(lb-fc — 표 「수준」과 같은 3단 --lv-low·normal·high, 자료 부족 = --hatch-bg) · 선택 강조(--cosmo-star) ·
 * 면 위 표지(이름 + 예측 중앙값). 경계를 못 받은 지역은 중심 원으로 대신한다.
 */
export function LabMap(c: LabCtx) {
  const { FC, F, T_, kor, regions, sel, select, rowOf, fitBbox } = c;
  const ref = useRef<MapCanvasHandle>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [frame, setFrame] = useState(0);
  const tok = useTok();
  const { iso3, info } = useCountry();
  const selRef = useRef(select);
  useEffect(() => {
    selRef.current = select;
  }, [select]);

  /* 바탕이 그려지면 면·원 층을 경계 선 아래에 얹는다 */
  const onReady = useCallback((m: MlMap) => {
    const cs = getComputedStyle(document.documentElement);
    const tk = (n: string) => cs.getPropertyValue(`--${n}`).trim();
    m.addSource("lb-face", { type: "geojson", data: fc([]) });
    m.addSource("lb-reg", { type: "geojson", data: fc([]) });
    const before = m.getLayer("reg-line") ? "reg-line" : undefined;
    m.addLayer({ id: "lb-face", type: "fill", source: "lb-face", paint: { "fill-color": ["get", "c"], "fill-opacity": 0.72 } }, before);
    m.addLayer({ id: "lb-face-line", type: "line", source: "lb-face", paint: { "line-color": tk("line-strong"), "line-width": 0.8 } }, before);
    m.addLayer({ id: "lb-face-on", type: "line", source: "lb-face", filter: ["==", ["get", "on"], 1], paint: { "line-color": tk("cosmo-star"), "line-width": 2.2 } });
    m.addLayer({ id: "lb-fc", type: "circle", source: "lb-reg", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "c"], "circle-stroke-color": ["case", ["==", ["get", "on"], 1], tk("cosmo-star"), tk("line-strong")], "circle-stroke-width": ["case", ["==", ["get", "on"], 1], 2, 1] } });
    const pick = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) selRef.current(id);
    };
    m.on("click", "lb-fc", pick);
    setMap(m);
  }, []);

  /* 맞춤: 고른 범위 상자(없으면 행 중심들), 밖 = 나라 본토 범위 */
  const view = useMemo((): Bbox | null => {
    if (fitBbox) return fitBbox;
    if (kor) {
      const ok = regions.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
      const la = ok.map((r) => r.lat);
      const lo = ok.map((r) => r.lon);
      if (la.length) return [Math.min(...lo) - 0.2, Math.min(...la) - 0.16, Math.max(...lo) + 0.2, Math.max(...la) + 0.16];
    }
    const inf = info as (CountryInfo & { bbox_main?: Bbox }) | undefined;
    return inf?.bbox_main ?? inf?.bbox ?? null;
  }, [kor, regions, info, fitBbox]);
  const fitKey = view ? view.join(",") : "";
  const lastFit = useRef("");
  useEffect(() => {
    if (!map || !view || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    ref.current?.fitBounds(view, 32);
  }, [map, view, fitKey]);

  /* 면(자료 붙으면 수준 색) · 경계 없는 지역은 원 */
  useEffect(() => {
    if (!map || !tok) return;
    const r0 = kor ? (regions.length > 12 ? 15 : 22) : 7;
    const colorOf = (id: string) => tok[CLS_TOK[clsOf(rowOf(id))] as keyof typeof tok] || tok["hatch-bg"];
    (map.getSource("lb-face") as GeoJSONSource | undefined)?.setData(
      fc(
        regions
          .filter((r) => r.geom)
          .map((r) => {
            const g = r.geom as { geometry?: unknown };
            return { type: "Feature", properties: { id: r.id, c: colorOf(r.id), on: sel === r.id ? 1 : 0 }, geometry: g.geometry ?? g };
          }),
      ) as GeoData,
    );
    (map.getSource("lb-reg") as GeoJSONSource | undefined)?.setData(
      fc(
        regions
          .filter((r) => !r.geom && Number.isFinite(r.lat) && Number.isFinite(r.lon))
          .map((r) => ({ type: "Feature", properties: { id: r.id, c: colorOf(r.id), r: r0, on: sel === r.id ? 1 : 0 }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } })),
      ) as GeoData,
    );
  }, [map, tok, regions, rowOf, sel, kor]);

  /* 공통 지도의 경계 선(점선) · 고른 지역 강조 = 같은 면 */
  const mapRegions: MapRegion[] = useMemo(
    () =>
      regions
        .filter((r) => r.geom && Number.isFinite(r.lat) && Number.isFinite(r.lon))
        .map((r) => {
          const g = r.geom as { geometry?: Geom };
          return { id: r.id, name: r.name, lat: r.lat, lon: r.lon, geometry: (g.geometry ?? (g as unknown as Geom)) ?? null };
        }),
    [regions],
  );

  /* 표지: 한국 지역은 전부, 다른 나라 1급은 40곳 이하일 때만(그보다 많으면 면 색 + 표가 말한다) */
  const marks = useMemo(() => {
    void frame;
    if (!map || !FC) return [];
    if (!kor && regions.length > 40) return [];
    return regions
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
      .map((r) => {
        const p = map.project([r.lon, r.lat]);
        const row = rowOf(r.id);
        return { id: r.id, name: r.name, x: p.x, y: p.y, row, cls: clsOf(row) };
      });
  }, [map, FC, kor, regions, rowOf, frame]);

  const LVW = { low: c.t("data.fc.level.low"), normal: c.t("data.fc.level.normal"), high: c.t("data.fc.level.high") };
  const anyNa = !!FC && FC.rows.some((r) => r.median == null || !r.level);
  const R = c.selRow;
  const H = FC;
  const pl = R?.ol?.pt != null && FC ? c.t("analysis.g6.partial", { d: FC.m.partial_as_of, v: F.n1(R.ol.pt / 10), p: F.n1((R.ol.ptp ?? 0) / 10) }) : "";

  return (
    <MapCanvas
      ref={ref}
      className={cx("map lb-map")}
      testId="lab-map"
      iso3={iso3}
      view={view}
      regions={mapRegions}
      hiRegions={sel ? [sel] : []}
      layers={{ labels: false, heat: false, hotspots: false }}
      onRegion={(id) => select(sel === id ? null : id)}
      onReady={onReady}
      onMove={() => setFrame((n) => n + 1)}
      ticks
    >
      {marks.map((m) => (
        <button
          key={m.id}
          type="button"
          className={cx("lb-fm", "lb-cls-" + m.cls, sel === m.id && "on")}
          data-r={m.id}
          aria-pressed={sel === m.id}
          aria-label={`${m.name}${T_("lab.ui.forecast_median2")}${F.n1(m.row?.median)}, ${lvOf(m.row) === "na" ? T_("lab.ui.insufficient_data") : LVW[lvOf(m.row) as keyof typeof LVW]}`}
          style={{ position: "absolute", left: m.x, top: m.y, transform: "translate(-50%,-50%)", zIndex: sel === m.id ? 3 : 1 }}
          onClick={(e) => {
            e.stopPropagation();
            select(sel === m.id ? null : m.id);
          }}
        >
          <b>{m.name}</b>
          <span className={cx("num")}>{F.n1(m.row?.median)}</span>
        </button>
      ))}
      <div className={cx("lb-mread", !c.sel && "idle")} aria-live="polite">
        {c.sel && R && H ? (
          <>
            <span className={cx("lb-mrt")}>
              {c.regLabel} <span className={cx("num")}>{F.ymS(H.month)}</span>
            </span>
            <div className={cx("lb-mrv")}>
              <b className={cx("num")}>{F.n1(R.median)}</b>
              <span>
                80%{" "}
                <span className={cx("num")}>
                  {F.n1(R.lo80, R.hi80)} – {F.n1(R.hi80, R.lo80)}
                </span>
              </span>
            </div>
            <span className={cx("lb-mrs")}>
              {T_("lab.ui.normal_p50")}
              <b className={cx("num")}>{F.n1(R.baseline.p50)}</b>,{" "}
              <span className={cx("lb-lvw", "lb-lv-" + lvOf(R))}>{lvOf(R) === "na" ? T_("lab.ui.insufficient_data") : LVW[lvOf(R) as keyof typeof LVW]}</span>
            </span>
            {pl ? <span className={cx("lb-mrs lb-mrp")}>{pl}</span> : null}
          </>
        ) : null}
      </div>
      <div className={cx("map-key")}>
        {(["low", "normal", "high"] as const).map((k) => (
          <span key={k}>
            <i style={{ background: `var(--lv-${k})` }} />
            {LVW[k]}
          </span>
        ))}
        {anyNa ? (
          <span>
            <i style={{ background: "var(--hatch)", outline: "1px solid var(--line-strong)", outlineOffset: -1 }} />
            {T_("lab.ui.insufficient_data")}
          </span>
        ) : null}
      </div>
    </MapCanvas>
  );
}
