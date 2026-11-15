"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FilterSpecification, GeoJSONSource, Map as MlMap, MapMouseEvent, MapTouchEvent, Marker } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, Layers as LayersIc, LocateFixed, Minus, Pentagon, Plus, Square } from "lucide-react";
import { useT } from "@/shared/i18n";
import { useDevice } from "@/shared/lib/use-device";
import { radiusExpr, stepOfCell } from "@/shared/lib/display";
import { MapKey, MapLoading } from "@/shared/ui";
import { adm1RegionsQuery, demManifestQuery, linesQuery } from "../api/basemap";
import { aoiBounds, aoiGeometry, checkPoint, clusterUnits, curve, fireMarkOf, hotWeight, isClosedFire, maskPolygon, niceScale, pixelSquare, placeLabels, tickLabel, tickStep, type Box, type LabelItem } from "../lib/geo";
import { buildStyle, demLayer, LAYER_IDS, type Tok } from "../lib/style";
import { DEFAULT_LAYERS, type Bbox, type DrawMode, type DrawnAoi, type GeoCollection, type Geom, type LatLon, type LayerKey, type Layers, type MapBurn, type MapCell, type MapFire, type MapHotspot, type MapRegion, type MapRoute, type MapUnit, type TickOpts, type ToolKey } from "../model/types";
import s from "./map-canvas.module.css";
import { PassLine } from "./pass-line";
import { moveBounds } from "../lib/bounds";

/**
 * 공통 지도 — 목업 map3d.js(EMMap3D)를 React 부품 하나로 옮겼다(대조표 §2 · 작업 단위 W1).
 * 바탕: 지형 음영(DEM 목록이 있을 때) · 다른 나라 가림 · 초점 지역 밖 가림 · 하천(큰 강 굵게) · 도로 · 경계 점선 + 고른 지역 강조 · 이름표 비키기 · 경위도 눈금 · 축척 · 출처(폭 맞춤)
 * 자료: 감지 점(센서 색 · FRP 가중) → 줌 10.6 부터 화소 사각형(VIIRS 375 m · MODIS 1 km) · 밀도 열 지도 · 점 툴팁 · 불 표지(조준 고리) · 자원 표지 + 겹침 묶음 · 출동 경로(휜 선 · 흐름) · 소실 범위
 * 도구: 레이어 창 · 사각형 끌기 · 다각형(꼭짓점 · 첫 점 닫기 · 두 번 눌러 닫기 · Esc) · 좌표 + 반경 창(범위 오류) · 그린 영역 유지 · 화면 밖 안내 · PNG 스냅숏
 * 범위는 전 세계 — 한국·경북에 묶인 값이 없다(목업은 경북 북부 상자 하나였다). 시야는 view, 경계 면은 regions, 가림 구멍은 focus 로 화면이 넘긴다.
 */
export interface MapCanvasHandle {
  map(): MlMap | null;
  snapshot(title?: string): HTMLCanvasElement | null;
  fitBounds(b: Bbox, pad?: number): void;
  flyTo(lat: number, lon: number, zoom?: number): void;
  fit(): void;
  startDraw(mode: DrawMode): void;
  cancelDraw(): void;
  project(lat: number, lon: number): [number, number] | null;
}

export interface MapCanvasProps {
  iso3: string;
  /** 전체 보기 범위(서, 남, 동, 북) — 「전체 보기」 단추와 처음 시야 */
  view?: Bbox | null;
  regions?: MapRegion[];
  hiRegions?: string[];
  /** 초점 지역 윤곽: 그 밖을 어둡게 가린다(없으면 나라 밖만 가림) */
  focus?: Geom | null;
  hotspots?: MapHotspot[];
  /** 월 감지량 칸(실제 /cells · 넓으면 1° 묶음) — 감지 점 아래 칸 원(표시 규칙서 R3–R5) */
  cells?: MapCell[];
  /** 범례(MapKey) 시간 창 글(「2025.03」 · 「최근 24시간」). 없으면 cellsKey */
  keyWin?: string | null;
  /** 범례를 끈다(화면이 다른 범례를 둘 때만 — 기본은 켬) */
  mapKey?: boolean;
  /** 범례를 지도 아래쪽 막대 위로 띄울 높이(px) */
  keyLift?: number;
  /** 칸 범례 이름(주면 왼쪽 위에 「이름 · 적음 ▮▮▮ 많음」) — 화면이 따로 범례를 그리면 비운다 */
  cellsKey?: string | null;
  /** 밀도 보기(열 지도) — 기본은 또렷한 점 */
  fires?: MapFire[];
  units?: MapUnit[];
  routes?: MapRoute[];
  burns?: MapBurn[];
  selFire?: string | null;
  /** 이름표를 늘 보일 불(주석) */
  annotFire?: string | null;
  onFire?(id: string): void;
  onUnit?(id: string): void;
  onRegion?(id: string): void;
  /** 카메라가 멈출 때마다 보이는 범위(서, 남, 동, 북)와 줌 — 화면이 점(/hotspots)을 그 범위로 받을 때 */
  onView?(b: Bbox, zoom: number): void;
  /** 지도가 처음 다 그려졌을 때 한 번 — 화면 고유 층(예: 예측 면 단계 채움)을 바탕 위에 얹을 때. 움직일 때마다 = onMove */
  onReady?(m: MlMap): void;
  onMove?(): void;
  /** 그린 관심 영역(제어) — undefined 면 부품이 스스로 들고 있는다 */
  aoi?: DrawnAoi | null;
  onDraw?(aoi: DrawnAoi): void;
  tools?: ToolKey[];
  /** 좌표 창의 허용 범위(없으면 view, 그것도 없으면 전 세계) */
  pointBounds?: Bbox | null;
  layers?: Partial<Layers>;
  /** 레이어 창에 보일 항목(순서대로) */
  layerMenu?: { k: LayerKey; label: string }[];
  onLayers?(l: Layers): void;
  ticks?: boolean | TickOpts;
  /** 화면 밖 안내: 이 점들이 모두 화면 밖이면 「{label}, 지도 화면 밖」 + 「영역으로 이동」 */
  offView?: { pts: LatLon[]; label: string } | null;
  /** 점 자료 상태 한 줄(예 「점 자료 준비 중」) */
  status?: string | null;
  /** 붙은 불 벌리기(목업 home spreadPins) — 상황판만 켠다 */
  spreadFires?: boolean;
  /** 전체 보기 맞춤 여백(px) — 화면이 지도 위에 띄운 것(검색 줄·범례 등)을 피할 때. 맞출 때마다 부른다(없으면 24) */
  viewPad?: () => number | { top: number; bottom: number; left: number; right: number };
  className?: string;
  testId?: string;
  children?: ReactNode;
}

type Mk = { m: Marker; d: HTMLDivElement; id: string; kind: "f" | "u"; lbl?: string; al?: string; cl?: string[] | null };
type LabelMk = { m: Marker; d: HTMLDivElement; id: string; river?: boolean; pts: [number, number][]; w?: number; h?: number; key?: string };
type Tip = { x: number; y: number; title: string; sub: string[] } | null;

const lngLatOf = (c: unknown): [number, number] | null => {
  if (Array.isArray(c) && c.length >= 2) return [Number(c[0]), Number(c[1])];
  if (c && typeof c === "object") {
    const o = c as { lng?: number; lon?: number; lat?: number };
    const x = o.lng ?? o.lon;
    if (x != null && o.lat != null) return [x, o.lat];
  }
  return null;
};

