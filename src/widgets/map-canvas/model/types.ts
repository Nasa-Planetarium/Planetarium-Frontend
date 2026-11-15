/**
 * 공통 지도(목업 map3d.js EMMap3D 이식)가 받는 자료 모양. 좌표 인자는 목업과 같이 [위도, 경도] 순서(LatLon)다.
 * GeoJSON 으로 넘길 때만 [경도, 위도].
 */
export type LatLon = [number, number];
export type Bbox = [number, number, number, number]; // 서, 남, 동, 북

/** 그린 관심 영역(목업 map3d _finishDraw · home applyGeom 의 g) — 결과는 aoiGeometry() 로 GeoJSON 이 된다 */
export type DrawnAoi =
  | { type: "bbox"; west: number; south: number; east: number; north: number }
  | { type: "polygon"; pts: LatLon[] }
  | { type: "point"; lat: number; lon: number; radius_km: number };

export type DrawMode = "bbox" | "polygon";

/** 감지 점(실제 API /hotspots 를 화면이 이 모양으로 옮겨 넘긴다) */
export interface MapHotspot {
  lat: number;
  lon: number;
  sensor: string; // "VIIRS" | "MODIS"
  frp?: number | null;
  conf?: string | null; // l·n·h 또는 숫자 문자열
  time?: string | null; // 표시용 감지 시각
}

/** 불(원장 목 또는 실제) — 표지 문법은 목업 EM.fireMarkOf 그대로 */
/** 월 감지량 칸(실제 /cells 0.1° 또는 정적 world-1deg 1° 묶음) — 중심 위경도 · 칸 크기(도) · 값(보정 지표) */
export interface MapCell {
  lat: number;
  lon: number;
  size: number;
  value: number;
}

export interface MapFire {
  id: string;
  lat: number;
  lon: number;
  level: number;
  status: string;
  name: string;
  label?: string;
  frp_max?: number | null;
  burned_ha?: number | null;
  historical?: boolean;
}

export interface MapUnit {
  id: string;
  lat: number;
  lon: number;
  status: string; // standby · enroute · onscene · return
  type?: string; // truck · heli · crew · command
  name: string;
  sub?: string; // 툴팁 둘째 줄(소속·종류·인원)
}

export interface MapRoute {
  unit: string;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  progress?: number | null;
}

export interface MapBurn {
  poly: LatLon[];
  selected?: boolean;
}

/** 경계 면(시도·시군구·나라 1급). 이름표 자리 = lat/lon */
export interface MapRegion {
  id: string;
  name: string;
  lat: number;
  lon: number;
  geometry: Geom | null;
}

/** nowcast = 화면이 onReady 로 얹는 확산 nowcast 층(features/spread-nowcast-layer) — 공통 지도는 메뉴 칸만 그리고 켜고 끄기는 화면이 onLayers 로 받는다 */
export type LayerKey = "relief" | "boundaries" | "labels" | "rivers" | "roads" | "cells" | "heat" | "hotspots" | "fires" | "units" | "routes" | "burns" | "aoi" | "nowcast";
export type Layers = Record<LayerKey, boolean>;
export const DEFAULT_LAYERS: Layers = { relief: true, boundaries: true, labels: true, rivers: true, roads: true, cells: true, heat: true, hotspots: true, fires: true, units: true, routes: true, burns: true, aoi: true, nowcast: true };

export type ToolKey = "layers" | "bbox" | "polygon" | "point";

/** 경위도 눈금(목업 EM.mapFrameTicks). outside = 지도 밖 띠에 그린다 */
export interface TickOpts {
  outside?: boolean;
  sides?: ("top" | "right" | "bottom" | "left")[];
  step?: number;
  minor?: number;
}

/** W0 바탕 자료 계약: public/dem/manifest.json(없으면 음영 없음 · 출처 줄에 지형을 적지 않는다) */
export interface DemManifest {
  tiles: string; // 예 "dem/{z}/{x}/{y}.webp"(사이트 뿌리 기준)
  encoding?: "terrarium" | "mapbox";
  tileSize?: number;
  minzoom?: number;
  maxzoom?: number;
  bounds?: Bbox;
  /** 전 세계 저해상 바탕 DEM(있으면 그 아래 겹으로) — 위 고해상 목록은 bounds 안 높은 확대에서 덮는다 */
  base?: { tiles: string; encoding?: "terrarium" | "mapbox"; tileSize?: number; minzoom?: number; maxzoom?: number };
}

/* GeoJSON 최소 모양(@types/geojson 에 기대지 않는다 — 좌표는 [경도, 위도]) */
export interface PolygonGeom {
  type: "Polygon";
  coordinates: number[][][];
}
export interface MultiPolygonGeom {
  type: "MultiPolygon";
  coordinates: number[][][][];
}
export interface OtherGeom {
  type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "GeometryCollection";
  coordinates?: unknown;
}
export type Geom = PolygonGeom | MultiPolygonGeom | OtherGeom;
export interface GeoFeature {
  type: "Feature";
  id?: string | number;
  properties: Record<string, unknown> | null;
  geometry: Geom | null;
}
export interface GeoCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}
