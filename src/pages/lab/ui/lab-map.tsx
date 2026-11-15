"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { boundaryQuery, useCountry, type CountryInfo } from "@/entities/country";
import { MapCanvas, type Bbox, type Geom, type MapCanvasHandle, type MapRegion } from "@/widgets/map-canvas";
import { MAP_CLS_TOK, clsOf, lvOf } from "../model/outlook";
import type { LabCtx } from "./lab-page";
import { cx } from "./cx";
import { useTok } from "./use-lab";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });

/**
 * 지역별 전망 지도 — 공통 지도(widgets/map-canvas · 목업 map3d) 바탕(지형 음영·하천·경계·눈금) 위에 목업 lab.js 몫:
 * 지역 면 단계 채움(lb-fc — 표 「수준」과 같은 3단 --lv-low·normal·high, 자료 부족 = --hatch-bg) · 선택 강조(--cosmo-star) ·
 * 면 위 표지(이름 + 예측 중앙값). 경계를 못 받은 지역은 중심 원으로 대신한다.
 * 한국 밖: 전망 스냅숏(outlook.json)에 1급 지역 예측이 없어(나라 단위만 — 잰 것 2026-11-15) 지역 원이 모두 「자료 부족」 빗금이었다 →
 * 나라 1급 면 전체를 나라 전망 수준(권역 예측 = 표 머리 값)으로 칠하고, 빈 원은 그리지 않는다(지역 값은 표가 「부족」으로 말한다).
 */
export function LabMap(c: LabCtx) {
  const { FC, F, T_, kor, regions, sel, select, rowOf, fitBbox } = c;
  const ref = useRef<MapCanvasHandle>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [frame, setFrame] = useState(0);
  const tok = useTok();
  const { iso3, info } = useCountry();
  const bnd = useQuery({ ...boundaryQuery(iso3), enabled: !kor }).data as { geometry?: { features?: { geometry: unknown }[] } } | undefined;
  const ctryFaces = useMemo(() => (kor ? [] : (bnd?.geometry?.features ?? []).filter((f) => !!f.geometry)), [kor, bnd]);
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
    /* 밝은 지도(F14): 면 = 지도용 3단(옅음→진함 = 낮음→높음) · 자료 부족 = 옅은 회색 + 빗금 무늬 층 · 고른 면 = 지도 강조(map-sel) */
    const hatch = document.createElement("canvas");
    hatch.width = hatch.height = 8;
    const g = hatch.getContext("2d");
    if (g) {
      g.strokeStyle = tk("map-boundary");
      g.globalAlpha = 0.55;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, 8);
      g.lineTo(8, 0);
      g.stroke();
      if (!m.hasImage("lb-hatch")) m.addImage("lb-hatch", g.getImageData(0, 0, 8, 8));
    }
    m.addLayer({ id: "lb-face", type: "fill", source: "lb-face", paint: { "fill-color": ["get", "c"], "fill-opacity": 0.8 } }, before);
    m.addLayer({ id: "lb-face-na", type: "fill", source: "lb-face", filter: ["==", ["get", "na"], 1], paint: { "fill-pattern": "lb-hatch" } }, before);
    m.addLayer({ id: "lb-face-line", type: "line", source: "lb-face", paint: { "line-color": tk("map-boundary"), "line-opacity": 0.7, "line-width": 0.8 } }, before);
    m.addLayer({ id: "lb-face-on", type: "line", source: "lb-face", filter: ["==", ["get", "on"], 1], paint: { "line-color": tk("map-sel"), "line-width": 2.2 } });
    m.addLayer({ id: "lb-fc", type: "circle", source: "lb-reg", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "c"], "circle-opacity": 0.9, "circle-stroke-color": ["case", ["==", ["get", "on"], 1], tk("map-sel"), tk("map-boundary")], "circle-stroke-width": ["case", ["==", ["get", "on"], 1], 2, 1] } });
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
    const colorOf = (id: string | null) => tok[MAP_CLS_TOK[clsOf(rowOf(id))] as keyof typeof tok] || tok["map-lv-na"];
    const naOf = (id: string | null) => (clsOf(rowOf(id)) === 0 ? 1 : 0);
    if (!kor && ctryFaces.length && clsOf(rowOf(null)) > 0) {
      const c = colorOf(null);
      (map.getSource("lb-face") as GeoJSONSource | undefined)?.setData(fc(ctryFaces.map((f) => ({ type: "Feature", properties: { id: "all", c, on: 0, na: naOf(null) }, geometry: f.geometry }))) as GeoData);
      (map.getSource("lb-reg") as GeoJSONSource | undefined)?.setData(fc([]) as GeoData);
      return;
    }
    (map.getSource("lb-face") as GeoJSONSource | undefined)?.setData(
      fc(
        regions
          .filter((r) => r.geom)
          .map((r) => {
            const g = r.geom as { geometry?: unknown };
            return { type: "Feature", properties: { id: r.id, c: colorOf(r.id), on: sel === r.id ? 1 : 0, na: naOf(r.id) }, geometry: g.geometry ?? g };
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
  }, [map, tok, regions, rowOf, sel, kor, ctryFaces]);

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
            <i style={{ background: `var(--map-lv-${k})`, boxShadow: "0 0 0 1px var(--map-land)" }} />
            {LVW[k]}
          </span>
        ))}
        {anyNa ? (
          <span>
            <i style={{ background: "repeating-linear-gradient(135deg,color-mix(in srgb,var(--map-boundary) 55%,transparent) 0 1px,transparent 1px 4px),var(--map-lv-na)", boxShadow: "0 0 0 1px var(--map-land)" }} />
            {T_("lab.ui.insufficient_data")}
          </span>
        ) : null}
      </div>
    </MapCanvas>
  );
}
