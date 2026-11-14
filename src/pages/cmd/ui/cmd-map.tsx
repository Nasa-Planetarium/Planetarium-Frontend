"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { boundaryQuery, type CountryInfo } from "@/entities/country";
import type { Fire } from "@/shared/agency";
import { ids, SEASON_MONTHS, cellVal, years } from "../model/cmd";
import type { Ctx } from "./cmd-page";
import { cx } from "./cx";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
const tok = (n: string) => (typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim());
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });
function niceLen(maxM: number) {
  const p = Math.pow(10, Math.floor(Math.log10(maxM)));
  let best = p;
  [1, 2, 5].forEach((n) => {
    if (n * p <= maxM) best = n * p;
  });
  return best;
}

/**
 * 관측 밀도 지도 — MapLibre 2D(결정 F9: 점은 원). 목업 map3d 의 평면 몫:
 * 바탕(map-void) + 나라 경계 · 관측 점(원, 색 = 열 램프 · 겹침은 투명도) · 과거 대형 산불 표지(점선 고리) · 시군 이름 · 확대/축소/전체 · 축척 · 출처 · 범례.
 * 점 = 실제 감지 점(GET /hotspots, 고른 해 · 고른 범위 — 계절·신뢰도·FRP 거름만). 누적(2001–2026)은 점 창이 100여 번이라 받지 않고
 * 행 지역마다 원 하나(넓이 = 그 기간 보정 지표 합, 실제 달 값 합). 넓은 범위(100 제곱도 초과)는 점을 내지 않는다(실서버 제한) — 안내 칩.
 */