const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** 이 브라우저의 WebGL 이 소프트웨어 래스터(SwiftShader·llvmpipe 등)인가 — 한 번만 재고 기억한다 */
let softGl: boolean | null = null;
const softwareGl = () => {
  if (softGl !== null) return softGl;
  softGl = false;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      softGl = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    softGl = false;
  }
  return softGl;
};
const tokReader = (): Tok => {
  const css = getComputedStyle(document.documentElement);
  return (n) => css.getPropertyValue(`--${n}`).trim();
};
const cls = (...n: (string | false | null | undefined)[]) => n.filter(Boolean).join(" ");
const SVG = (paths: string) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
/** 자원 종류 → 아이콘(lucide truck · users · flag · plane 모양 손그림) */
const UNIT_ICON: Record<string, string> = {
  truck: SVG('<path d="M2 6h11v10H2z"/><path d="M13 9h4.5l3.5 3.5V16h-8"/><circle cx="6.5" cy="17.2" r="1.8"/><circle cx="17" cy="17.2" r="1.8"/>'),
  heli: SVG('<path d="M3 5h18"/><path d="M12 5v4"/><path d="M5 13a5 4 0 0 1 10-1h4v3h-4a5 4 0 0 1-10-2z"/><path d="M8 17v2h6"/>'),
  crew: SVG('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>'),
  command: SVG('<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>'),
};
const unitIcon = (type?: string) => UNIT_ICON[type ?? ""] ?? UNIT_ICON.truck!;
const unitColor: Record<string, string> = { standby: "data-unit-standby", enroute: "data-route", onscene: "alert-3", return: "data-unit-return" };

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(p, ref) {
  const t = useT();
  const phone = useDevice() === "phone";
  const wrap = useRef<HTMLDivElement>(null);
  const glEl = useRef<HTMLDivElement>(null);
  const uiEl = useRef<HTMLDivElement>(null);
  const attrEl = useRef<HTMLDivElement>(null);
  const scaleEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const ready = !!map;
  const [frame, setFrame] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const bump = useRef(() => {});
  const [tip, setTip] = useState<Tip>(null);
  const [pop, setPop] = useState<"layers" | "pt" | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [aoiOwn, setAoiOwn] = useState<DrawnAoi | null>(null);
  const aoi = p.aoi !== undefined ? p.aoi : aoiOwn;
  const [layers, setLayersState] = useState<Layers>({ ...DEFAULT_LAYERS, ...p.layers });
  const layersKey = JSON.stringify(p.layers ?? {});
  const [layersSeen, setLayersSeen] = useState(layersKey);
  if (layersSeen !== layersKey) {
    // 화면이 준 레이어 값이 바뀌면 그 값으로(객체 정체성 말고 값으로 비교)
    setLayersSeen(layersKey);
    setLayersState((l) => ({ ...l, ...p.layers }));
  }
  const setLayers = (l: Layers) => {
    setLayersState(l);
    p.onLayers?.(l);
  };
  const pRef = useRef(p);
  useLayoutEffect(() => {
    pRef.current = p;
  });
  const draft = useRef<{ a?: LatLon; b?: LatLon; pa?: [number, number]; last?: [number, number]; pts: LatLon[]; cursor?: LatLon }>({ pts: [] });
  const tipSrc = useRef<"hot" | "mk" | null>(null);
  const drawRef = useRef<DrawMode | null>(null);

  const dem = useQuery(demManifestQuery()).data ?? null;
  const lines = useQuery(linesQuery(p.iso3)).data ?? null;

  /* ── 지도 만들기(한 번) ── */
  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    let made: MlMap | null = null;
    let raf = 0;
    void import("maplibre-gl").then((lib) => {
      if (dead || !glEl.current) return;
      libRef.current = lib;
      const T = tokReader();
      const v = pRef.current.view;
      const m = new lib.Map({
        container: glEl.current,
        style: buildStyle(T, pRef.current.iso3, `${location.origin}/geo/world.json`),
        bounds: v ? [[v[0], v[1]], [v[2], v[3]]] : undefined,
        fitBoundsOptions: { padding: 8 },
        center: v ? undefined : [127.8, 36.3],
        zoom: v ? undefined : 6,
        minZoom: 1,
        maxZoom: 14.5,
        maxBounds: moveBounds(v) ?? undefined,
        maxPitch: 0,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
        // 소프트웨어 GL(GPU 없는 PC·VM·CI 러너)에서는 MSAA 를 끈다 — 화면마다 다시 그리는 비용의 약 2할(팀 시험 서버 1코어 실측)
        canvasContextAttributes: { antialias: !softwareGl(), preserveDrawingBuffer: true },
      });
      made = m;
      mapRef.current = m;
      /* 다른 나라 카메라 방어(목업 map3d): 화면 코드가 나라 범위(이동 경계) 밖 중심으로 카메라를 옮기려 하면(jumpTo·easeTo·flyTo)
         전체 보기로 바꾼다. 범위 안 좌표는 그대로 통과 */
      (["jumpTo", "easeTo", "flyTo"] as const).forEach((fn) => {
        const orig = (m[fn] as (...a: unknown[]) => MlMap).bind(m);
        (m as unknown as Record<string, unknown>)[fn] = (opt: Record<string, unknown> | undefined, ...rest: unknown[]) => {
          const pv = pRef.current.view;
          const b = pRef.current.iso3 !== "KOR" ? moveBounds(pv) : null;
          const c = opt ? lngLatOf(opt.center) : null;
          if (pv && b && c && (c[0] < b[0][0] || c[0] > b[1][0] || c[1] < b[0][1] || c[1] > b[1][1])) {
            const cam = m.cameraForBounds([[pv[0], pv[1]], [pv[2], pv[3]]], { padding: 8 });
            if (cam) opt = { ...opt, center: cam.center, zoom: cam.zoom };
          }
          return orig(opt, ...rest);
        };
      });
      m.touchZoomRotate.disableRotation();
      m.on("error", (e) => {
        if (!(m as unknown as { _errLogged?: boolean })._errLogged) {
          (m as unknown as { _errLogged?: boolean })._errLogged = true;
          console.warn("[map-canvas]", (e as { error?: Error }).error?.message);
        }
      });
      const emitView = () => {
        const b = m.getBounds();
        pRef.current.onView?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], m.getZoom());
      };
      m.on("load", () => {
        if (dead) return;
        setMap(m);
        emitView();
        pRef.current.onReady?.(m);
      });
      m.on("moveend", emitView);
      /* 움직임 신호(data-moving): 카메라가 움직이기 시작하면(movestart — easeTo·fitBounds·끌기 모두 부르는 순간 바로) "1",
         움직임이 끝나면(moveend) "0". 타일 읽기·경로 점선 흐름 같은 계속되는 그리기와는 상관없다(idle 은 그런 화면에서 오래 안 온다).
         React 상태가 아니라 속성을 바로 바꾼다 — 움직이는 동안 다시 그리지 않게. 시험은 카메라를 옮긴 뒤 "0" 을 기다린다 */
      const moving = (v: "0" | "1") => {
        if (wrap.current) wrap.current.dataset.moving = v;
      };
      moving(m.isMoving() ? "1" : "0");
      m.on("movestart", () => moving("1"));
      m.on("moveend", () => moving("0"));
      const tick = () => {
        if (!raf)
          raf = requestAnimationFrame(() => {
            raf = 0;
            if (dead) return;
            setFrame((n) => n + 1);
            const el = wrap.current;
            if (el) setSize((o) => (o.w === el.clientWidth && o.h === el.clientHeight ? o : { w: el.clientWidth, h: el.clientHeight }));
          });
      };
      bump.current = tick;
      m.on("move", tick);
      m.on("move", () => pRef.current.onMove?.());
      m.on("resize", tick);
      ro = new ResizeObserver(() => {
        m.resize();
        tick();
      });
      ro.observe(glEl.current);
    });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      made?.remove();
      mapRef.current = null;
      bump.current = () => {};
    };
  }, []);

  const src = useCallback((id: string, data: unknown) => {
    (mapRef.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data as Parameters<GeoJSONSource["setData"]>[0]);
  }, []);
  const vis = useCallback((id: string, on: boolean) => {
    const m = mapRef.current;
    if (m?.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }, []);

  /* ── 나라 바뀜: 다른 나라 가림 ── */
  useEffect(() => {
    map?.setFilter("world-mask", ["!=", ["get", "iso3"], p.iso3] as FilterSpecification);
    map?.setFilter("land-world", ["!=", ["get", "iso3"], p.iso3] as FilterSpecification);
  }, [map, p.iso3]);

  /* ── 지금 나라 육지 면(나라 1급 — 바다와 색이 갈린다). 파일이 없으면 세계 윤곽으로 */
  const landRegions = useQuery(adm1RegionsQuery(p.iso3, "en")).data;
  useEffect(() => {
    if (!map) return;
    const rs = (landRegions ?? []).filter((r) => r.geometry);
    if (rs.length) {
      src("land", fc(rs.map((r) => ({ type: "Feature", properties: { id: r.id }, geometry: r.geometry }))));
      map.setFilter("land-world", ["!=", ["get", "iso3"], p.iso3] as FilterSpecification);
    } else {
      src("land", fc([]));
      map.setFilter("land-world", null);
    }
  }, [map, landRegions, p.iso3, src]);

  /* ── 지형 음영(W0 DEM 목록이 있을 때만) ── */
  const demOn = !!dem && layers.relief;
  useEffect(() => {
    if (!map || !dem) return;
    if (!map.getSource("dem")) {
      const { source, layer, base } = demLayer(tokReader(), dem, location.origin);
      if (base) {
        map.addSource("dem-w", base.source);
        map.addLayer(base.layer, "world-mask");
      }
      map.addSource("dem", source);
      map.addLayer(layer, "world-mask");
    }
  }, [map, dem]);

  /* 시험·점검용: 지금 스타일 층 id 를 지도 칸 속성(data-layers)에 */
  useEffect(() => {
    if (map && wrap.current) wrap.current.dataset.layers = map.getStyle().layers.map((l) => l.id).join(",");
  }, [map, dem]);

  /* ── 하천·도로 선 ── */
  useEffect(() => {
    if (map) src("lines", lines ?? fc([]));
  }, [map, lines, src]);

  /* ── 경계 면 · 고른 지역 강조 ── */
  const regions = p.regions;
  useEffect(() => {
    if (!map) return;
    src("regions", fc((regions ?? []).filter((r) => r.geometry).map((r) => ({ type: "Feature", properties: { id: r.id, name: r.name }, geometry: r.geometry }))));
  }, [map, regions, src]);
  const hiKey = (p.hiRegions ?? []).join(",");
  useEffect(() => {
    if (!map) return;
    const f = ["in", ["get", "id"], ["literal", p.hiRegions ?? []]] as FilterSpecification;
    map.setFilter("reg-hi", f);
    map.setFilter("reg-hi-line", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 목록 값이 바뀔 때만
  }, [map, hiKey]);

  /* ── 초점 지역 밖 가림 ── */
  useEffect(() => {
    if (!map) return;
    const g = p.focus ? maskPolygon(p.focus) : null;
    src("mask", fc(g ? [{ type: "Feature", properties: {}, geometry: g }] : []));
  }, [map, p.focus, src]);

  /* ── 감지 점 · 화소 사각형 · 열 지도 세기 ── */
  const hot = p.hotspots;
  useEffect(() => {
    if (!map) return;
    const H = hot ?? [];
    src("hot", fc(H.map((h, i) => ({ type: "Feature", properties: { w: hotWeight(h), frp: h.frp ?? 0, sensor: h.sensor, i }, geometry: { type: "Point", coordinates: [h.lon, h.lat] } }))));
    src("hotpx", fc(H.map((h, i) => ({ type: "Feature", id: i, properties: { sensor: h.sensor, i }, geometry: { type: "Polygon", coordinates: pixelSquare(h) } }))));
  }, [map, hot, src]);

  /* ── 월 감지량 칸 원(표시 규칙서 R3–R5): 단계 = 0.1° 칸당 월 감지량(1° 는 ÷100, 여러 달 합은 ÷ 달 수) · 크기 = 화면 px 규칙 ── */
  const cells = p.cells;
  useEffect(() => {
    if (!map) return;
    const C = (cells ?? []).flatMap((c) => {
      const k = stepOfCell(c.value, c.size, c.months ?? 1);
      return k == null ? [] : [{ c, k }];
    });
    src("cells", fc(C.map(({ c, k }) => ({ type: "Feature", properties: { k, v: c.value }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } }))));
    if (map.getLayer("cells")) map.setPaintProperty("cells", "circle-radius", radiusExpr(C[0]?.c.size ?? 0.1) as never);
  }, [map, cells, src]);

  /* ── 소실 범위 · 그린 영역 · 경로 ── */
  useEffect(() => {
    if (!map) return;
    src("burns", fc((p.burns ?? []).filter((b) => b.poly.length > 2).map((b) => ({ type: "Feature", properties: { sel: !!b.selected }, geometry: { type: "Polygon", coordinates: [[...b.poly.map((q) => [q[1], q[0]]), [b.poly[0]![1], b.poly[0]![0]]]] } }))));
  }, [map, p.burns, src]);
  useEffect(() => {
    if (!map) return;
    src("aoi", fc(aoi ? [{ type: "Feature", properties: { type: aoi.type }, geometry: aoiGeometry(aoi) }] : []));
  }, [map, aoi, src]);
  const routeLines = useMemo(() => (p.routes ?? []).map((r) => ({ r, c: curve([r.from.lon, r.from.lat], [r.to.lon, r.to.lat], 40) })), [p.routes]);
  useEffect(() => {
    if (!map) return;
    src("routes", fc(routeLines.map(({ c }) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } }))));
  }, [map, routeLines, src]);
  /* 출동 경로 흐름: 점선 무늬를 단계별로 바꿔 끼운다(MapLibre ant-path 방식) */
  useEffect(() => {
    if (!map || !routeLines.length || !layers.routes || reduced()) return;
    const seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
    let i = 0;
    const id = window.setInterval(() => {
      i = (i + 1) % seq.length;
      if (map.getLayer("route-dash")) map.setPaintProperty("route-dash", "line-dasharray", seq[i]);
    }, 70);
    return () => window.clearInterval(id);
  }, [map, routeLines.length, layers.routes]);

  /* ── 레이어 켜고 끄기 ── */
  useEffect(() => {
    if (!map) return;
    Object.entries(LAYER_IDS).forEach(([k, f]) => f().forEach(([id, on]) => vis(id, layers[k as LayerKey] && on)));
  }, [map, layers, vis, dem]);

  /* ── 시야 ── */
  const fit = useCallback(() => {
    const m = mapRef.current;
    const v = pRef.current.view;
    if (!m || !v) return;
    m.fitBounds([[v[0], v[1]], [v[2], v[3]]], { padding: pRef.current.viewPad?.() ?? 24, animate: !reduced(), duration: 500 });
  }, []);
  const viewKey = p.view ? p.view.join(",") : "";
  useEffect(() => {
    // 이동 경계는 전체 보기 범위를 따라간다(나라·지역이 바뀌면 새 경계 — 맞추기 전에)
    if (map) map.setMaxBounds(moveBounds(pRef.current.view) ?? null);
  }, [map, viewKey]);
  useEffect(() => {
    if (map && viewKey) fit();
  }, [map, viewKey, fit]);

  /* ── 이름표(지역·하천) ── */
  const labelMk = useRef<LabelMk[]>([]);
  useEffect(() => {
    const lib = libRef.current;
    if (!map || !lib) return;
    labelMk.current.forEach((x) => x.m.remove());
    const out: LabelMk[] = [];
    (regions ?? []).slice(0, 400).forEach((r) => {
      const d = document.createElement("div");
      d.className = s.reg!;
      d.textContent = r.name;
      out.push({ m: new lib.Marker({ element: d, anchor: "center" }).setLngLat([r.lon, r.lat]).addTo(map), d, id: r.id, pts: [[r.lon, r.lat]] });
    });
    // 이름 있는 큰 강: 가장 긴 토막 위 세 자리(0.55 제자리 · 0.35 · 0.75)를 비키기 후보로
    const rivers = new Map<string, number[][]>();
    ((lines as GeoCollection | null)?.features ?? []).forEach((f) => {
      const pr = f.properties ?? {};
      if (pr.kind !== "river" || !pr.name || !f.geometry) return;
      const g = f.geometry as { type: string; coordinates: unknown };
      const parts = (g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []) as number[][][];
      parts.forEach((ln) => {
        const cur = rivers.get(String(pr.name));
        if (!cur || ln.length > cur.length) rivers.set(String(pr.name), ln);
      });
    });
    [...rivers.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 24)
      .forEach(([name, ln]) => {
        const at = (k: number) => ln[Math.min(ln.length - 1, Math.floor(ln.length * k))] as [number, number];
        const d = document.createElement("div");
        d.className = s.river!;
        d.textContent = name;
        out.push({ m: new lib.Marker({ element: d, anchor: "center" }).setLngLat(at(0.55)).addTo(map), d, id: `river:${name}`, river: true, pts: [at(0.55), at(0.35), at(0.75)] });
      });
    labelMk.current = out;
    bump.current();
    return () => {
      out.forEach((x) => x.m.remove());
    };
  }, [map, regions, lines]);

  /* ── 불 · 자원 표지(DOM) ── */
  const fireMk = useRef(new Map<string, Mk>());
  const unitMk = useRef(new Map<string, Mk>());
  const selUnit = useRef<string | null>(null);
  const showTipFor = useCallback(
    (mk: Mk) => {
      const r = mk.d.getBoundingClientRect();
      const e = wrap.current?.getBoundingClientRect();
      if (!e) return;
      const x = r.left - e.left + r.width / 2;
      const y = r.top - e.top + r.height / 2;
      if (mk.kind === "f") {
        const f = pRef.current.fires?.find((q) => q.id === mk.id);
        if (f) setTip({ x, y, title: f.name, sub: [`${t(`shell.level.${f.level}`)} · ${t(`shell.status.${f.status}`)}`, ...(f.frp_max != null ? [`FRP ${f.frp_max} MW`] : [])] });
        return;
      }
      if (mk.cl && mk.cl.length > 1) {
        const us = pRef.current.units ?? [];
        setTip({ x, y, title: t("shell.map.units_n", { n: mk.cl.length }), sub: mk.cl.map((id) => { const u = us.find((q) => q.id === id); return u ? `${u.name} · ${t(`shell.unit_status.${u.status}`)}` : id; }) });
        return;
      }
      const u = pRef.current.units?.find((q) => q.id === mk.id);
      if (u) setTip({ x, y, title: u.name, sub: [...(u.sub ? [u.sub] : []), t(`shell.unit_status.${u.status}`)] });
    },
    [t],
  );
  const bindMk = useCallback(
    (mk: Mk) => {
      mk.d.addEventListener("click", (e) => {
        e.stopPropagation();
        if (drawRef.current) return;
        if (mk.kind === "f") {
          pRef.current.onFire?.(mk.id);
          return;
        }
        if (mk.cl && mk.cl.length > 1) {
          // 묶음: 무리 가운데로, 가장 가까운 두 표지가 누르는 영역만큼 벌어지는 줌으로 한 번에
          const m = mapRef.current;
          const us = (pRef.current.units ?? []).filter((u) => mk.cl!.includes(u.id));
          if (!m || !us.length) return;
          const c: [number, number] = [us.reduce((a, u) => a + u.lon, 0) / us.length, us.reduce((a, u) => a + u.lat, 0) / us.length];
          const px = us.map((u) => m.project([u.lon, u.lat]));
          let dmin = Infinity;
          for (let i = 0; i < px.length; i++) for (let j = i + 1; j < px.length; j++) dmin = Math.min(dmin, Math.hypot(px[i]!.x - px[j]!.x, px[i]!.y - px[j]!.y));
          const dz = Math.max(1, Math.log2(56 / Math.max(1, dmin)));
          setTip(null);
          m.jumpTo({ center: c, zoom: Math.min(m.getMaxZoom(), m.getZoom() + dz) });
          return;
        }
        selUnit.current = mk.id;
        pRef.current.onUnit?.(mk.id);
      });
      mk.d.addEventListener("mouseenter", () => {
        tipSrc.current = "mk";
        showTipFor(mk);
      });
      mk.d.addEventListener("mouseleave", () => setTip(null));
    },
    [showTipFor],
  );
  useEffect(() => {
    const lib = libRef.current;
    if (!map || !lib) return;
    const T = tokReader();
    const keep = new Set<string>();
    (layers.fires ? (p.fires ?? []) : []).forEach((f) => {
      keep.add(f.id);
      let mk = fireMk.current.get(f.id);
      if (!mk) {
        const d = document.createElement("div");
        d.innerHTML = `<span class="${s.pulse}"></span><span class="${s.pin}"></span><span class="${s.flabel}"></span>`;
        d.setAttribute("role", "button");
        d.tabIndex = 0;
        mk = { m: new lib.Marker({ element: d, anchor: "center" }).setLngLat([f.lon, f.lat]).addTo(map), d, id: f.id, kind: "f" };
        bindMk(mk);
        fireMk.current.set(f.id, mk);
      }
      mk.m.setLngLat([f.lon, f.lat]);
      const fm = fireMarkOf(f);
      const keepCls = Array.from(mk.d.classList).filter((k) => k.startsWith("maplibregl-"));
      const sel = p.selFire === f.id;
      mk.d.className = [...keepCls, cls(s.fire, s[`lv${fm.level}`], fm.size === "m" && s.fsM, fm.size === "s" && s.fsS, fm.state === "half" && s.half, fm.state === "closed" && s.closed, fm.state === "hist" && s.hist, fm.major && s.major, f.status === "new" && s.isNew, sel && s.sel, (sel || p.annotFire === f.id) && s.showLabel, isClosedFire(f.status) && !sel && s.past)].join(" ");
      mk.d.style.setProperty("--c", fm.state === "closed" ? T("text-3") : T(`alert-${fm.level}`));
      const lb = f.label ?? f.name.split(" ").slice(-2).join(" ");
      if (mk.lbl !== lb) {
        mk.lbl = lb;
        (mk.d.lastElementChild as HTMLElement).textContent = lb;
      }
      mk.d.setAttribute("aria-label", `${f.name}, ${t(`shell.level.${f.level}`)}, ${t(`shell.status.${f.status}`)}`);
    });
    fireMk.current.forEach((mk, id) => {
      if (!keep.has(id)) {
        mk.m.remove();
        fireMk.current.delete(id);
      }
    });
    const ku = new Set<string>();
    (layers.units ? (p.units ?? []) : []).forEach((u) => {
      ku.add(u.id);
      let pos: [number, number] = [u.lon, u.lat];
      const rl = routeLines.find((x) => x.r.unit === u.id);
      if (rl && u.status === "enroute" && rl.r.progress != null) pos = rl.c[Math.round(Math.max(0, Math.min(1, rl.r.progress)) * 40)] ?? pos;
      let mk = unitMk.current.get(u.id);
      if (!mk) {
        const d = document.createElement("div");
        d.innerHTML = unitIcon(u.type);
        d.setAttribute("role", "button");
        d.tabIndex = 0;
        mk = { m: new lib.Marker({ element: d, anchor: "center" }).setLngLat(pos).addTo(map), d, id: u.id, kind: "u" };
        bindMk(mk);
        unitMk.current.set(u.id, mk);
      }
      mk.m.setLngLat(pos);
      if (!mk.d.classList.contains(s.unit!)) mk.d.classList.add(s.unit!);
      mk.d.style.setProperty("--c", T(unitColor[u.status] ?? "data-unit-standby"));
      mk.al = `${u.name}, ${t(`shell.unit_status.${u.status}`)}`;
      if (!mk.cl) mk.d.setAttribute("aria-label", mk.al);
    });
    unitMk.current.forEach((mk, id) => {
      if (!ku.has(id)) {
        mk.m.remove();
        unitMk.current.delete(id);
      }
    });
    bump.current();
  }, [map, p.fires, p.units, p.selFire, p.annotFire, layers.fires, layers.units, routeLines, bindMk, t]);

  /* ── 붙은 불 벌리기(목업 home spreadPins — 화면이 spreadFires 로 켤 때만) ──
     고리 상자(26)의 누르는 영역(44 + 2)이 겹치는 불을 한 무리로 묶어 꼬리들 위 한 줄로 올리고, 실제 자리엔 꼬리 점 + 고리까지 선.
     선이 40px 를 넘으면 가장 급한 고리는 제자리에 두고 나머지를 꼬리 둘레 40px 안 빈 자리로, 그것도 안 되면 대표 고리 + 개수(나머지는 꼬리 점만) */
  useEffect(() => {
    const m = mapRef.current;
    const el = wrap.current;
    if (!map || !m || !el) return;
    if (!p.spreadFires) return;
    const PIN = 26;
    const HALF = 13;
    const LIFT = 12;
    const HB = 46;
    const GAP = HB - PIN;
    const LEAD_MAX = 40;
    const W = el.clientWidth;
    const H = el.clientHeight;
    type Pin = { mk: Mk; x: number; y: number; hx: number; hy: number; mode: "" | "spread" | "rep" | "hid"; n: number };
    const list: Pin[] = [];
    fireMk.current.forEach((mk) => {
      if (!mk.d.isConnected) return;
      const q = m.project(mk.m.getLngLat());
      list.push({ mk, x: q.x, y: q.y, hx: q.x, hy: q.y, mode: "", n: 0 });
    });
    const sq = (q: Pin) => ({ l: q.hx - HB / 2, r: q.hx + HB / 2, t: q.hy - HB / 2, b: q.hy + HB / 2 });
    const ovl = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    const lay = (g: Pin[]) => {
      if (g.length === 1) {
        g[0]!.hx = g[0]!.x;
        g[0]!.hy = g[0]!.y;
        return;
      }
      g.sort((a, b) => a.x - b.x);
      const rowW = g.length * PIN + (g.length - 1) * GAP;
      const cx = g.reduce((s0, q) => s0 + q.x, 0) / g.length;
      const hy = Math.min(...g.map((q) => q.y)) - LIFT - HALF;
      const x0 = Math.max(PIN / 2 + 4, Math.min(W - rowW + PIN / 2 - 4, cx - rowW / 2 + PIN / 2));
      g.forEach((q, k) => {
        q.hx = x0 + k * (PIN + GAP);
        q.hy = hy;
      });
    };
    const clash = (a: Pin[], b: Pin[]) => a.some((x) => b.some((y) => ovl(sq(x), sq(y))));
    let groups: Pin[][] = list.map((q) => [q]);
    groups.forEach(lay);
    for (let it = 0; it < 40; it++) {
      let hit: [number, number] | null = null;
      for (let i = 0; i < groups.length && !hit; i++) for (let j = i + 1; j < groups.length; j++) if (clash(groups[i]!, groups[j]!)) { hit = [i, j]; break; }
      if (!hit) break;
      const g = [...groups[hit[0]]!, ...groups[hit[1]]!];
      groups = groups.filter((_, k) => k !== hit![0] && k !== hit![1]);
      lay(g);
      groups.push(g);
    }
    const fireOf = (id: string) => (pRef.current.fires ?? []).find((f) => f.id === id);
    const rank = (q: Pin) => {
      const f = fireOf(q.mk.id);
      return (pRef.current.selFire === q.mk.id ? 1000 : 0) + (f && !isClosedFire(f.status) ? 100 : 0) + (f?.status === "new" ? 10 : 0) + (f?.level ?? 0);
    };
    const inMap = (b: Box) => b.l >= 0 && b.r <= W && b.t >= 0 && b.b <= H;
    groups.forEach((g) => {
      if (g.length < 2) return;
      if (g.every((q) => Math.hypot(q.hx - q.x, q.hy - q.y) <= LEAD_MAX) && g.every((q) => inMap(sq(q)))) {
        g.forEach((q) => (q.mode = "spread"));
        return;
      }
      /* 가장 급한 고리는 제자리, 나머지는 꼬리 둘레 빈 자리 */
      const ps = g.slice().sort((a, b) => rank(b) - rank(a));
      ps.forEach((q) => {
        q.hx = q.x;
        q.hy = q.y;
      });
      const placed = [ps[0]!];
      let ok = true;
      for (const q of ps.slice(1)) {
        let got = false;
        for (let r = 4; r <= LEAD_MAX && !got; r += 4)
          for (let a = 0; a < 360 && !got; a += 15) {
            q.hx = q.x + Math.cos((a * Math.PI) / 180) * r;
            q.hy = q.y + Math.sin((a * Math.PI) / 180) * r;
            const b = sq(q);
            got = inMap(b) && !placed.some((o) => ovl(b, sq(o)));
          }
        if (!got) {
          ok = false;
          break;
        }
        placed.push(q);
      }
      if (ok) {
        g.forEach((q) => (q.mode = "spread"));
        return;
      }
      g.forEach((q) => {
        q.hx = q.x;
        q.hy = q.y;
        q.mode = q === ps[0] ? "rep" : "hid";
      });
      ps[0]!.n = g.length;
    });
    list.forEach((q) => {
      const d = q.mk.d;
      const dx = Math.round(q.hx - q.x);
      const dy = Math.round(q.hy - q.y);
      const moved = dx !== 0 || dy !== 0;
      q.mk.m.setOffset([dx, dy]);
      d.classList.toggle(s.spread!, moved);
      d.classList.toggle(s.sphid!, q.mode === "hid");
      d.dataset.spread = q.mode;
      let lead = d.querySelector<HTMLElement>(`.${s.splead}`);
      let tail = d.querySelector<HTMLElement>(`.${s.sptail}`);
      let badge = d.querySelector<HTMLElement>(`.${s.spn}`);
      if (q.mode === "rep") {
        if (!badge) {
          badge = document.createElement("b");
          badge.className = s.spn!;
          badge.setAttribute("aria-hidden", "true");
          d.insertBefore(badge, d.firstChild);
        }
        badge.textContent = String(q.n);
      } else badge?.remove();
      if (!moved && q.mode !== "hid") {
        lead?.remove();
        tail?.remove();
        return;
      }
      if (moved && !lead) {
        lead = document.createElement("i");
        lead.className = s.splead!;
        lead.setAttribute("aria-hidden", "true");
        d.insertBefore(lead, d.firstChild);
      }
      if (!moved) lead?.remove();
      if (!tail) {
        tail = document.createElement("i");
        tail.className = s.sptail!;
        tail.setAttribute("aria-hidden", "true");
        d.insertBefore(tail, d.firstChild);
      }
      if (moved && lead) {
        lead.style.width = `${Math.hypot(dx, dy).toFixed(1)}px`;
        lead.style.transform = `rotate(${((Math.atan2(-dy, -dx) * 180) / Math.PI).toFixed(1)}deg)`;
      }
      tail.style.left = `${PIN / 2 - dx}px`;
      tail.style.top = `${HALF - dy}px`;
    });
  }, [map, frame, p.spreadFires, p.fires, p.selFire, layers.fires]);
  useEffect(
    () => () => {
      fireMk.current.forEach((mk) => mk.m.remove());
      unitMk.current.forEach((mk) => mk.m.remove());
    },
    [],
  );

  /* ── 프레임마다: 자원 묶음 → 이름표 비키기 ── */
  const clusterKey = useRef("");
  useEffect(() => {
    const m = map;
    const el = wrap.current;
    if (!m || !el) return;
    const W = el.clientWidth, H = el.clientHeight;
    // 1) 자원 묶음(이동 중·고른 자원은 묶지 않는다)
    const us = pRef.current.units ?? [];
    const list = [...unitMk.current.values()].map((mk) => {
      const u = us.find((q) => q.id === mk.id);
      const pt = m.project(mk.m.getLngLat());
      return { id: mk.id, x: pt.x, y: pt.y, status: u?.status ?? "standby", free: u?.status === "enroute" || mk.id === selUnit.current, prev: mk.cl ? mk.cl[0] : null };
    });
    const groups = clusterUnits(list, 44);
    const key = groups.map((g) => g.rep + ":" + g.ids.join(",")).join(";");
    if (key !== clusterKey.current) {
      clusterKey.current = key;
      const repOf = new Map<string, { rep: string; ids: string[] }>();
      groups.forEach((g) => g.ids.forEach((id) => repOf.set(id, g)));
      unitMk.current.forEach((mk) => {
        const g = repOf.get(mk.id);
        const isRep = !!g && g.rep === mk.id;
        mk.d.classList.toggle(s.clhid!, !!g && !isRep);
        let badge = mk.d.querySelector<HTMLElement>(`.${s.cln}`);
        if (isRep) {
          mk.cl = g!.ids;
          const cnt: Record<string, number> = {};
          g!.ids.forEach((id) => {
            const st = us.find((q) => q.id === id)?.status ?? "standby";
            cnt[st] = (cnt[st] ?? 0) + 1;
          });
          const parts = ["onscene", "return", "standby"].filter((k) => cnt[k]).map((k) => `${t(`shell.unit_status.${k}`)} ${cnt[k]}`);
          mk.d.setAttribute("aria-label", t("shell.map.units_cl", { n: g!.ids.length, s: parts.join(", ") }));
          if (!badge) {
            badge = document.createElement("b");
            badge.className = s.cln!;
            badge.setAttribute("aria-hidden", "true");
            mk.d.appendChild(badge);
          }
          badge.textContent = String(g!.ids.length);
        } else {
          mk.cl = g ? [g.rep] : null;
          if (badge) badge.remove();
          if (mk.al) mk.d.setAttribute("aria-label", mk.al);
        }
      });
    }
    // 2) 이름표 비키기 — 장애물: 불·자원 표지, 떠 있는 지도 UI
    const er = el.getBoundingClientRect();
    const obs: Box[] = [];
    const add = (r: DOMRect, pad = 4) => {
      if (r.width < 1 || r.height < 1 || r.width * r.height > W * H * 0.5) return;
      obs.push({ l: r.left - er.left - pad, t: r.top - er.top - pad, r: r.right - er.left + pad, b: r.bottom - er.top + pad });
    };
    fireMk.current.forEach((mk) => {
      const pt = m.project(mk.m.getLngLat());
      obs.push({ l: pt.x - 20, t: pt.y - 20, r: pt.x + 20, b: pt.y + 20 });
      const lb = mk.d.lastElementChild as HTMLElement | null;
      if (lb && lb.offsetWidth && getComputedStyle(lb).display !== "none") add(lb.getBoundingClientRect(), 2);
    });
    unitMk.current.forEach((mk) => {
      if (mk.d.classList.contains(s.clhid!)) return;
      const pt = m.project(mk.m.getLngLat());
      obs.push({ l: pt.x - 13, t: pt.y - 13, r: pt.x + 13, b: pt.y + 13 });
    });
    uiEl.current?.querySelectorAll<HTMLElement>(":scope > *").forEach((c) => {
      if (c.dataset.noobs !== undefined || getComputedStyle(c).display === "none") return;
      add(c.getBoundingClientRect());
    });
    const z = m.getZoom();
    const showLbl = layers.labels;
    const items: LabelItem[] = [];
    labelMk.current.forEach((lm) => {
      const hide = !showLbl || (!!lm.river && (!layers.rivers || z < 8.6));
      lm.d.hidden = hide;
      if (lm.d.classList.contains(s.reg!)) lm.d.classList.toggle(s.hi!, (pRef.current.hiRegions ?? []).includes(lm.id));
      if (hide) return;
      if (!lm.w) {
        lm.w = lm.d.offsetWidth;
        lm.h = lm.d.offsetHeight;
      }
      if (!lm.w) return;
      items.push({ id: lm.id, w: lm.w, h: lm.h ?? 14, river: lm.river, pts: lm.pts.map((q) => m.project(q)) });
    });
    const place = new Map(placeLabels(items, obs, W, H, 6, p.iso3 === "KOR" ? 0 : 4).map((x) => [x.id, x.at]));
    labelMk.current.forEach((lm) => {
      if (lm.d.hidden) return;
      const at = place.get(lm.id) ?? null;
      const k = at ? at.join(",") : "x";
      lm.d.classList.toggle(s.dodged!, !at);
      if (lm.key === k || !at) {
        lm.key = k;
        return;
      }
      lm.key = k;
      lm.m.setLngLat(lm.pts[at[0]]!);
      lm.m.setOffset([at[1], at[2]]);
    });
  }, [map, frame, layers.labels, layers.rivers, p.iso3, t]);

  /* ── 지도 입력: 툴팁 · 지역 누르기 · 그리기 ── */
  const paintDraft = useCallback(() => {
    const d = draft.current;
    const F: unknown[] = [];
    const mode = drawRef.current;
    if (mode === "bbox" && d.a && d.b) {
      const [a, b] = [d.a, d.b];
      F.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[a[1], a[0]], [b[1], a[0]], [b[1], b[0]], [a[1], b[0]], [a[1], a[0]]]] } });
    }
    if (mode === "polygon" && d.pts.length) {
      const line = d.pts.map((q) => [q[1], q[0]]);
      if (d.cursor) line.push([d.cursor[1], d.cursor[0]]);
      if (line.length > 1) F.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } });
      d.pts.forEach((q, i) => F.push({ type: "Feature", properties: { first: i === 0 }, geometry: { type: "Point", coordinates: [q[1], q[0]] } }));
    }
    src("draft", fc(F));
  }, [src]);
  const cancelDraw = useCallback(() => {
    const m = mapRef.current;
    setDrawMode(null);
    drawRef.current = null;
    draft.current = { pts: [] };
    if (m) {
      m.dragPan.enable();
      m.doubleClickZoom.enable();
    }
    src("draft", fc([]));
  }, [src]);
  const finishDraw = useCallback(
    (a0: DrawnAoi) => {
      // 다각형: 두 번 누르기가 같은 자리에 더한 점 등 화면에서 4px 안으로 붙은 이웃 꼭짓점을 하나로
      const m = mapRef.current;
      const a: DrawnAoi =
        a0.type === "polygon" && m
          ? {
              type: "polygon",
              pts: a0.pts.filter((q, i, arr) => {
                if (!i) return true;
                const u = m.project([q[1], q[0]]), v = m.project([arr[i - 1]![1], arr[i - 1]![0]]);
                return Math.hypot(u.x - v.x, u.y - v.y) >= 4;
              }),
            }
          : a0;
      if (a.type === "polygon" && a.pts.length < 3) return;
      cancelDraw();
      setAoiOwn(a);
      pRef.current.onDraw?.(a);
    },
    [cancelDraw],
  );
  const startDraw = useCallback(
    (mode: DrawMode) => {
      const m = mapRef.current;
      if (!m) return;
      setPop(null);
      setTip(null);
      setDrawMode(mode);
      drawRef.current = mode;
      draft.current = { pts: [] };
      m.doubleClickZoom.disable();
      if (mode === "bbox") m.dragPan.disable();
      else m.dragPan.enable();
      paintDraft();
    },
    [paintDraft],
  );
  useEffect(() => {
    if (!map) return;
    const conf = (c?: string | null) => (c == null ? "–" : ({ l: t("shell.conf.low"), low: t("shell.conf.low"), n: t("shell.conf.nominal"), nominal: t("shell.conf.nominal"), h: t("shell.conf.high"), high: t("shell.conf.high") } as Record<string, string>)[c] ?? c);
    const onMove = (e: MapMouseEvent) => {
      const mode = drawRef.current;
      if (mode === "bbox" && draft.current.a) {
        draft.current.b = [e.lngLat.lat, e.lngLat.lng];
        paintDraft();
        return;
      }
      if (mode === "polygon") {
        draft.current.cursor = [e.lngLat.lat, e.lngLat.lng];
        paintDraft();
        return;
      }
      if (mode) return;
      const ids = ["hotpx", "hotpx-modis", "hotdot"].filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
      const f = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined;
      const h = f ? pRef.current.hotspots?.[Number(f.properties?.i)] : undefined;
      if (h) {
        map.getCanvas().style.cursor = "pointer";
        tipSrc.current = "hot";
        const px = h.sensor === "VIIRS" ? "375 m" : "1 km";
        setTip({ x: e.point.x, y: e.point.y, title: t("shell.map.hs_title", { s: h.sensor }), sub: [t("shell.map.hs_px", { px, frp: h.frp == null ? "–" : h.frp.toFixed(1) }), t("shell.map.hs_conf", { c: conf(h.conf), d: h.time ?? "" })] });
      } else {
        map.getCanvas().style.cursor = "";
        if (tipSrc.current === "hot") {
          tipSrc.current = null;
          setTip(null);
        }
      }
    };
    const begin = (lat: number, lng: number, x: number, y: number) => {
      draft.current = { pts: [], a: [lat, lng], b: [lat, lng], pa: [x, y] };
    };
    const end = (x: number, y: number) => {
      const d = draft.current;
      if (drawRef.current !== "bbox" || !d.a || !d.pa) return;
      const c = map.unproject([x, y]);
      const b: LatLon = [c.lat, c.lng];
      if (Math.abs(d.pa[0] - x) > 8 && Math.abs(d.pa[1] - y) > 8) finishDraw({ type: "bbox", north: Math.max(d.a[0], b[0]), south: Math.min(d.a[0], b[0]), west: Math.min(d.a[1], b[1]), east: Math.max(d.a[1], b[1]) });
      else {
        draft.current = { pts: [] };
        paintDraft();
      }
    };
    const onDown = (e: MapMouseEvent) => {
      if (drawRef.current !== "bbox") return;
      e.preventDefault();
      begin(e.lngLat.lat, e.lngLat.lng, e.point.x, e.point.y);
      // 손을 떼는 곳이 지도 위 안내·도구일 수도 있으니 창 전체에서 받는다
      const up = (ev: MouseEvent) => {
        window.removeEventListener("mouseup", up, true);
        const r = map.getCanvas().getBoundingClientRect();
        end(Math.max(0, Math.min(r.width, ev.clientX - r.left)), Math.max(0, Math.min(r.height, ev.clientY - r.top)));
      };
      window.addEventListener("mouseup", up, true);
    };
    const onTouchStart = (e: MapTouchEvent) => {
      if (drawRef.current !== "bbox" || e.points.length !== 1) return;
      e.preventDefault();
      begin(e.lngLat.lat, e.lngLat.lng, e.point.x, e.point.y);
    };
    const onTouchMove = (e: MapTouchEvent) => {
      if (drawRef.current !== "bbox" || !draft.current.a) return;
      e.preventDefault();
      draft.current.b = [e.lngLat.lat, e.lngLat.lng];
      draft.current.last = [e.point.x, e.point.y];
      paintDraft();
    };
    const onTouchEnd = () => {
      const last = draft.current.last;
      if (drawRef.current === "bbox" && last) end(last[0], last[1]);
    };
    const onClick = (e: MapMouseEvent) => {
      const mode = drawRef.current;
      if (mode === "bbox") return;
      if (mode === "polygon") {
        const pts = draft.current.pts;
        if (pts.length >= 3) {
          const f = map.project([pts[0]![1], pts[0]![0]]);
          if (Math.hypot(f.x - e.point.x, f.y - e.point.y) < 12) {
            finishDraw({ type: "polygon", pts: pts.slice() });
            return;
          }
        }
        pts.push([e.lngLat.lat, e.lngLat.lng]);
        paintDraft();
        return;
      }
      setPop(null);
      const on = pRef.current.onRegion;
      if (!on) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["reg-hit"] })[0];
      const id = f?.properties?.id;
      if (id) on(String(id));
    };
    const onDbl = (e: MapMouseEvent) => {
      const mode = drawRef.current;
      if (mode === "polygon" && draft.current.pts.length >= 3) {
        e.preventDefault();
        finishDraw({ type: "polygon", pts: draft.current.pts.slice() }); // 두 번 누르기가 더한 같은 자리 점은 finishDraw 가 합친다
      } else if (mode) e.preventDefault();
    };
    const onOut = () => setTip(null);
    map.on("mousemove", onMove);
    map.on("mousedown", onDown);
    map.on("touchstart", onTouchStart);
    map.on("touchmove", onTouchMove);
    map.on("touchend", onTouchEnd);
    map.on("click", onClick);
    map.on("dblclick", onDbl);
    map.on("mouseout", onOut);
    return () => {
      map.off("mousemove", onMove);
      map.off("mousedown", onDown);
      map.off("touchstart", onTouchStart);
      map.off("touchmove", onTouchMove);
      map.off("touchend", onTouchEnd);
      map.off("click", onClick);
      map.off("dblclick", onDbl);
      map.off("mouseout", onOut);
    };
  }, [map, finishDraw, paintDraft, t]);
  /* Esc: 그리기 취소 · 떠 있는 창 닫기 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drawRef.current) cancelDraw();
      setPop(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancelDraw]);

  /* ── 좌표·반경 창 ── */
  const ptBounds: Bbox = p.pointBounds ?? p.view ?? [-180, -90, 180, 90];
  const [pt, setPt] = useState({ lat: "", lon: "", r: "10" });
  const [ptErr, setPtErr] = useState<string | null>(null);
  const openPt = () => {
    if (pop === "pt") {
      setPop(null);
      return;
    }
    if (drawRef.current) cancelDraw();
    const m = mapRef.current;
    const c = m?.getCenter();
    const a = aoi?.type === "point" ? aoi : null;
    setPt({ lat: (a ? a.lat : (c?.lat ?? 0)).toFixed(3), lon: (a ? a.lon : (c?.lng ?? 0)).toFixed(3), r: String(a ? a.radius_km : 10) });
    setPtErr(null);
    setPop("pt");
  };
  const submitPt = () => {
    const lat = parseFloat(pt.lat), lon = parseFloat(pt.lon), rad = parseFloat(pt.r);
    const err = checkPoint(lat, lon, rad, ptBounds);
    if (err) {
      setPtErr(t(err.key, err.p));
      return;
    }
    setPop(null);
    const a: DrawnAoi = { type: "point", lat, lon, radius_km: rad };
    setAoiOwn(a);
    pRef.current.onDraw?.(a);
    const b = aoiBounds(a);
    mapRef.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 48, animate: !reduced(), duration: 500 });
  };

  /* ── 손잡이(화면이 부르는 명령) ── */
  useImperativeHandle(
    ref,
    (): MapCanvasHandle => ({
      map: () => mapRef.current,
      fit,
      startDraw,
      cancelDraw,
      project: (lat, lon) => {
        const m = mapRef.current;
        if (!m) return null;
        const q = m.project([lon, lat]);
        return [q.x, q.y];
      },
      fitBounds: (b, pad = 40) => mapRef.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, animate: !reduced(), duration: 500 }),
      flyTo: (lat, lon, zoom) => {
        const m = mapRef.current;
        if (m) m.easeTo({ center: [lon, lat], zoom: zoom ?? Math.max(m.getZoom(), 9.5), duration: reduced() ? 0 : 450 });
      },
      snapshot: (title) => {
        const m = mapRef.current;
        const el = wrap.current;
        if (!m || !el) return null;
        const T = tokReader();
        const srcCv = m.getCanvas();
        const w = el.clientWidth, h = el.clientHeight, dpr = srcCv.width / Math.max(1, w);
        const c = document.createElement("canvas");
        c.width = srcCv.width;
        c.height = srcCv.height + Math.round(44 * dpr);
        const x = c.getContext("2d");
        if (!x) return null;
        x.fillStyle = T("surface-0");
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(srcCv, 0, 0);
        x.scale(dpr, dpr);
        const P = pRef.current;
        if (layers.units)
          (P.units ?? []).forEach((u) => {
            const q = m.project([u.lon, u.lat]);
            x.fillStyle = T("marker-bg");
            x.strokeStyle = T(unitColor[u.status] ?? "data-unit-standby");
            x.lineWidth = 1.6;
            x.beginPath();
            x.roundRect(q.x - 9, q.y - 9, 18, 18, 2);
            x.fill();
            x.stroke();
          });
        if (layers.fires)
          (P.fires ?? []).forEach((f) => {
            const q = m.project([f.lon, f.lat]);
            const fm = fireMarkOf(f);
            const col = fm.state === "closed" ? T("text-3") : T(`alert-${fm.level}`);
            x.strokeStyle = T("map-halo");
            x.lineWidth = 4;
            x.beginPath();
            x.arc(q.x, q.y, 9, 0, Math.PI * 2);
            x.stroke();
            x.strokeStyle = col;
            x.fillStyle = col;
            x.lineWidth = 2;
            x.setLineDash(fm.state === "closed" ? [3, 2] : []);
            x.beginPath();
            x.arc(q.x, q.y, 9, 0, Math.PI * 2);
            x.stroke();
            x.setLineDash([]);
            if (fm.state === "live") {
              x.beginPath();
              x.arc(q.x, q.y, 3.75, 0, Math.PI * 2);
              x.fill();
            }
          });
        x.fillStyle = T("text-1");
        x.font = "600 13px 'Pretendard Variable', Pretendard, sans-serif";
        x.fillText(title || "Emberline", 14, h + 27);
        x.fillStyle = T("text-2");
        x.font = "12px 'Pretendard Variable', Pretendard, sans-serif";
        const at = attrEl.current?.textContent ?? "";
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC · " + at;
        x.fillText(stamp, Math.max(14, w - 14 - x.measureText(stamp).width), h + 27);
        return c;
      },
    }),
    [fit, startDraw, cancelDraw, layers.units, layers.fires],
  );

  /* ── 축척 · 출처 폭 맞춤 · 눈금 · 화면 밖 안내(프레임마다 다시 셈) ── */
  const geo = useMemo(() => {
    void frame;
    const m = map;
    if (!m) return null;
    const lat = m.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, m.getZoom()));
    return { scale: niceScale(mpp / 1000), b: m.getBounds(), z: m.getZoom() };
  }, [map, frame]);
  const demBox = dem?.bounds;
  const demInView = !!geo && (!demBox || (geo.b.getWest() < demBox[2] && geo.b.getEast() > demBox[0] && geo.b.getSouth() < demBox[3] && geo.b.getNorth() > demBox[1]));
  const attrVariants = useMemo(() => {
    // 한국 고해상 겹은 목록 minzoom(5) 부터 그려진다 — 그 아래 확대나 한국 밖은 전 세계 바탕(base) 원천을 적는다
    const kor = demOn && !!dem && demInView && (geo?.z ?? 0) >= (dem.minzoom ?? 5);
    const wld = !kor && demOn && !!dem?.base;
    const key = kor ? "attr_kr" : wld ? "attr_gl_dem" : "attr_gl";
    const full = kor ? t("shell.map.attr_kr_full") : wld ? t("shell.map.attr_gl_dem_full") : "Natural Earth v5.1.2 (public domain) · NASA FIRMS MODIS C6.1 · VIIRS 375 m";
    return { list: t(`shell.map.${key}`).split("|"), title: full };
  }, [demOn, dem, demInView, geo?.z, t]);
  const scW = geo?.scale.px ?? 0;
  useEffect(() => {
    const at = attrEl.current;
    const sc = scaleEl.current;
    if (!at) return;
    at.style.maxWidth = "";
    if (sc && sc.offsetParent) {
      const a = at.getBoundingClientRect(), b = sc.getBoundingClientRect();
      const room = Math.round(b.left - a.left - 8);
      if (b.width && b.top < a.bottom && b.bottom > a.top && room > 40) at.style.maxWidth = `${room}px`;
    }
    for (const v of attrVariants.list) {
      at.textContent = v;
      if (!at.clientWidth || at.scrollWidth <= at.clientWidth + 1) break;
    }
  }, [attrVariants, scW, frame]);

  const tickKey = JSON.stringify(p.ticks ?? false);
  /* 범례에 무엇을 보일지 — 지금 지도에 실제로 그린 층 */
  const shownCells = !!layers.cells && (cells ?? []).some((c) => c.value > 0);
  const shownPts = !!layers.heat && (hot ?? []).length > 0;
  const tickOpt: TickOpts | null = useMemo(() => {
    const v = JSON.parse(tickKey) as boolean | TickOpts;
    return v ? (typeof v === "object" ? v : {}) : null;
  }, [tickKey]);
  const ticks = useMemo(() => {
    const m = map;
    if (!tickOpt || !geo || !m || !size.w) return null;
    const w = size.w, h = size.h;
    const band = tickOpt.outside ? parseFloat(tokReader()("tick-band")) || 20 : 0;
    const sides = tickOpt.sides ?? (phone ? ["left", "top"] : ["top", "right", "bottom", "left"]);
    const has = (sd: string) => (sides as string[]).includes(sd);
    const b = geo.b;
    const st = tickStep(Math.max(0.01, b.getEast() - b.getWest()), phone);
    const step = tickOpt.step ?? st.step, minor = tickOpt.minor ?? st.minor;
    const k = Math.max(1, Math.round(step / minor));
    const out = tickOpt.outside ? -1 : 1;
    const ln: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const tx: { x: number; y: number; s: string; anchor?: "end"; rot?: boolean }[] = [];
    const midLat = (b.getNorth() + b.getSouth()) / 2, midLon = (b.getEast() + b.getWest()) / 2;
    for (let i = Math.floor(b.getWest() / minor); i <= Math.ceil(b.getEast() / minor) && ln.length < 400; i++) {
      const lon = i * minor, x0 = m.project([lon, midLat]).x;
      if (!(x0 >= 0 && x0 <= w)) continue;
      const x = Math.round(x0 + band) + 0.5, major = i % k === 0, len = major ? 8 : 4;
      if (has("top")) ln.push({ x1: x, x2: x, y1: band, y2: band - out * len });
      if (has("bottom")) ln.push({ x1: x, x2: x, y1: band + h, y2: band + h + out * len });
      if (major) {
        const s2 = tickLabel(lon, "lon", step);
        // 안쪽 눈금은 경도 글자를 위에 쓴다(아래는 출처·축척 자리) · 바깥 눈금은 목업처럼 아래
        if (tickOpt.outside ? has("bottom") : !has("top") && has("bottom")) tx.push({ x: x + 3, y: tickOpt.outside ? band + h + 15 : band + h - 10, s: s2 });
        else if (has("top")) tx.push({ x: x + 3, y: tickOpt.outside ? band - 6 : band + 19, s: s2 });
      }
    }
    for (let i = Math.floor(b.getSouth() / minor); i <= Math.ceil(b.getNorth() / minor) && ln.length < 800; i++) {
      const lat = i * minor, y0 = m.project([midLon, lat]).y;
      if (!(y0 >= 0 && y0 <= h)) continue;
      const y = Math.round(y0 + band) + 0.5, major = i % k === 0, len = major ? 8 : 4;
      if (has("left")) ln.push({ x1: band, x2: band - out * len, y1: y, y2: y });
      if (has("right")) ln.push({ x1: band + w, x2: band + w + out * len, y1: y, y2: y });
      if (major) {
        const s2 = tickLabel(lat, "lat", step);
        if (has("left")) tx.push(tickOpt.outside ? { x: band - 3, y: y - 3, s: s2, anchor: "end", rot: true } : { x: band + 11, y: y - 3, s: s2 });
        else if (has("right")) tx.push({ x: band + w - 11, y: y - 3, s: s2, anchor: "end" });
      }
    }
    return { W: w + band * 2, H: h + band * 2, ln, tx };
  }, [tickOpt, geo, phone, map, size]);

  const off = useMemo(() => {
    const m = map;
    const o = p.offView;
    if (!geo || !m || !size.w || !o || !o.pts.length) return false;
    const w = size.w, h = size.h;
    return !o.pts.some(([la, lo]) => {
      const q = m.project([lo, la]);
      return q.x >= 8 && q.y >= 8 && q.x <= w - 8 && q.y <= h - 8;
    });
  }, [geo, p.offView, map, size]);
  const goOff = () => {
    const o = p.offView;
    const m = mapRef.current;
    if (!o || !m) return;
    if (o.pts.length === 1) {
      m.easeTo({ center: [o.pts[0]![1], o.pts[0]![0]], duration: reduced() ? 0 : 450 });
      return;
    }
    const la = o.pts.map((q) => q[0]), lo = o.pts.map((q) => q[1]);
    m.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: 48, animate: !reduced(), duration: 500 });
  };
  const offText = useMemo(() => {
    const parts = t("home.offv.text", { a: "\u0000" }).split("\u0000");
    return [parts[0] ?? "", parts.slice(1).join("")];
  }, [t]);

  const tools = p.tools ?? [];
  const menu = p.layerMenu ?? [];

  return (
    <div
      ref={wrap}
      className={cls(s.map, tickOpt?.outside && s.ticksOut, drawMode && s.drawing, p.className)}
      data-testid={p.testId ?? "map-canvas"}
      data-ready={ready ? "1" : "0"}
      data-dem={dem ? "1" : "0"}
      data-draw={drawMode ?? ""}
      data-aoi={aoi ? JSON.stringify(aoi) : ""}
      data-n-hot={map ? String(hot?.length ?? 0) : ""}
      data-n-cells={map ? String(cells?.filter((c) => c.value > 0).length ?? 0) : ""}
    >
      <div ref={glEl} className={s.gl} />
      <MapLoading show={!ready} />
      {ticks ? (
        <svg className={s.mticks} aria-hidden="true" viewBox={`0 0 ${ticks.W} ${ticks.H}`}>
          {ticks.ln.map((l, i) => (
            <line key={i} {...l} />
          ))}
          {ticks.tx.map((q, i) => (
            <text key={`t${i}`} x={q.x} y={q.y} textAnchor={q.anchor} transform={q.rot ? `rotate(-90 ${q.x} ${q.y})` : undefined}>
              {q.s}
            </text>
          ))}
        </svg>
      ) : null}
      <div ref={uiEl} className={s.ui}>
        <PassLine iso3={p.iso3} />
        <div className={s.zoom}>
          <button type="button" data-z="1" aria-label={t("shell.map.zoom_in")} onClick={() => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + 0.7, duration: 300 })}>
            <Plus className={s.ic} aria-hidden="true" strokeWidth={1.9} />
          </button>
          <button type="button" data-z="-1" aria-label={t("shell.map.zoom_out")} onClick={() => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() - 0.7, duration: 300 })}>
            <Minus className={s.ic} aria-hidden="true" strokeWidth={1.9} />
          </button>
          <button type="button" data-z="0" aria-label={t("shell.map.fit")} onClick={fit}>
            <LocateFixed className={s.ic} aria-hidden="true" strokeWidth={1.9} />
          </button>
        </div>
        {geo ? (
          <div className={s.scale} ref={scaleEl} data-noobs="">
            <i style={{ width: geo.scale.px }} />
            <span>{geo.scale.text}</span>
          </div>
        ) : null}
        <div className={s.attrib} ref={attrEl} title={attrVariants.title} data-attrib="">
          {attrVariants.list[0]}
        </div>
        {tools.length ? (
          <div className={s.mtools} role="toolbar" aria-label={t("shell.map.tools")}>
            {tools.includes("layers") ? (
              <button type="button" data-mt="layers" aria-expanded={pop === "layers"} aria-haspopup="true" onClick={() => setPop(pop === "layers" ? null : "layers")}>
                <LayersIc className={s.ic} aria-hidden="true" strokeWidth={1.9} />
                <span>{t("shell.map.layers")}</span>
              </button>
            ) : null}
            {tools.includes("bbox") ? (
              <button type="button" data-mt="bbox" aria-pressed={drawMode === "bbox"} title={t("home.over.draw_a_box_on")} onClick={() => (drawMode === "bbox" ? cancelDraw() : startDraw("bbox"))}>
                <Square className={s.ic} aria-hidden="true" strokeWidth={1.9} />
                <span>{t("home.over.box")}</span>
              </button>
            ) : null}
            {tools.includes("polygon") ? (
              <button type="button" data-mt="polygon" aria-pressed={drawMode === "polygon"} title={t("home.over.draw_a_polygon_on")} onClick={() => (drawMode === "polygon" ? cancelDraw() : startDraw("polygon"))}>
                <Pentagon className={s.ic} aria-hidden="true" strokeWidth={1.9} />
                <span>{t("home.over.polygon")}</span>
              </button>
            ) : null}
            {tools.includes("point") ? (
              <button type="button" data-mt="pt" aria-expanded={pop === "pt"} aria-haspopup="dialog" title={t("home.over.set_by_latitude_longitude")} aria-label={t("home.over.set_area_by_point")} onClick={openPt}>
                <Crosshair className={s.ic} aria-hidden="true" strokeWidth={1.9} />
                <span>{t("home.over.point")}</span>
              </button>
            ) : null}
          </div>
        ) : null}
        {pop === "layers" ? (
          <div className={s.pop} role="group" aria-label={t("shell.map.layers")} data-pop="layers">
            {menu.map(({ k, label }) => (
              <label key={k}>
                <input type="checkbox" data-k={k} checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
        ) : null}
        {pop === "pt" ? (
          <form
            className={cls(s.pop, s.ptbox)}
            role="dialog"
            aria-label={t("home.close_pt.point_and_radius")}
            noValidate
            data-pop="pt"
            onSubmit={(e) => {
              e.preventDefault();
              submitPt();
            }}
          >
            <div className={s.ptH}>
              <b>{t("home.close_pt.point_and_radius")}</b>
            </div>
            <div className={s.ptRow}>
              <div className={s.field}>
                <label htmlFor="mcLat">{t("home.close_pt.lat_n")}</label>
                <input id="mcLat" className={s.input} inputMode="decimal" value={pt.lat} autoFocus onChange={(e) => setPt({ ...pt, lat: e.target.value })} />
              </div>
              <div className={s.field}>
                <label htmlFor="mcLon">{t("home.close_pt.lon_e")}</label>
                <input id="mcLon" className={s.input} inputMode="decimal" value={pt.lon} onChange={(e) => setPt({ ...pt, lon: e.target.value })} />
              </div>
              <div className={s.field}>
                <label htmlFor="mcRad">{t("home.close_pt.radius_km")}</label>
                <input id="mcRad" className={s.input} inputMode="decimal" value={pt.r} onChange={(e) => setPt({ ...pt, r: e.target.value })} />
              </div>
            </div>
            {ptErr ? (
              <p className={s.ptErr} role="alert" data-pterr="">
                {ptErr}
              </p>
            ) : null}
            <div className={s.ptF}>
              <button type="button" className={s.btn} onClick={() => setPop(null)}>
                {t("home.close_pt.cancel")}
              </button>
              <button type="submit" className={cls(s.btn, s.btnPrimary)}>
                {t("home.close_pt.apply")}
              </button>
            </div>
          </form>
        ) : null}
        {drawMode ? (
          <div className={s.drawhint} role="status" data-noobs="">
            {t(drawMode === "polygon" ? "shell.map.draw_poly" : "shell.map.draw_box")}
          </div>
        ) : null}
        {off && p.offView ? (
          <div className={s.offv} role="status" data-offv="">
            <span>
              {offText[0]}
              <b>{p.offView.label}</b>
              {offText[1]}
            </span>
            <button type="button" className={s.btn} onClick={goOff}>
              {t("home.offv.go")}
            </button>
          </div>
        ) : null}
        {/* 범례 하나(표시 규칙서 R7): 칸이 있으면 칸 단계(1° = L1 · 0.1° = L2), 점만 있으면 점(L3).
            감지 지도(cells 를 받는 지도)는 그린 것이 없어도 범례를 둔다 — 몰디브처럼 감지 0 인 나라만 범례가 사라지지 않게(R7 · R11) */}
        {map && (shownCells || shownPts || p.cells !== undefined) && p.mapKey !== false ? (
          <MapKey level={shownCells ? ((cells ?? []).find((c) => c.value > 0)?.size ?? 0.1) >= 1 ? "L1" : "L2" : shownPts ? "L3" : ((cells ?? [])[0]?.size ?? 1) >= 1 ? "L1" : "L2"} win={p.keyWin ?? p.cellsKey ?? null} nPts={shownPts ? (hot ?? []).length : null} lift={p.keyLift ?? (p.status ? 72 : 24)} />
        ) : null}
        {p.status ? (
          <div className={s.state} role="status">
            {p.status}
          </div>
        ) : null}
        {p.children}
      </div>
      {tip ? (
        <div className={s.tipbox} style={{ left: Math.min(tip.x, (size.w || 600) - 260), top: tip.y }} role="tooltip">
          <b>{tip.title}</b>
          {tip.sub.map((x, i) => (
            <div key={i} className={s.sub}>
              {x}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
