"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useLocale } from "next-intl";
import { Minus, Play, Plus, Square, Target, X } from "lucide-react";
import { useT } from "@/shared/i18n";
import { MapLoading } from "@/shared/ui";
import type { MonthPoints } from "../api/queries";
import { fmtLat, fmtLon, fmtNum, kst, SAT_NAME, stepOf } from "../model/calendar";
import { tok } from "./bits";
import { cx } from "./cx";

/**
 * 점(원) 지도(목업 pages/calendar-dots.js · 결정 F9 · F10 ④). MapLibre 2D(기울기·회전 없음).
 * 칸 원: /cells 칸 값을 칸 중심에 원으로(색·크기 = 로그 눈금 5단계, 칸 간격 비례). 감지 점: /hotspots 그 달 점 전부, 크기 = FRP,
 * 밝기 = 재생 시각에서 지난 시간(12시간 · 2일 · 그 전). 누르면 위치·시각·FRP·위성·기준 점 여부.
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
  /** 점 자료를 받는 중(재생 막대 자리를 남긴다) */
  ptsWanted: boolean;
  focus: [number, number, number, number] | null;
  label: string;
  rampAt: (k: number) => string;
  extra?: React.ReactNode;
}

const K_R = [0.2, 0.28, 0.36, 0.44, 0.52];
const RECENT = 12 * 60;
const PX_DEG = 512 / 360;
type Pop = { lng: number; lat: number; kind: "pt" | "cell"; i: number } | null;

function boundsOf(pts: number[][], pad: number): [[number, number], [number, number]] | null {
  let w = 999;
  let s = 999;
  let e = -999;
  let n = -999;
  pts.forEach(([x, y]) => {
    w = Math.min(w, x as number);
    e = Math.max(e, x as number);
    s = Math.min(s, y as number);
    n = Math.max(n, y as number);
  });
  if (w > e) return null;
  return [
    [w - pad, s - pad],
    [e + pad, n + pad],
  ];
}

