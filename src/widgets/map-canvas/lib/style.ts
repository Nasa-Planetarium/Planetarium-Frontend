import type { StyleSpecification, LayerSpecification } from "maplibre-gl";
import type { DemManifest } from "../model/types";
import { withAlpha } from "./geo";

/**
 * 공통 지도 스타일(목업 map3d _styleKor · _styleGlobal 을 한 판으로).
 * 층 순서(아래 → 위): bg · hs(지형 음영) · world-mask · world-line · mask · reg-hi · rivers · roads · reg-line · reg-hi-line ·
 *   burn-fill · burn-line · heat · hotdot · hotpx · hotpx-modis · aoi-fill · aoi-line · route-glow · route-dash · draft-fill · draft-line · draft-pt
 * 나라·자료와 무관하게 층 id 는 같다(화면이 setLayer 로 켜고 끈다). 음영은 DEM 목록(W0)이 있을 때만 addDem() 이 더한다.
 */
export type Tok = (name: string) => string;

const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });
export const SOURCES = ["regions", "lines", "mask", "world", "hot", "hotpx", "burns", "aoi", "routes", "draft"] as const;

export function buildStyle(T: Tok, iso3: string, worldUrl: string): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  SOURCES.forEach((s) => {
    sources[s] = empty();
  });
  sources.world = { type: "geojson", data: worldUrl };
  const bw = parseFloat(T("map-boundary-w")) || 1.1;
  const layers: LayerSpecification[] = [
    { id: "bg", type: "background", paint: { "background-color": T("map-bg") } },
    // 다른 나라 면(세계 윤곽)을 가린다. 지금 나라는 빼고(구멍)
    { id: "world-mask", type: "fill", source: "world", filter: ["!=", ["get", "iso3"], iso3], paint: { "fill-color": T("map-mask"), "fill-opacity": 0.55 } },
    { id: "world-line", type: "line", source: "world", paint: { "line-color": T("map-boundary"), "line-opacity": 0.45, "line-width": 0.8 } },
    // 초점 지역(고른 시도·시군구) 밖을 어둡게(목업 mask)
    { id: "mask", type: "fill", source: "mask", paint: { "fill-color": T("map-mask"), "fill-opacity": 0.5 } },
    { id: "reg-hit", type: "fill", source: "regions", paint: { "fill-color": "#000", "fill-opacity": 0 } },
    { id: "reg-hi", type: "fill", source: "regions", filter: ["in", ["get", "id"], ["literal", []]], paint: { "fill-color": T("accent"), "fill-opacity": 0.13 } },
    {
      id: "rivers",
      type: "line",
      source: "lines",
      filter: ["==", ["get", "kind"], "river"],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": T("map-water"),
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 13.5, 0.25],
        // 큰 강(major 또는 rank 1)은 굵게 — 목업은 「낙동강」 이름으로 골랐다
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["any", ["==", ["get", "major"], true], ["==", ["get", "name"], "낙동강"]], 1, 0.5], 8, ["case", ["any", ["==", ["get", "major"], true], ["==", ["get", "name"], "낙동강"]], 1.8, 1], 12, ["case", ["any", ["==", ["get", "major"], true], ["==", ["get", "name"], "낙동강"]], 4, 2.2]],
      },
    },
    // 단순화한 OSM 선은 줌 12 넘게 확대하면 곧은 토막으로 보여 흐리게 지운다
    { id: "roads", type: "line", source: "lines", filter: ["==", ["get", "kind"], "road"], layout: { "line-join": "round" }, paint: { "line-color": T("map-road"), "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.32, 13, 0], "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 12, 2.2] } },
    { id: "reg-line", type: "line", source: "regions", paint: { "line-color": T("map-boundary"), "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.55, 13.5, 0], "line-width": bw, "line-dasharray": [3, 2] } },
    { id: "reg-hi-line", type: "line", source: "regions", filter: ["in", ["get", "id"], ["literal", []]], paint: { "line-color": T("accent"), "line-width": 2.2 } },
    { id: "burn-fill", type: "fill", source: "burns", paint: { "fill-color": ["case", ["get", "sel"], T("h4"), T("h3")], "fill-opacity": ["case", ["get", "sel"], 0.34, 0.24] } },
    { id: "burn-line", type: "line", source: "burns", paint: { "line-color": ["case", ["get", "sel"], T("h5"), T("h4")], "line-width": ["case", ["get", "sel"], 2, 1.3], "line-dasharray": [3, 2] } },
    // 밀도 열 지도: density 일 때만. 상한 0.8 · h0 투명 시작(바탕이 비친다)
    {
      id: "heat",
      type: "heatmap",
      source: "hot",
      paint: {
        "heatmap-weight": ["get", "w"],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 7, 0.55, 10, 0.9, 13, 1.4],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 6, 7, 14, 8, 20, 9, 32, 10, 48, 11, 66, 13, 110],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 13.5, 0.5],
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, withAlpha(T("h0"), 0), 0.08, withAlpha(T("h1"), 0.42), 0.25, withAlpha(T("h2"), 0.72), 0.45, withAlpha(T("h3"), 0.88), 0.65, withAlpha(T("h4"), 0.94), 0.84, withAlpha(T("h5"), 0.98), 1, T("h6")],
      },
    },
    // 감지 점(기본): 번짐 없는 작은 점, 센서색 + 바탕색 테두리. 화소 사각형이 나오는 줌(10.6)부터 숨긴다
    {
      id: "hotdot",
      type: "circle",
      source: "hot",
      maxzoom: 10.6,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["+", 1.2, ["*", 1.2, ["get", "w"]]], 7, ["+", 1.6, ["*", 1.6, ["get", "w"]]], 10, ["+", 2.4, ["*", 2.4, ["get", "w"]]]],
        "circle-color": ["case", ["==", ["get", "sensor"], "MODIS"], T("data-modis"), T("data-viirs")],
        "circle-opacity": 0.9,
        "circle-stroke-color": T("map-halo"),
        "circle-stroke-width": 0.75,
      },
    },
    { id: "hotpx", type: "fill", source: "hotpx", filter: ["==", ["get", "sensor"], "VIIRS"], minzoom: 10.6, paint: { "fill-color": T("data-px-viirs"), "fill-opacity": 0.55, "fill-outline-color": T("data-px-viirs-edge") } },
    { id: "hotpx-modis", type: "line", source: "hotpx", filter: ["!=", ["get", "sensor"], "VIIRS"], minzoom: 10.6, paint: { "line-color": T("data-px-modis"), "line-opacity": 0.7, "line-width": 1 } },
    { id: "aoi-fill", type: "fill", source: "aoi", paint: { "fill-color": T("accent"), "fill-opacity": 0.09 } },
    { id: "aoi-line", type: "line", source: "aoi", paint: { "line-color": T("accent"), "line-width": 1.8, "line-dasharray": [3, 2] } },
    { id: "route-glow", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": T("data-route"), "line-width": 10, "line-opacity": 0.22, "line-blur": 6 } },
    { id: "route-dash", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": T("data-route"), "line-width": 2.6, "line-dasharray": [2, 2] } },
    { id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": T("accent"), "fill-opacity": 0.12 } },
    { id: "draft-line", type: "line", source: "draft", paint: { "line-color": T("accent"), "line-width": 1.6 } },
    { id: "draft-pt", type: "circle", source: "draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": ["case", ["get", "first"], 5, 3.5], "circle-color": ["case", ["get", "first"], T("text-1"), T("accent")] } },
  ];
  return { version: 8, sources, layers };
}

