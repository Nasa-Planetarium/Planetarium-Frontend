"use client";

import { useEffect, useState } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import type { SpreadCell, SpreadNowcast } from "@/entities/spread-nowcast";

/**
 * 확산 nowcast 층(계약 /spread-nowcast 0.025° 칸)을 MapLibre 지도 위에 얹는다 — 화면이 MapCanvas onReady 로 받은 지도를 넘긴다.
 * 칸 = 0.025° 정사각형(칸 중심 ± 0.0125°). 색 = 단계(low·moderate·high → 토큰 --alert-1 · --alert-3 · --alert-4), 확률 숫자는 툴팁에만(계약).
 * 낮음 칸(잰 것: 10,189칸 중 9,708)은 흐리게, 높음은 진하게 — 지도 바탕을 가리지 않게 채움 투명도를 단계별로 낮춘다.
 * 감지 점 층(hotdot)이 있으면 그 아래에 둔다(점이 칸 위에 보이게).
 */
export const NC_SRC = "nc-cells";
export const NC_FILL = "nc-fill";
export const NC_LINE = "nc-line";
const LV_TOKEN = { low: "alert-1", moderate: "alert-3", high: "alert-4" } as const;
const LV_ALPHA = { low: 0.28, moderate: 0.55, high: 0.78 } as const;

const tok = (n: string) => (typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim());
type GeoData = Parameters<GeoJSONSource["setData"]>[0];

export function cellFeatures(cells: readonly SpreadCell[]): GeoData {
  return {
    type: "FeatureCollection",
    features: cells.map((c, i) => {
      const h = c.cell_size_deg / 2;
      const [w, e, s, n] = [c.cell_lon - h, c.cell_lon + h, c.cell_lat - h, c.cell_lat + h];
      return { type: "Feature", id: i, properties: { i, lv: c.level }, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
    }),
  } as GeoData;
}

export type SpreadHover = { x: number; y: number; cell: SpreadCell } | null;

export function useSpreadLayer(map: MlMap | null, data: SpreadNowcast | null | undefined, on: boolean) {
  const [hover, setHover] = useState<SpreadHover>(null);
  const cells = data?.cells;

  /* 층 만들기(한 번) */
  useEffect(() => {
    if (!map || map.getSource(NC_SRC)) return;
    map.addSource(NC_SRC, { type: "geojson", data: cellFeatures([]) });
    const before = map.getLayer("hotdot") ? "hotdot" : undefined;
    const color = ["match", ["get", "lv"], "high", tok(LV_TOKEN.high), "moderate", tok(LV_TOKEN.moderate), tok(LV_TOKEN.low)];
    const alpha = ["match", ["get", "lv"], "high", LV_ALPHA.high, "moderate", LV_ALPHA.moderate, LV_ALPHA.low];
    map.addLayer({ id: NC_FILL, type: "fill", source: NC_SRC, paint: { "fill-color": color as never, "fill-opacity": alpha as never } }, before);
    map.addLayer({ id: NC_LINE, type: "line", source: NC_SRC, filter: ["!=", ["get", "lv"], "low"], paint: { "line-color": color as never, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 11, 1.2] as never } }, before);
  }, [map]);

  /* 자료 바뀜 */
  useEffect(() => {
    (map?.getSource(NC_SRC) as GeoJSONSource | undefined)?.setData(cellFeatures(cells ?? []));
  }, [map, cells]);

  /* 켜고 끄기 */
  useEffect(() => {
    if (!map) return;
    for (const id of [NC_FILL, NC_LINE]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }, [map, on]);

  /* 툴팁(올려 두면) */
  useEffect(() => {
    if (!map) return;
    const move = (e: MapLayerMouseEvent) => {
      const i = Number(e.features?.[0]?.properties?.i);
      const c = Number.isInteger(i) ? cells?.[i] : undefined;
      setHover(c ? { x: e.point.x, y: e.point.y, cell: c } : null);
    };
    const leave = () => setHover(null);
    map.on("mousemove", NC_FILL, move);
    map.on("mouseleave", NC_FILL, leave);
    return () => {
      map.off("mousemove", NC_FILL, move);
      map.off("mouseleave", NC_FILL, leave);
    };
  }, [map, cells]);

  return { hover: on ? hover : null };
}