export function DotMap(o: DotMapProps) {
  const t = useT();
  const T = (k: string, v?: Record<string, string | number>) => t(`calendar.dm.${k}`, v);
  const lang = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [, setFrame] = useState(0);
  const k = o.pts && o.pts.n ? o.pts : null;
  const tmin = useMemo(() => (k ? Math.min(...k.t) : 0), [k]);
  const tmax = useMemo(() => (k ? Math.max(...k.t) : 0), [k]);
  const [cur, setCur] = useState<number | null>(null);
  const tNow = cur ?? tmax;
  const [playing, setPlaying] = useState(false);

  type BB = [[number, number], [number, number]];
  const fit = useMemo<BB>(() => {
    if (o.focus) return boundsOf([[o.focus[0], o.focus[1]], [o.focus[2], o.focus[3]]], 0.02) ?? [[124, 33], [131, 39]];
    const outPts: number[][] = [];
    o.outlines.forEach((r) => r.forEach((q) => outPts.push(q)));
    const cellPts = o.cells.map((c) => [c.lon, c.lat]);
    const kPts = k ? k.lo.map((x, i) => [x, k.la[i] as number]) : [];
    return boundsOf(outPts.length ? outPts : cellPts.length ? cellPts : kPts, o.size * 0.6) ?? [[124, 33], [131, 39]];
  }, [o.focus, o.outlines, o.cells, o.size, k]);

  /* 작은 섬(몰디브·세이셸처럼 맞춘 범위에 비해 윤곽이 몇 화소도 안 되는 고리) — 윤곽 선만으로는 안 보여 고리 가운데에 빈 원 표시 */
  const islands = useMemo(() => {
    const span = Math.max(fit[1][0] - fit[0][0], fit[1][1] - fit[0][1]);
    const out: number[][] = [];
    o.outlines.forEach((r) => {
      const b = boundsOf(r, 0);
      if (!b) return;
      if (Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) < span / 60) out.push([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]);
    });
    return out;
  }, [o.outlines, fit]);

  /* 지도(한 번) */
  useEffect(() => {
    let dead = false;
    let made: MlMap | null = null;
    let ro: ResizeObserver | null = null;
    void import("maplibre-gl").then((ml) => {
      if (dead || !host.current) return;
      const m = new ml.Map({
        container: host.current,
        attributionControl: false,
        bounds: fit,
        fitBoundsOptions: { padding: 16 },
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
            outf: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
            outl: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
            isl: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
            cells: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
            pts: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": tok("map-sea") } },
            { id: "land", type: "fill", source: "land", paint: { "fill-color": tok("map-land") } },
            /* 고른 지역의 자세한 윤곽(outl 과 같은 고리)으로 육지를 한 번 더 채운다 — 단순한 world.json 면 밖으로 윤곽선이 삐져나가거나
               world.json 에 없는 작은 섬이 선만 남는 것을 막는다(프런트 UI/UX, 2026-11-15) */
            { id: "outf", type: "fill", source: "outf", paint: { "fill-color": tok("map-land") } },
            { id: "outl", type: "line", source: "outl", paint: { "line-color": tok("map-boundary"), "line-opacity": 0.5, "line-width": 0.8 } },
            { id: "isl", type: "circle", source: "isl", paint: { "circle-radius": 4, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 1, "circle-stroke-color": tok("map-boundary"), "circle-stroke-opacity": 0.8 } },
            { id: "cells", type: "circle", source: "cells", paint: { "circle-radius": 2, "circle-color": "#000", "circle-stroke-width": 0 } },
            { id: "pts", type: "circle", source: "pts", paint: { "circle-stroke-width": 0, "circle-opacity": 0.85, "circle-radius": 2 } },
          ],
        },
      });
      made = m;
      m.touchZoomRotate.disableRotation();
      m.on("load", () => setMap(m));
      m.on("move", () => setFrame((n) => n + 1));
      ro = new ResizeObserver(() => m.resize());
      ro.observe(host.current);
    });
    return () => {
      dead = true;
      ro?.disconnect();
      made?.remove();
    };
    // fit 은 처음 한 번만(달이 바뀌면 부모가 key 로 다시 만든다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 윤곽 */
  useEffect(() => {
    if (!map) return;
    (map.getSource("outl") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: o.outlines.length ? [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: o.outlines } }] : [] });
    /* 같은 고리를 면으로(닫힌 고리 · 점 3개 미만은 뺀다) */
    const polys = o.outlines.filter((r) => r.length >= 3).map((r) => {
      const a = r[0] as number[];
      const z = r[r.length - 1] as number[];
      return [a[0] === z[0] && a[1] === z[1] ? r : [...r, a]];
    });
    (map.getSource("outf") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: polys.length ? [{ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: polys } }] : [] });
    (map.getSource("isl") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: islands.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } })) });
  }, [map, o.outlines, islands]);

  /* 칸 원: 반지름 = 칸 간격 비례(줌마다 2배) · 색 = 단계 */
  const { cells, size, rampAt, ptsWanted } = o;
  useEffect(() => {
    if (!map) return;
    (map.getSource("cells") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: cells.map((c, i) => ({ type: "Feature", id: i, properties: { i, k: stepOf(c.value) }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } })),
    });
    const kx = ["match", ["get", "k"], 0, K_R[0], 1, K_R[1], 2, K_R[2], 3, K_R[3], K_R[4]];
    map.setPaintProperty("cells", "circle-radius", ["interpolate", ["exponential", 2], ["zoom"], 0, ["*", kx, size * PX_DEG], 16, ["*", kx, size * PX_DEG * 65536]]);
    map.setPaintProperty("cells", "circle-color", ["match", ["get", "k"], 0, rampAt(0), 1, rampAt(1), 2, rampAt(2), 3, rampAt(3), rampAt(4)]);
    map.setPaintProperty("cells", "circle-opacity", ptsWanted ? 0.32 : 0.78);
  }, [map, cells, size, rampAt, ptsWanted]);

  /* 감지 점 */
  useEffect(() => {
    if (!map) return;
    const f = k ? k.la.map((la, i) => ({ type: "Feature" as const, id: i, properties: { i, t: k.t[i], frp: Math.max(0, k.frp[i] as number), ref: k.ref[i] }, geometry: { type: "Point" as const, coordinates: [k.lo[i] as number, la] } })) : [];
    (map.getSource("pts") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: f });
    const frpR = (s: number) => ["interpolate", ["linear"], ["get", "frp"], 0, 1.4 * s, 20, 2.2 * s, 100, 3.4 * s, 500, 5.2 * s];
    map.setPaintProperty("pts", "circle-radius", ["interpolate", ["exponential", 2], ["zoom"], 8, frpR(1), 12, frpR(3.2)]);
  }, [map, k]);
  useEffect(() => {
    if (!map || !k) return;
    map.setFilter("pts", ["<=", ["get", "t"], tNow]);
    map.setPaintProperty("pts", "circle-color", ["case", ["<", ["-", tNow, ["get", "t"]], RECENT], tok("h6"), ["<", ["-", tNow, ["get", "t"]], RECENT * 4], tok("h4"), tok("h2")]);
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
      const fs = map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers: ["cells", "pts"] });
      let best: (typeof fs)[number] | null = null;
      let bd = 1e9;
      fs.forEach((f) => {
        const c = (f.geometry as { coordinates: [number, number] }).coordinates;
        const p = map.project(c);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (f.layer.id === "pts" ? 0 : 40);
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
      setPop({ lng: c[0], lat: c[1], kind: f.layer.id === "pts" ? "pt" : "cell", i: Number((f.properties as { i: number }).i) });
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
        kv(T("kind"), T(k.ref[pop.i] ? "ref" : "other")),
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
  const nNow = k ? k.t.filter((x) => x <= tNow).length : 0;
  const lab = ["<1", "1", "10", "100", "1k+"];

  return (
    <div className={cx("cl-dm", k && "has-case")} data-ready={map ? "1" : "0"} data-t={k ? String(tNow) : undefined}>
      <div className={cx("cl-dmw")}>
        <div className={cx("cl-dmmap")} ref={host} role="region" aria-label={o.label} />
        <MapLoading show={!map} />
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
          <button type="button" className={cx("iconbtn")} aria-label={T("zoom_fit")} onClick={() => map?.fitBounds(fit, { padding: 16 })}>
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
            <span className={cx("num")}>{T("pts_n", { n: fmtNum(lang, nNow) })}</span>
          </div>
        </div>
      ) : null}
      <div className={cx("cl-dmleg")}>
        <span className={cx("cl-dmlg")}>
          <em>{T(o.ptsWanted ? "cells_month" : "cells")}</em>
          {lab.map((l, j) => (
            <span key={l}>
              <i className={cx("cl-dot")} style={{ ["--d" as string]: `${6 + j * 3}px`, ["--c" as string]: o.rampAt(j) }} />
              <span className={cx("num")}>{l}</span>
            </span>
          ))}
        </span>
        {k ? (
          <span className={cx("cl-dmlg")}>
            <em>{T("pts")}</em>
            <span>
              <i className={cx("cl-dot")} style={{ ["--d" as string]: "9px", ["--c" as string]: "var(--h6)" }} />
              {T("age0")}
            </span>
            <span>
              <i className={cx("cl-dot")} style={{ ["--d" as string]: "9px", ["--c" as string]: "var(--h4)" }} />
              {T("age1")}
            </span>
            <span>
              <i className={cx("cl-dot")} style={{ ["--d" as string]: "9px", ["--c" as string]: "var(--h2)" }} />
              {T("age2")}
            </span>
          </span>
        ) : null}
        {o.extra}
        {o.pts ? (
          <>
            {o.pts.n ? null : <span className={cx("cl-dmnote num")}>{T("pts_n", { n: 0 })}</span>}
            {o.pts.note ? <span className={cx("cl-dmnote")}>{o.pts.note}</span> : null}
          </>
        ) : !o.ptsWanted ? (
          <span className={cx("cl-dmnote")}>{T("pts_pending")}</span>
        ) : null}
      </div>
    </div>
  );
}
