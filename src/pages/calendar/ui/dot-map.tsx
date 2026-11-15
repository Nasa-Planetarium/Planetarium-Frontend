"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useLocale } from "next-intl";
import { Minus, Play, Plus, Square, Target, X } from "lucide-react";
import { useT } from "@/shared/i18n";
import {
  boundsOf,
  CELL_OPACITY,
  DOT_AGE_OPACITY,
  DOT_EDGE_TOKEN,
  DOT_TOKEN,
  dotRadiusExpr,
  FIT_PADDING,
  islandMarkers,
  lonInFit,
  radiusExpr,
  STATIC_TOKEN,
  stepColorExpr,
  stepOfCell,
  tokVal,
  useStepColors,
  type Box,
  type Level,
  type LL,
  type MapStatusKind,
} from "@/shared/lib/display";
import { MapKey, MapLoading, MapStatus } from "@/shared/ui";
import type { MonthPoints } from "../api/queries";
import { fmtLat, fmtLon, fmtNum, kst, SAT_NAME } from "../model/calendar";
import { cx } from "./cx";

/**
 * 점(원) 지도(목업 pages/calendar-dots.js · 결정 F9 · F10 ④ · 표시 규칙서 2026-11-15). MapLibre 2D(기울기·회전 없음).
 * 무엇을 그릴지는 쓰는 쪽(CalMap)이 지금 시야 넓이로 고른 단계(R1)로 정한다 — 이 지도는 시야를 알려 주고(onView) 받은 것을 같은 규칙으로 그린다.
 *  - 칸 원(L1 1° · L2 0.1°): 색 = 0.1° 칸당 월 감지량 5단계(R3·R4), 크기 = 화면 px 규칙(R5), 불투명도 0.85 하나.
 *  - 감지 점(L3): 한 색 + 어두운 테두리(R6), 나이는 불투명도(최근 24시간 1 · 그 앞 .55), 산업 열원은 회색 빈 점(개수 제외).
 *  - 범례 MapKey · 상태 줄 MapStatus 는 모든 지도와 같은 부품(R7 · R11). 섬 표지는 지금 줌 기준(R10).
 */
export interface DotCell {
  lon: number;
  lat: number;
  value: number;
  valueText: string;
  extra: string;
}
export interface DotMapProps {
  cells: DotCell[];
  size: number;
  outlines: number[][][];
  pts: MonthPoints | null;
  level: Level | null;
  focus: [number, number, number, number] | null;
  label: string;
  /** 시야가 바뀌면(끌기·확대 뒤 300ms) 상자와 줌 */
  onView: (box: Box, zoom: number) => void;
  status: { kind: MapStatusKind | null; tail?: string | null; vars?: Record<string, string | number> };
  /** 범례 시간 창(「2025년 3월」) */
  win: string;
  extra?: React.ReactNode;
}

const RECENT = 24 * 60;
type Pop = { lng: number; lat: number; kind: "pt" | "cell"; i: number } | null;
const DEF_FIT: LL = [
  [124, 33],
  [131, 39],
];

/* 고른 지역 바깥 가림막: 세계 상자에서 고른 지역 고리를 구멍으로(구멍은 바깥 고리와 반대 방향 — MapLibre 는 감김 방향으로 구멍을 가른다) */
const area2 = (r: number[][]) => r.reduce((s, p, i) => s + (p[0] as number) * ((r[(i + 1) % r.length] as number[])[1] as number) - ((r[(i + 1) % r.length] as number[])[0] as number) * (p[1] as number), 0);
function maskOf(rings: number[][][]) {
  /* 바깥 고리는 ±180 안(세계 사본을 넘으면 타일 자르기가 고리를 쪼개 구멍이 사라진다) */
  const outer = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  const holes = rings.filter((r) => r.length >= 3).map((r) => (area2(r) > 0 ? [...r].reverse() : r));
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [outer, ...holes] } };
}

