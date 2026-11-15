"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import { MapCanvas, labelPoint, type Geom, type MapCanvasHandle, type MapRegion } from "@/widgets/map-canvas";
import { BAND_TOK, cellRing, pct, ppDiff, shadeOf } from "../model/occ";
import type { LabCtx } from "./lab-page";
import { cx } from "./cx";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });

/**
 * 다음 달 발생 확률 지도 — 공통 지도(widgets/map-canvas, 밝은 바탕 F14) 위에:
 *  - 다른 나라: 전 세계 0.5° 칸(/occurrence/grid fields=map)을 4단 색으로(--occ-0…3), 지속 열원 의심 = 회색(--occ-ps). 파일에 없는 칸은 그리지 않는다(「대상 아님」).
 *  - 한국: 시군구 면(/aois/{id}/boundary)을 같은 4단 색으로, 산업 열원 의심 = 회색.
 * 색은 화면 토큰(lab.module.css .lb 의 --occ-*)을 읽어 MapLibre 에 넘긴다. 확률은 서버 값 그대로.
 */
export function LabMap(c: LabCtx) {
  const { t, kor, rows, sel, select, cells, fit, VSW } = c;
  const ref = useRef<MapCanvasHandle>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [cols, setCols] = useState<string[] | null>(null);
  const selRef = useRef(select);
  useEffect(() => {
    selRef.current = select;
  }, [select]);

  const onReady = useCallback((m: MlMap) => {
    const root = boxRef.current?.closest("[data-testid='lab']") ?? document.documentElement;
    const cs = getComputedStyle(root);
    const tk = (n: string) => cs.getPropertyValue(`--${n}`).trim();
    const C = BAND_TOK.map((k) => tk(k));
    const ramp = ["match", ["get", "k"], 0, C[0]!, 1, C[1]!, 2, C[2]!, 3, C[3]!, C[4]!] as unknown as string;
    m.addSource("oc-cells", { type: "geojson", data: fc([]) });
    m.addSource("oc-face", { type: "geojson", data: fc([]) });
    const before = m.getLayer("reg-line") ? "reg-line" : undefined;
    m.addLayer({ id: "oc-cells", type: "fill", source: "oc-cells", paint: { "fill-color": ramp, "fill-opacity": 0.82, "fill-antialias": false } }, before);
    m.addLayer({ id: "oc-cells-on", type: "line", source: "oc-cells", filter: ["==", ["get", "id"], ""], paint: { "line-color": tk("occ-sel"), "line-width": 2.4 } });
    m.addLayer({ id: "oc-face", type: "fill", source: "oc-face", paint: { "fill-color": ramp, "fill-opacity": 0.86 } }, before);
    m.addLayer({ id: "oc-face-line", type: "line", source: "oc-face", paint: { "line-color": tk("occ-edge"), "line-width": 0.6 } }, before);
    m.addLayer({ id: "oc-face-on", type: "line", source: "oc-face", filter: ["==", ["get", "on"], 1], paint: { "line-color": tk("occ-sel"), "line-width": 2.6 } });
    m.on("click", "oc-cells", (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) selRef.current(id);
    });
    for (const l of ["oc-cells", "oc-face"]) {
      m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
    }
    setCols(C);
    setMap(m);
  }, []);

  /* 칸: 한 번 만든다(5만 칸) — 고른 칸은 필터로만 바꾼다 */
  const cellData = useMemo(
    () =>
      kor || !cells
        ? fc([])
        : fc(cells.map((x) => ({ type: "Feature", properties: { id: String(x.cell_id), k: shadeOf(x.p_any, x.persistent_source) ?? 0 }, geometry: { type: "Polygon", coordinates: [cellRing(x.lat, x.lon)] } }))),
    [kor, cells],
  );
  useEffect(() => {
    if (!map) return;
    (map.getSource("oc-cells") as GeoJSONSource | undefined)?.setData(cellData as GeoData);
  }, [map, cellData]);
  useEffect(() => {
    if (!map || !map.getLayer("oc-cells-on")) return;
    map.setFilter("oc-cells-on", ["==", ["get", "id"], kor ? "" : (sel ?? "")]);
  }, [map, sel, kor]);

  /* 시군구 면 */
  useEffect(() => {
    if (!map) return;
    const feats = kor
      ? rows
          .filter((r) => r.geom)
          .map((r) => ({ type: "Feature", properties: { id: r.id, k: shadeOf(r.p_any, r.suspected_industrial) ?? 0, on: sel === r.id ? 1 : 0 }, geometry: r.geom }))
      : [];
    (map.getSource("oc-face") as GeoJSONSource | undefined)?.setData(fc(feats) as GeoData);
  }, [map, rows, sel, kor]);

  /* 공통 지도 경계 선·누름(onRegion) = 같은 시군구 면 */
  const regions: MapRegion[] = useMemo(
    () =>
      kor
        ? rows
            .filter((r) => r.geom)
            .map((r) => {
              const p = labelPoint(r.geom as Geom);
              return { id: r.id, name: r.name, lat: p?.[0] ?? NaN, lon: p?.[1] ?? NaN, geometry: r.geom as Geom };
            })
            .filter((r) => Number.isFinite(r.lat))
        : [],
    [kor, rows],
  );

  const fitKey = fit ? fit.join(",") : "";
  const lastFit = useRef("");
  useEffect(() => {
    if (!map || !fit || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    ref.current?.fitBounds(fit, 32);
  }, [map, fit, fitKey]);

  const R = c.selRow;
  const grey = !!R?.suspected_industrial;
  return (
    <div ref={boxRef} className={cx("oc-mapbox")}>
      <MapCanvas
        ref={ref}
        className={cx("map lb-map")}
        testId="lab-map"
        iso3={c.iso3}
        view={fit}
        regions={regions}
        hiRegions={[]}
        layers={{ labels: false, heat: false, hotspots: false }}
        onRegion={(id) => select(sel === id ? null : id)}
        onReady={onReady}
        ticks
      >
        <div className={cx("lb-mread", !R && "idle")} aria-live="polite" data-mread="">
          {R ? (
            <>
              <span className={cx("lb-mrt")}>
                {R.cell ? t("occ.sum.cell") : R.name} <span className={cx("num")}>{c.tm}</span>
              </span>
              {R.cell ? <span className={cx("lb-mrs num")}>{R.name}</span> : null}
              <div className={cx("lb-mrv")}>
                <b className={cx("num")}>{pct(R.p_any)}</b>
                <span>
                  {t("occ.col.base")} <span className={cx("num")}>{pct(R.baseline_p)}</span> ({ppDiff(R.p_any, R.baseline_p)})
                </span>
              </div>
              <span className={cx("lb-mrs")}>{grey ? (R.cell ? t("occ.persistent_short") : t("occ.industrial_short")) : R.vs_normal ? VSW[R.vs_normal] : ""}</span>
            </>
          ) : null}
        </div>
        <div className={cx("map-key oc-key")} data-key="">
          <b>{t("occ.key_title", { m: c.tm })}</b>
          {[0, 1, 2, 3].map((k) => (
            <span key={k}>
              <i style={{ background: cols?.[k] ?? `var(--${BAND_TOK[k]})` }} />
              {t("occ.band." + k)}
            </span>
          ))}
          <span>
            <i style={{ background: cols?.[4] ?? "var(--occ-ps)" }} />
            {kor ? t("occ.industrial_short") : t("occ.persistent_short")}
          </span>
          {!kor ? (
            <span>
              <i className={cx("oc-none")} />
              {t("occ.not_target")}
            </span>
          ) : null}
        </div>
      </MapCanvas>
    </div>
  );
}