export function CmdMap(c: Ctx & { hist: Fire[] }) {
  const { board, q, view, T_, kor, iso3, pts } = c;
  const glEl = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [frame, setFrame] = useState(0);
  const { data: boundary } = useQuery(boundaryQuery(iso3));
  const info = c.info as (CountryInfo & { bbox_main?: [number, number, number, number] }) | undefined;

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    let made: MlMap | null = null;
    void import("maplibre-gl").then((ml) => {
      if (dead || !glEl.current) return;
      const m = new ml.Map({
        container: glEl.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": tok("map-void") || "#070605" } }] },
        center: [128.7, 36.6],
        zoom: 8,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      made = m;
      m.touchZoomRotate.disableRotation();
      m.on("load", () => {
        m.addSource("bounds", { type: "geojson", data: fc([]) });
        m.addSource("hot", { type: "geojson", data: fc([]) });
        m.addSource("hist", { type: "geojson", data: fc([]) });
        m.addSource("sum", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "bounds-fill", type: "fill", source: "bounds", paint: { "fill-color": tok("surface-1"), "fill-opacity": 0.55 } });
        m.addLayer({ id: "bounds-line", type: "line", source: "bounds", paint: { "line-color": tok("text-3"), "line-width": 1, "line-opacity": 0.6 } });
        m.addLayer({
          id: "hot",
          type: "circle",
          source: "hot",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 8, 2.6, 11, 4],
            "circle-color": ["interpolate", ["linear"], ["get", "frp"], 0, tok("h3"), 30, tok("h4"), 90, tok("h5"), 200, tok("h6")],
            "circle-opacity": 0.55,
            "circle-blur": 0.2,
          },
        });
        m.addLayer({
          id: "sum",
          type: "circle",
          source: "sum",
          paint: { "circle-radius": ["get", "r"], "circle-color": tok("h4"), "circle-opacity": 0.42, "circle-stroke-color": tok("h5"), "circle-stroke-width": 1 },
        });
        m.addLayer({ id: "hist", type: "circle", source: "hist", paint: { "circle-radius": 9, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": tok("alert-4"), "circle-stroke-width": 2.5 } });
        setMap(m);
      });
      m.on("move", () => setFrame((n) => n + 1));
      ro = new ResizeObserver(() => {
        m.resize();
        setFrame((n) => n + 1);
      });
      ro.observe(glEl.current);
    });
    return () => {
      dead = true;
      ro?.disconnect();
      made?.remove();
    };
  }, []);

  /* 맞춤: 고른 범위 상자(실서버 /aois bbox) — 나라 전체면 본토 범위 */
  const sb = c.scope.scopeRec?.bbox;
  const bb = useMemo((): [number, number, number, number] | null => {
    if (sb && sb.length === 4 && c.scope.scope !== c.scope.own) return sb as [number, number, number, number];
    if (kor && sb && sb.length === 4) return sb as [number, number, number, number];
    return info?.bbox_main ?? info?.bbox ?? null;
  }, [sb, kor, info, c.scope.scope, c.scope.own]);
  const fit = () => {
    if (map && bb) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 24, animate: false });
  };
  const fitKey = bb ? bb.join(",") : "";
  const lastFit = useRef("");
  useEffect(() => {
    if (!map || !bb || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 24, animate: false });
  }, [map, bb, fitKey]);

  useEffect(() => {
    if (!map || !boundary) return;
    (map.getSource("bounds") as GeoJSONSource | undefined)?.setData(((boundary as { geometry?: unknown }).geometry ?? boundary) as GeoData);
  }, [map, boundary]);

  /* 누적: 행마다 실제 달 값 합(계절·지표 따름) → 원 넓이 */
  const sums = useMemo(() => {
    if (!board || !view.cum) return [];
    const ms = SEASON_MONTHS[q.season];
    const rows = ids(board, q.regions)
      .map((id) => {
        const r = board.regions.find((x) => x.id === id);
        let t = 0;
        years(board.cm).forEach((y) => ms.forEach((m) => (t += cellVal(board, id, y, m, q.sensor) ?? 0)));
        return r ? { lat: r.lat, lon: r.lon, v: t } : null;
      })
      .filter((x): x is { lat: number; lon: number; v: number } => !!x && x.v > 0);
    const mx = Math.max(1, ...rows.map((x) => x.v));
    return rows.map((x) => ({ ...x, r: 4 + 26 * Math.sqrt(x.v / mx) }));
  }, [board, view.cum, q]);
  const histShown = useMemo(() => (view.cum ? c.hist : c.hist.filter((f) => +f.detected_at.slice(0, 4) === view.year)), [c.hist, view.cum, view.year]);
  useEffect(() => {
    if (!map) return;
    (map.getSource("hot") as GeoJSONSource | undefined)?.setData(fc(view.cum ? [] : pts.map((p) => ({ type: "Feature", properties: { frp: p.frp }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }))) as GeoData);
    (map.getSource("sum") as GeoJSONSource | undefined)?.setData(fc(sums.map((p) => ({ type: "Feature", properties: { r: p.r }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }))) as GeoData);
    (map.getSource("hist") as GeoJSONSource | undefined)?.setData(fc(histShown.map((f) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [f.lon, f.lat] } }))) as GeoData);
  }, [map, pts, histShown, sums, view.cum]);

  /* 행 지역 이름(40곳 이하) — 지도 좌표를 화면 좌표로 */
  const labels = useMemo(() => {
    void frame;
    if (!map || !board || board.regions.length > 40) return [];
    return board.regions.map((r) => {
      const p = map.project([r.lon, r.lat]);
      return { id: r.id, x: p.x, y: p.y, name: c.names[r.id] ?? r.id };
    });
  }, [map, board, frame, c.names]);
  const scale = useMemo(() => {
    void frame;
    if (!map) return null;
    const lat = map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, map.getZoom()));
    const m = niceLen(mpp * 110);
    return { px: m / mpp, text: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  }, [map, frame]);

  return (
    <div className={cx("cm-map map")} data-testid="cmd-map" data-scroll="stage">
      <div ref={glEl} className={cx("gl")} />
      {labels.map((l) => (
        <span key={l.id} className={cx("m-lbl")} style={{ left: l.x, top: l.y }}>
          {l.name}
        </span>
      ))}
      {!view.cum && c.ptsState !== "ok" ? (
        <p className={cx("m-note")} role="status" data-pts={c.ptsState}>
          {c.ptsState === "wide" ? T_("cmd.real.pts_wide") : c.ptsState === "pending" ? T_("cmd.real.loading") : T_("shell.err.data_not_loaded")}
        </p>
      ) : null}
      <div className={cx("map-ui")}>
        <div className={cx("zoom")}>
          <button type="button" data-z="1" aria-label={T_("shell.map.zoom_in")} onClick={() => map?.zoomIn()}>
            <Plus aria-hidden="true" />
          </button>
          <button type="button" data-z="-1" aria-label={T_("shell.map.zoom_out")} onClick={() => map?.zoomOut()}>
            <Minus aria-hidden="true" />
          </button>
          <button type="button" data-z="fit" aria-label={T_("shell.map.fit")} onClick={fit}>
            <LocateFixed aria-hidden="true" />
          </button>
        </div>
        <div className={cx("map-key")}>
          <b>{T_("cmd.ui.hotspot_density")}</b>
          <span>
            <i className={cx("ramp")} />
            {T_("cmd.ui.low_high")}
          </span>
          {kor ? (
            <span>
              <i style={{ background: "transparent", border: "2px dotted var(--alert-4)", borderRadius: "50%" }} />
              {T_("cmd.ui.past_major_fire")}
            </span>
          ) : null}
        </div>
        <div className={cx("attrib")}>{(kor ? T_("shell.map.attr_kr") : T_("shell.map.attr_gl")).split("|")[0]}</div>
        {scale ? (
          <div className={cx("scale")}>
            <i style={{ width: scale.px }} />
            {scale.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