/**
 * 지형 음영(DEM 목록이 있을 때만) — bg 바로 위. DEM 은 z11(512px)까지라 z13 넘게 확대하면 늘린 타일 이음매가 보여 음영을 옅게 한다(목업 hs)
 * 목록 경로는 사이트 뿌리 기준이라 앞에 origin 을 붙인다.
 */
export function demLayer(T: Tok, dem: DemManifest, origin: string) {
  const url = /^https?:/.test(dem.tiles) ? dem.tiles : `${origin}/${dem.tiles.replace(/^\//, "")}`;
  const source = { type: "raster-dem" as const, tiles: [url], encoding: dem.encoding ?? "terrarium", tileSize: dem.tileSize ?? 512, minzoom: dem.minzoom ?? 5, maxzoom: dem.maxzoom ?? 11, ...(dem.bounds ? { bounds: dem.bounds } : {}) };
  const layer: LayerSpecification = {
    id: "hs",
    type: "hillshade",
    source: "dem",
    paint: {
      "hillshade-shadow-color": T("map-shade-dark"),
      "hillshade-highlight-color": T("map-shade-light"),
      "hillshade-accent-color": T("map-shade-accent"),
      "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 5, 0.25, 9, 0.32, 12, 0.5, 13.5, 0.36, 14.5, 0.24],
      "hillshade-illumination-direction": 315,
    },
  };
  return { source, layer };
}

/** 레이어 열쇠 → 스타일 층 id(목업 _sync vis). 처리기 표 — switch 금지(결정 E4) */
export const LAYER_IDS: Record<string, (dens: boolean) => [string, boolean][]> = {
  relief: () => [["hs", true]],
  boundaries: () => [["reg-line", true]],
  rivers: () => [["rivers", true]],
  roads: () => [["roads", true]],
  heat: (dens) => [["heat", dens], ["hotdot", !dens]],
  hotspots: () => [["hotpx", true], ["hotpx-modis", true]],
  burns: () => [["burn-fill", true], ["burn-line", true]],
  aoi: () => [["aoi-fill", true], ["aoi-line", true]],
  routes: () => [["route-glow", true], ["route-dash", true]],
};
