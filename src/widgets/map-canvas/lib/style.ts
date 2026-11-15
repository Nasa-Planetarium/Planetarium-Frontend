import type { StyleSpecification, LayerSpecification } from "maplibre-gl";
import type { DemManifest } from "../model/types";
import { CELL_OPACITY, DOT_EDGE_TOKEN, DOT_TOKEN, dotRadiusExpr, radiusExpr, stepColorExpr, STEP_TOKENS } from "@/shared/lib/display";

/**
 * 공통 지도 스타일(목업 map3d _styleKor · _styleGlobal 을 한 판으로).
 * 층 순서(아래 → 위): bg(바다) · land-world(다른 나라 육지) · land(지금 나라 육지, 나라 1급 면) · hs-w(전 세계 저해상 음영) · hs(한국 고해상 음영) · world-mask · world-line · mask · reg-hi · rivers-w · rivers · roads · reg-line · reg-hi-line ·
 *   burn-fill · burn-line · hotdot · hotpx · hotpx-modis · aoi-fill · aoi-line · route-glow · route-dash · draft-fill · draft-line · draft-pt
 * 나라·자료와 무관하게 층 id 는 같다(화면이 setLayer 로 켜고 끈다). 음영은 DEM 목록(W0)이 있을 때만 addDem() 이 더한다.
 */
export type Tok = (name: string) => string;

const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });
export const SOURCES = ["land", "regions", "lines", "mask", "world", "cells", "hot", "hotpx", "burns", "aoi", "routes", "draft"] as const;

export function buildStyle(T: Tok, iso3: string, worldUrl: string): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  SOURCES.forEach((s) => {
    sources[s] = empty();
  });
  sources.world = { type: "geojson", data: worldUrl };
  // 전 세계 하천(Natural Earth 10m) — 남한 안쪽만 있는 선(kr)은 나라 상세 선(lines)이 맡아 뺀다
  sources["rivers-w"] = { type: "geojson", data: worldUrl.replace(/world\.json$/, "rivers-world.json") };
  const bw = parseFloat(T("map-boundary-w")) || 1.1;
  const layers: LayerSpecification[] = [
    { id: "bg", type: "background", paint: { "background-color": T("map-sea") } },
    // 육지 면: 다른 나라는 세계 윤곽(저배율)으로, 지금 나라는 나라 1급 면(더 고운 해안선)으로 — 세계 윤곽의 거친 해안이 바다로 삐져나오지 않게
    { id: "land-world", type: "fill", source: "world", filter: ["!=", ["get", "iso3"], iso3], paint: { "fill-color": T("map-land") } },
    { id: "land", type: "fill", source: "land", paint: { "fill-color": T("map-land") } },
    // 다른 나라 면(세계 윤곽)을 가린다. 지금 나라는 빼고(구멍)
    { id: "world-mask", type: "fill", source: "world", filter: ["!=", ["get", "iso3"], iso3], paint: { "fill-color": T("map-mask"), "fill-opacity": 0.55 } },
    { id: "world-line", type: "line", source: "world", paint: { "line-color": T("map-boundary"), "line-opacity": 0.45, "line-width": 0.8 } },
    // 초점 지역(고른 시도·시군구) 밖을 어둡게(목업 mask)
    { id: "mask", type: "fill", source: "mask", paint: { "fill-color": T("map-mask"), "fill-opacity": 0.5 } },
    { id: "reg-hit", type: "fill", source: "regions", paint: { "fill-color": "#000", "fill-opacity": 0 } },
    { id: "reg-hi", type: "fill", source: "regions", filter: ["in", ["get", "id"], ["literal", []]], paint: { "fill-color": T("accent"), "fill-opacity": 0.13 } },
    {
      id: "rivers-w",
      type: "line",
      source: "rivers-w",
      filter: ["!", ["get", "kr"]],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": T("map-water"),
        // 큰 강(rank 낮음)부터: 저확대엔 rank 5 이하만, 확대할수록 작은 강
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, ["case", ["<=", ["get", "rank"], 5], 0.55, 0], 5, ["case", ["<=", ["get", "rank"], 8], 0.7, 0.35], 8, 0.75, 13.5, 0.25],
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, ["case", ["<=", ["get", "rank"], 3], 0.8, 0.4], 6, ["case", ["<=", ["get", "rank"], 5], 1.4, 0.7], 10, ["case", ["<=", ["get", "rank"], 5], 2.6, 1.4]],
      },
    },
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
    // 월 감지량 칸 원(표시 규칙서 R3–R5): 단계 k = 0.1° 칸당 월 감지량 5단계(화면 안 최댓값 대비 상대 색 없음), 크기 = 화면 px 규칙 — 감지 점 아래.
    // 반지름 식은 칸 크기마다 달라 화면이 칸을 넣을 때 다시 단다(radiusExpr)
    {
      id: "cells",
      type: "circle",
      source: "cells",
      paint: {
        "circle-color": stepColorExpr(STEP_TOKENS.map((t) => T(t))) as never,
        "circle-radius": radiusExpr(0.1) as never,
        "circle-opacity": CELL_OPACITY,
        "circle-stroke-width": 0.5,
        "circle-stroke-color": T("map-land"),
        "circle-stroke-opacity": 0.7,
      },
    },
    { id: "burn-fill", type: "fill", source: "burns", paint: { "fill-color": ["case", ["get", "sel"], T("h4"), T("h3")], "fill-opacity": ["case", ["get", "sel"], 0.34, 0.24] } },
    { id: "burn-line", type: "line", source: "burns", paint: { "line-color": ["case", ["get", "sel"], T("h5"), T("h4")], "line-width": ["case", ["get", "sel"], 2, 1.3], "line-dasharray": [3, 2] } },
    // 감지 점(기본): 번짐 없는 작은 점. 화소 사각형이 나오는 줌(10.6)부터 숨긴다
    {
      id: "hotdot",
      type: "circle",
      source: "hot",
      maxzoom: 10.6,
      paint: {
        // 표시 규칙서 R6: 센서 구분 없는 한 색(F10 ④), 크기는 줌 규칙 하나(FRP 가중 ×1–1.6)
        "circle-radius": dotRadiusExpr("frp") as never,
        "circle-color": T(DOT_TOKEN),
        "circle-opacity": 0.9,
        "circle-stroke-color": T(DOT_EDGE_TOKEN),
        "circle-stroke-width": 0.75,
      },
    },
    { id: "hotpx", type: "fill", source: "hotpx", filter: ["==", ["get", "sensor"], "VIIRS"], minzoom: 10.6, paint: { "fill-color": T(DOT_TOKEN), "fill-opacity": 0.55, "fill-outline-color": T(DOT_EDGE_TOKEN) } },
    { id: "hotpx-modis", type: "line", source: "hotpx", filter: ["!=", ["get", "sensor"], "VIIRS"], minzoom: 10.6, paint: { "line-color": T(DOT_TOKEN), "line-opacity": 0.7, "line-width": 1 } },
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
 * 지형 음영(DEM 목록이 있을 때만) — bg 바로 위. DEM 은 목록 maxzoom(지금 z10, 512px)까지라 z13 넘게 확대하면 늘린 타일 이음매가 보여 음영을 옅게 한다(목업 hs)
 * 목록 경로는 사이트 뿌리 기준이라 앞에 origin 을 붙인다.
 */
