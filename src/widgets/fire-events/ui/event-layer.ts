"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import { eventBox, type FireEvent } from "@/entities/fire-event";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features }) as GeoData;
const SRC_BOX = "fev-box";
const SRC_PT = "fev-pt";
const LAYERS = ["fev-box-fill", "fev-box-line", "fev-pt"] as const;

/** 색은 토큰(CSS 변수)에서 읽는다 — 소실 범위 층(land-map burn-*)과 같은 열 단계 */
const tok = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim();

function ensure(m: MlMap) {
  if (m.getSource(SRC_BOX)) return;
  m.addSource(SRC_BOX, { type: "geojson", data: fc([]) });
  m.addSource(SRC_PT, { type: "geojson", data: fc([]) });
  m.addLayer({ id: "fev-box-fill", type: "fill", source: SRC_BOX, paint: { "fill-color": tok("h4"), "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.28, 0.1] } });
  m.addLayer({ id: "fev-box-line", type: "line", source: SRC_BOX, paint: { "line-color": ["case", ["==", ["get", "sel"], 1], tok("h6"), tok("h5")], "line-width": ["case", ["==", ["get", "sel"], 1], 2.4, 1.2] } });
  m.addLayer({
    id: "fev-pt",
    type: "circle",
    source: SRC_PT,
    paint: {
      "circle-radius": ["get", "r"],
      "circle-color": tok("h4"),
      "circle-opacity": 0.85,
      "circle-stroke-color": ["case", ["==", ["get", "sel"], 1], tok("text-1"), tok("map-halo")],
      "circle-stroke-width": ["case", ["==", ["get", "sel"], 1], 2.2, 1],
    },
  });
}

/**
 * 공통 지도(widgets/map-canvas) 위에 화재 사건 층을 얹는다 — 모델팀 표시 규칙 「지도에는 상자 또는 중심 원으로」(api_contract /events).
 * 상자 = 감지 점 상자(lat/lon min·max, 넓이 0 이면 그리지 않음) · 원 = 중심(centroid), 크기 = 감지 수(로그).
 * getMap 은 지도 손잡이(MapCanvasHandle.map). 지도가 아직 없으면 잠깐씩 다시 본다. 누르면 onPick(event_id).
 */
export function useEventLayer(getMap: (() => MlMap | null) | null, events: readonly FireEvent[], selId: string | null, onPick?: (id: string) => void, show = true) {
  const [map, setMap] = useState<MlMap | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!getMap) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (stop) return;
      const m = getMap();
      if (m && m.isStyleLoaded()) {
        ensure(m);
        const click = (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) pick.current?.(id);
        };
        m.on("click", "fev-pt", click);
        m.on("click", "fev-box-fill", click);
        setMap(m);
        return;
      }
      timer = setTimeout(tick, 250);
    };
    tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [getMap]);

  useEffect(() => {
    if (!map || !map.getSource(SRC_BOX)) return;
    const E = show ? events : [];
    (map.getSource(SRC_BOX) as GeoJSONSource).setData(
      fc(
        E.flatMap((e) => {
          const b = eventBox(e);
          return b ? [{ type: "Feature", properties: { id: e.event_id, sel: e.event_id === selId ? 1 : 0 }, geometry: { type: "Polygon", coordinates: [[...b.map(([la, lo]) => [lo, la]), [b[0]![1], b[0]![0]]]] } }] : [];
        }),
      ),
    );
    (map.getSource(SRC_PT) as GeoJSONSource).setData(
      fc(
        E.map((e) => ({
          type: "Feature",
          properties: { id: e.event_id, sel: e.event_id === selId ? 1 : 0, r: Math.min(14, 3.5 + 2.2 * Math.log10(Math.max(1, e.n_det))) },
          geometry: { type: "Point", coordinates: [e.centroid_lon, e.centroid_lat] },
        })),
      ),
    );
    LAYERS.forEach((id) => map.getLayer(id) && map.moveLayer(id));
  }, [map, events, selId, show]);
}