export function DotMap(o: DotMapProps) {
  const t = useT();
  const T = (k: string, v?: Record<string, string | number>) => t(`calendar.dm.${k}`, v);
  const lang = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [zoom, setZoom] = useState(0);
  const [, setFrame] = useState(0);
  const k = o.pts && o.pts.n ? o.pts : null;
  const tmin = useMemo(() => (k ? Math.min(...k.t) : 0), [k]);
  const tmax = useMemo(() => (k ? Math.max(...k.t) : 0), [k]);
  const [cur, setCur] = useState<number | null>(null);
  const tNow = cur ?? tmax;
  const [playing, setPlaying] = useState(false);
  const colors = useStepColors();

  /* 윤곽이 없을 때만 칸으로 맞춘다 — 칸이 바뀔 때마다(끌기 · 달 바꿈) 다시 맞추지 않게 */
  const cellsSeed = !o.outlines.length && o.cells.length > 0;
  const fit = useMemo<LL>(() => {
    if (o.focus) return boundsOf([[o.focus[0], o.focus[1]], [o.focus[2], o.focus[3]]], 0.02) ?? DEF_FIT;
    const outPts: number[][] = [];
    o.outlines.forEach((r) => r.forEach((q) => outPts.push(q)));
    const cellPts = o.cells.map((c) => [c.lon, c.lat]);
    return boundsOf(outPts.length ? outPts : cellPts, o.size * 0.6) ?? DEF_FIT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.focus, o.outlines, cellsSeed]);

  /* 맞춘 범위가 늦게 바뀌면(나라 윤곽이 지도보다 늦게 도착 · 달이 바뀌어 사례 초점이 바뀜) 다시 맞춘다 — 사용자가 지도를 움직이기 전까지만(PR #15) */
  const touched = useRef(false);
  const fitKey = fit.flat().map((v) => v.toFixed(3)).join(",");
  useEffect(() => {
    if (!map || touched.current) return;
    map.fitBounds(fit, { padding: FIT_PADDING, duration: 0 });
    // fit 은 fitKey 로 비교(배열 정체성 말고 값)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);

  /* 시야 알리기(끌기·확대가 끝난 뒤 300ms) — 단계(R1)와 받을 타일(R2)은 쓰는 쪽이 고른다 */
  const onView = useRef(o.onView);
  useEffect(() => {
    onView.current = o.onView;
  }, [o.onView]);
  useEffect(() => {
    if (!map) return;
    let id = 0;
    const send = () => {
      window.clearTimeout(id);
      id = window.setTimeout(() => {
        const b = map.getBounds();
        onView.current([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
        setZoom(map.getZoom());
      }, 300);
    };
    send();
    map.on("moveend", send);
    return () => {
      window.clearTimeout(id);
      map.off("moveend", send);
    };
  }, [map]);

  /* 섬 표지(R10): 지금 줌에서 4px 미만 고리만, 본토가 보이면 0 · 고른 쪽 경도 */
  const islands = useMemo(() => {
    if (!map) return [] as [number, number][];
    return islandMarkers(o.outlines, (lon, lat) => {
      const p = map.project([lon, lat]);
      return [p.x, p.y] as const;
    }, (lon) => lonInFit(lon, fit));
    // zoom 이 바뀌면 다시 잰다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, o.outlines, fit, zoom]);

  /* 지도(한 번) */
  useEffect(() => {
    let dead = false;
    let made: MlMap | null = null;
    let ro: ResizeObserver | null = null;
    void import("maplibre-gl").then((ml) => {
      if (dead || !host.current) return;
      const empty = { type: "FeatureCollection" as const, features: [] };
      const m = new ml.Map({
        container: host.current,
        attributionControl: false,
        bounds: fit,
        fitBoundsOptions: { padding: FIT_PADDING },
        maxZoom: 13,
        minZoom: 1,
        pitch: 0,
        bearing: 0,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        style: {
          version: 8,
          sources: {
            land: { type: "geojson", data: "/geo/world.json" },
            outf: { type: "geojson", data: empty },
            outl: { type: "geojson", data: empty },
            mask: { type: "geojson", data: empty },
            isl: { type: "geojson", data: empty },
            cells: { type: "geojson", data: empty },
            pts: { type: "geojson", data: empty },
          },
          /* 층 순서: 바다 → 땅 → 경계 → 자료 층 → 가림막(고른 지역 밖) */
          layers: [
            { id: "bg", type: "background", paint: { "background-color": tokVal("map-sea") } },
            { id: "land", type: "fill", source: "land", paint: { "fill-color": tokVal("map-land") } },
            /* 고른 지역의 자세한 윤곽(outl 과 같은 고리)으로 육지를 한 번 더 채운다 — 단순한 world.json 면 밖으로 윤곽선이 삐져나가거나
               world.json 에 없는 작은 섬이 선만 남는 것을 막는다(PR #11) */
            { id: "outf", type: "fill", source: "outf", paint: { "fill-color": tokVal("map-land") } },
            { id: "outl", type: "line", source: "outl", paint: { "line-color": tokVal("map-boundary"), "line-opacity": 0.5, "line-width": 0.8 } },
            { id: "isl", type: "circle", source: "isl", paint: { "circle-radius": 4, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 1, "circle-stroke-color": tokVal("map-boundary"), "circle-stroke-opacity": 0.8 } },
            { id: "cells", type: "circle", source: "cells", paint: { "circle-radius": 2, "circle-opacity": CELL_OPACITY, "circle-stroke-width": 0.5, "circle-stroke-color": tokVal("map-land"), "circle-stroke-opacity": 0.7 } },
            { id: "pts-static", type: "circle", source: "pts", filter: ["==", ["get", "s"], 1], paint: { "circle-radius": dotRadiusExpr() as never, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 1.2, "circle-stroke-color": tokVal(STATIC_TOKEN) } },
            { id: "pts", type: "circle", source: "pts", filter: ["==", ["get", "s"], 0], paint: { "circle-radius": dotRadiusExpr() as never, "circle-color": tokVal(DOT_TOKEN), "circle-stroke-width": 0.75, "circle-stroke-color": tokVal(DOT_EDGE_TOKEN) } },
            /* 가림막(R2): 고른 지역 밖을 흐리게 — 자료 층 위에 두어 이웃 나라 칸·점도 같이 흐려진다(고른 지역 칸과 같은 진하기로 보이지 않게) */
            { id: "mask", type: "fill", source: "mask", paint: { "fill-color": tokVal("map-mask"), "fill-opacity": 0.6 } },
          ],
        },
      });
      made = m;
      m.touchZoomRotate.disableRotation();
      m.on("load", () => setMap(m));
      m.on("move", () => setFrame((n) => n + 1));
      /* 사용자가 직접 움직이면(끌기·확대 — originalEvent 있음) 그 뒤로는 자동으로 다시 맞추지 않는다 */
      m.on("movestart", (e) => {
        if ((e as { originalEvent?: unknown }).originalEvent) touched.current = true;
      });
      ro = new ResizeObserver(() => m.resize());
      ro.observe(host.current);
    });
    return () => {
      dead = true;
      ro?.disconnect();
      made?.remove();
    };
    // 지도는 한 번만 만든다(달이 바뀌면 위 fitKey 효과가 범위만 다시 맞춘다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 달(점 자료)이 바뀌면 재생 위치·팝업을 처음으로 */
  const [seenK, setSeenK] = useState(k);
  if (seenK !== k) {
    setSeenK(k);
    setCur(null);
    setPlaying(false);
    setPop(null);
  }

  /* 윤곽 · 가림막 */
  useEffect(() => {
    if (!map) return;
    /* 날짜 변경선 나라는 고른 쪽 경도로(표지·칸과 같은 쪽, R10) */
    const ol = o.outlines.map((r) => r.map((q) => [lonInFit(q[0] as number, fit), q[1] as number]));
    (map.getSource("outl") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: ol.length ? [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: ol } }] : [] });
    /* 같은 고리를 면으로(닫힌 고리 · 점 3개 미만은 뺀다) */
    const closed = ol.filter((r) => r.length >= 3).map((r) => {
      const a = r[0] as number[];
      const z = r[r.length - 1] as number[];
      return a[0] === z[0] && a[1] === z[1] ? r : [...r, a];
    });
    (map.getSource("outf") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: closed.length ? [{ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: closed.map((r) => [r]) } }] : [] });
    (map.getSource("mask") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: closed.length ? [maskOf(closed)] : [] });
  }, [map, o.outlines, fit]);
  useEffect(() => {
    if (!map) return;
    (map.getSource("isl") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: islands.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } })) });
  }, [map, islands]);

  /* 칸 원: 단계 k = 0.1° 칸당 값(R3) · 크기 = 화면 px 규칙(R5) · 색 = 5색(R4) */
  const { cells, size } = o;
  useEffect(() => {
    if (!map) return;
    (map.getSource("cells") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: cells.flatMap((c, i) => {
        const kk = stepOfCell(c.value, size);
        return kk == null ? [] : [{ type: "Feature" as const, id: i, properties: { i, k: kk }, geometry: { type: "Point" as const, coordinates: [lonInFit(c.lon, fit), c.lat] } }];
      }),
    });
    map.setPaintProperty("cells", "circle-radius", radiusExpr(size) as never);
    map.setPaintProperty("cells", "circle-color", stepColorExpr(colors) as never);
  }, [map, cells, size, colors, fit]);

  /* 감지 점 */
  useEffect(() => {
    if (!map) return;
    const f = k ? k.la.map((la, i) => ({ type: "Feature" as const, id: i, properties: { i, t: k.t[i], frp: Math.max(0, k.frp[i] as number), s: k.st?.[i] ? 1 : 0 }, geometry: { type: "Point" as const, coordinates: [lonInFit(k.lo[i] as number, fit), la] } })) : [];
    (map.getSource("pts") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: f });
  }, [map, k, fit]);
  useEffect(() => {
    if (!map || !k) return;
    map.setFilter("pts", ["all", ["==", ["get", "s"], 0], ["<=", ["get", "t"], tNow]]);
    map.setFilter("pts-static", ["all", ["==", ["get", "s"], 1], ["<=", ["get", "t"], tNow]]);
    map.setPaintProperty("pts", "circle-opacity", ["case", ["<", ["-", tNow, ["get", "t"]], RECENT], DOT_AGE_OPACITY[0], DOT_AGE_OPACITY[1]]);
  }, [map, k, tNow]);

  /* 재생: 3시간씩 90ms 마다 */
  const curRef = useRef(tNow);
  useEffect(() => {
    curRef.current = tNow;
  }, [tNow]);
  useEffect(() => {
    if (!playing || !k) return;
    const id = window.setInterval(() => {
      const v = curRef.current + 180;
      if (v >= tmax) {
        setCur(tmax);
        setPlaying(false);
      } else setCur(v);
    }, 90);
    return () => window.clearInterval(id);
  }, [playing, k, tmax]);
  const play = () => {
    if (!k) return;
    if (playing) return setPlaying(false);
    if (tNow >= tmax) setCur(Math.floor(tmin / 60) * 60);
    setPlaying(true);
  };

  /* 누른 곳 근처 가장 가까운 점·원 */
  useEffect(() => {
    if (!map) return;
    const near = (x: number, y: number, r: number) => {
      const fs = map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers: ["cells", "pts", "pts-static"] });
      let best: (typeof fs)[number] | null = null;
      let bd = 1e9;
      fs.forEach((f) => {
        const c = (f.geometry as { coordinates: [number, number] }).coordinates;
        const p = map.project(c);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (f.layer.id === "cells" ? 40 : 0);
        if (d < bd) {
          bd = d;
          best = f;
        }
      });
      return best as (typeof fs)[number] | null;
    };
    const onClick = (ev: { point: { x: number; y: number } }) => {
      const touch = document.documentElement.dataset.touch === "1" || document.documentElement.dataset.device !== "web";
      const f = near(ev.point.x, ev.point.y, touch ? 22 : 10);
      if (!f) return setPop(null);
      const c = (f.geometry as { coordinates: [number, number] }).coordinates;
      setPop({ lng: c[0], lat: c[1], kind: f.layer.id === "cells" ? "cell" : "pt", i: Number((f.properties as { i: number }).i) });
    };
    const onMove = (ev: { point: { x: number; y: number } }) => {
      map.getCanvas().style.cursor = near(ev.point.x, ev.point.y, 8) ? "pointer" : "";
    };
    map.on("click", onClick);
    map.on("mousemove", onMove);
    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
    };
  }, [map]);

  const kv = (a: string, b: React.ReactNode) => (
    <div key={a}>
      <dt>{a}</dt>
      <dd>{b}</dd>
    </div>
  );
  let popBody: React.ReactNode = null;
  let popXY: { x: number; y: number } | null = null;
  if (pop && map) {
    const p = map.project([pop.lng, pop.lat]);
    popXY = { x: p.x, y: p.y };
    if (pop.kind === "pt" && k) {
      const frp = (k.frp[pop.i] as number) < 0 ? null : (k.frp[pop.i] as number);
      const sat = k.sat[pop.i] as string;
      popBody = [
        kv(T("pos"), <span className={cx("num")}>{`${fmtLat(k.la[pop.i] as number)} ${fmtLon(k.lo[pop.i] as number)}`}</span>),
        kv(T("at"), <span className={cx("num")}>{`${kst(k.t0, k.t[pop.i] as number)} KST`}</span>),
        kv(T("frp"), frp == null ? "–" : <><b className={cx("num")}>{fmtNum(lang, frp, 1)}</b> MW</>),
        kv(T("sat"), SAT_NAME[sat] ?? sat),
        kv(T("kind"), k.st?.[pop.i] ? t("map.key.static") : T(k.ref[pop.i] ? "ref" : "other")),
      ];
    } else {
      const c = o.cells[pop.i];
      if (c) popBody = [kv(T("center"), <span className={cx("num")}>{`${fmtLat(c.lat)} ${fmtLon(c.lon)}`}</span>), kv(T("value"), <b className={cx("num")}>{c.valueText}</b>), c.extra ? kv("", c.extra) : null];
    }
  }

  /* 재생 막대 축: 날짜(KST) 눈금 — 하루 간격, 8일 넘으면 이틀 */
  const a = Math.floor(tmin / 60) * 60;
  const b = Math.ceil(tmax / 60) * 60;
  const axis: { left: number; d: number }[] = [];
  if (k) {
    const d0 = Date.parse(`${k.d0}T00:00:00Z`);
    const d1 = Date.parse(`${k.d1}T00:00:00Z`);
    const nd = Math.round((d1 - d0) / 864e5) + 1;
    const every = nd > 8 ? 2 : 1;
    for (let j = 0; j < nd; j += every) {
      const tt = (d0 + j * 864e5 - (k.t0 + 9 * 3600e3)) / 60000;
      if (tt >= a && tt <= b && b > a) axis.push({ left: ((tt - a) / (b - a)) * 100, d: new Date(d0 + j * 864e5).getUTCDate() });
    }
  }
  const nNow = k ? k.t.filter((x, i) => x <= tNow && !k.st?.[i]).length : 0;
  const hasStatic = !!k?.st?.some(Boolean);

  return (
    <div className={cx("cl-dm", k && "has-case")} data-ready={map ? "1" : "0"} data-level={o.level ?? ""} data-t={k ? String(tNow) : undefined}>
      <div className={cx("cl-dmw")}>
        <div className={cx("cl-dmmap")} ref={host} role="region" aria-label={o.label} />
        <MapLoading show={!map} />
        {map ? <MapStatus kind={o.status.kind} tail={o.status.tail} vars={o.status.vars} /> : null}
        {map ? <MapKey level={o.level} win={o.win} tail={o.status.tail} nPts={(o.level === "L3" || o.level === "L4") && (o.status.kind == null || o.status.kind === "empty") ? nNow : null} staticPts={hasStatic} fmt={(n) => fmtNum(lang, n)} /> : null}
        {pop && popXY && popBody ? (
          <div className={cx("cl-popbox")} style={{ left: popXY.x, top: popXY.y }}>
            <button type="button" className={cx("cl-popx")} aria-label={t("calendar.act.close")} onClick={() => setPop(null)}>
              <X aria-hidden="true" />
            </button>
            <dl className={cx("cl-popkv")}>{popBody}</dl>
          </div>
        ) : null}
        <div className={cx("cl-dmz")}>
          <button type="button" className={cx("iconbtn")} aria-label={T("zoom_in")} onClick={() => map?.zoomIn()}>
            <Plus aria-hidden="true" />
          </button>
          <button type="button" className={cx("iconbtn")} aria-label={T("zoom_out")} onClick={() => map?.zoomOut()}>
            <Minus aria-hidden="true" />
          </button>
          <button type="button" className={cx("iconbtn")} aria-label={T("zoom_fit")} onClick={() => map?.fitBounds(fit, { padding: FIT_PADDING })}>
            <Target aria-hidden="true" />
          </button>
        </div>
      </div>
      {k ? (
        <div className={cx("cl-dmbar")}>
          <button type="button" className={cx("cl-dmplay", playing && "on")} aria-label={T(playing ? "pause" : "play")} onClick={play}>
            {playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <div className={cx("cl-dmtr")}>
            <input
              type="range"
              className={cx("cl-dmr")}
              min={a}
              max={b}
              step={60}
              value={tNow}
              aria-label={T("time")}
              onChange={(e) => {
                setPlaying(false);
                setCur(+e.target.value);
              }}
            />
            <div className={cx("cl-dmax num")} aria-hidden="true">
              {axis.map((x) => (
                <span key={x.left} style={{ left: `${x.left.toFixed(2)}%` }}>
                  {x.d}
                </span>
              ))}
            </div>
          </div>
          <div className={cx("cl-dmnow")}>
            <b className={cx("num")}>{`${kst(k.t0, tNow).slice(5)} KST`}</b>
            <span className={cx("num")}>{t("map.key.pts_n", { n: fmtNum(lang, nNow) })}</span>
          </div>
        </div>
      ) : null}
      {o.extra ? <div className={cx("cl-dmleg")}>{o.extra}</div> : null}
    </div>
  );
}