export function demLayer(T: Tok, dem: DemManifest, origin: string) {
  const abs = (t: string) => (/^https?:/.test(t) ? t : `${origin}/${t.replace(/^\//, "")}`);
  const source = { type: "raster-dem" as const, tiles: [abs(dem.tiles)], encoding: dem.encoding ?? "terrarium", tileSize: dem.tileSize ?? 512, minzoom: dem.minzoom ?? 5, maxzoom: dem.maxzoom ?? 11, ...(dem.bounds ? { bounds: dem.bounds } : {}) };
  const layer = hsLayer(T, "hs", "dem", ["interpolate", ["linear"], ["zoom"], 5, 0.25, 9, 0.32, 12, 0.5, 13.5, 0.36, 14.5, 0.24]);
  // 전 세계 저해상 바탕(목록 base): 고해상 겹 아래. 한국 칸은 바탕 z5 타일에서 0 으로 눌러 두 겹이 되지 않는다
  const b = dem.base;
  const base = b
    ? {
        source: { type: "raster-dem" as const, tiles: [abs(b.tiles)], encoding: b.encoding ?? "terrarium", tileSize: b.tileSize ?? 512, minzoom: b.minzoom ?? 0, maxzoom: b.maxzoom ?? 5 },
        layer: hsLayer(T, "hs-w", "dem-w", ["interpolate", ["linear"], ["zoom"], 1, 0.4, 5, 0.3, 9, 0.32, 12, 0.4, 14.5, 0.24]),
      }
    : null;
  return { source, layer, base };
}

function hsLayer(T: Tok, id: string, source: string, exaggeration: unknown[]): LayerSpecification {
  return {
    id,
    type: "hillshade",
    source,
    paint: {
      "hillshade-shadow-color": T("map-shade-dark"),
      "hillshade-highlight-color": T("map-shade-light"),
      "hillshade-accent-color": T("map-shade-accent"),
      "hillshade-exaggeration": exaggeration as never,
      "hillshade-illumination-direction": 315,
    },
  };
}

/** 레이어 열쇠 → 스타일 층 id(목업 _sync vis). 처리기 표 — switch 금지(결정 E4) */
export const LAYER_IDS: Record<string, () => [string, boolean][]> = {
  relief: () => [["hs", true], ["hs-w", true]],
  boundaries: () => [["reg-line", true]],
  rivers: () => [["rivers", true], ["rivers-w", true]],
  roads: () => [["roads", true]],
  cells: () => [["cells", true]],
  /* 열 지도(밀도)는 없앴다(표시 규칙서 R1 — 한국만 쓰던 표현) — 열쇠 이름은 층 메뉴 호환으로 남기고 감지 점을 켠다 */
  heat: () => [["hotdot", true]],
  hotspots: () => [["hotpx", true], ["hotpx-modis", true]],
  burns: () => [["burn-fill", true], ["burn-line", true]],
  aoi: () => [["aoi-fill", true], ["aoi-line", true]],
  routes: () => [["route-glow", true], ["route-dash", true]],
};
